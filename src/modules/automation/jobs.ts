/**
 * Pipeline otomatisasi ber-guard (kontrak inti #6 dan #7; ADR-0008). Tahap 3: HANYA job SIMULASI `ai_sim` (AI nyata = Tahap 4,
 * follow-up = Tahap 6; keduanya akan memakai pipeline yang sama).
 *
 * Titik komit pengiriman: dalam SATU transaksi dengan baris percakapan DIKUNCI, semua kondisi terbaru diperiksa dan baris pesan
 * `diproses` dicatat. Pengambilalihan admin memakai kunci yang sama, sehingga hanya satu yang menang:
 *   • admin lebih dulu → versi AI berubah → job DIBATALKAN (0 pesan AI terkirim);
 *   • job lebih dulu → pesan tercatat → ditampilkan jujur sebagai "sedang dikirim / belum pasti" (tidak dijanjikan dapat dibatalkan).
 * Kill switch (global/channel/fitur) diperiksa di titik komit DAN sekali lagi tepat sebelum panggilan Meta.
 */
import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { automationJobs, contactIdentities, conversations, messages } from "@/db/schema";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { safeErrorLabel } from "@/lib/safe-error";
import { writeAudit } from "@/modules/audit";
import { isFeatureEnabled } from "@/modules/feature-flags";
import { checkAutomation } from "@/modules/kill-switch";
import { evaluateEligibility, evaluateWindow, executeSend, isListedRecipient, recipientAllowed } from "@/modules/conversations-messages";
import { getConnectionRow, getMetaConfig } from "@/modules/whatsapp-adapter";

export const SIM_TEXT = "[SIMULASI] Terima kasih, pesan Anda sudah kami terima. Ini balasan uji otomatis, bukan balasan AI sungguhan.";
const MAX_ATTEMPTS = 3;
const ACTOR = { actorLabel: "sistem:ai-simulasi" } as const;

type Job = typeof automationJobs.$inferSelect;

async function setJob(id: string, patch: Partial<Pick<Job, "status" | "statusReason" | "outboundMessageId">>) {
  await getDb().update(automationJobs).set({ ...patch, updatedAt: new Date(), lockedUntil: null }).where(eq(automationJobs.id, id));
}

async function cancelJob(job: Job, reason: string, result: "denied" | "failure" = "denied") {
  await setJob(job.id, { status: "dibatalkan", statusReason: reason });
  await writeAudit(getDb(), { ...ACTOR, action: "automation.job_cancelled", objectType: "automation_job", objectId: job.id, result, metadata: { reason, conversationId: job.conversationId, kind: job.kind } });
  return { status: "dibatalkan" as const, reason };
}

/** Membuat job simulasi untuk pesan pemicu (idempoten: UNIQUE(kind, trigger_message_id)). Mengembalikan id job baru atau null. */
export async function createSimJob(c: { id: string; channelId: string; aiVersion: number }, triggerMessageId: string): Promise<string | null> {
  const delay = getEnv().AI_SIM_DELAY_MS;
  const [row] = await getDb().insert(automationJobs).values({
    kind: "ai_sim", conversationId: c.id, channelId: c.channelId, triggerMessageId, aiVersion: c.aiVersion, feature: "ai_reply",
    payload: { text: SIM_TEXT }, runAfter: sql`now() + (${delay} * interval '1 millisecond')`,
  }).onConflictDoNothing({ target: [automationJobs.kind, automationJobs.triggerMessageId] }).returning({ id: automationJobs.id });
  return row?.id ?? null;
}

export async function runAutomationJob(jobId: string): Promise<{ status: string; reason?: string }> {
  const db = getDb();
  const [job] = await db.update(automationJobs)
    .set({ status: "diproses", attempts: sql`${automationJobs.attempts} + 1`, lockedUntil: sql`now() + interval '2 minutes'`, updatedAt: new Date() })
    .where(and(eq(automationJobs.id, jobId), eq(automationJobs.status, "menunggu"), lte(automationJobs.runAfter, sql`now()`))).returning();
  if (!job) return { status: "tidak_diklaim" };

  try {
    if (!(await isFeatureEnabled("ai_simulation"))) return await cancelJob(job, "fitur_mati");
    const conn = await getConnectionRow(job.channelId);
    if (!conn) return await cancelJob(job, "koneksi_belum_dikonfigurasi");
    if (!getMetaConfig().accessToken) return await cancelJob(job, "meta_belum_dikonfigurasi");

    // ── TITIK KOMIT: kondisi terbaru diperiksa + pesan dicatat dalam satu transaksi, percakapan dikunci ──
    const decision = await db.transaction(async (tx) => {
      const [conv] = await tx.select().from(conversations).where(eq(conversations.id, job.conversationId)).for("update");
      if (!conv) return { cancel: "percakapan_tidak_ada" };
      const ks = await checkAutomation({ channelId: conv.channelId, feature: job.feature, chatId: conv.id }, tx); // global · channel · fitur · chat
      if (ks.blocked) return { cancel: `kill_switch:${ks.by}` };
      if (conv.aiStatus !== "aktif") return { cancel: "ai_off" };
      if (conv.aiVersion !== job.aiVersion) return { cancel: "versi_berubah" };
      const [m] = await tx.select().from(messages).where(eq(messages.id, job.triggerMessageId));
      if (!m) return { cancel: "pesan_pemicu_tidak_ada" };
      const el = evaluateEligibility({ aiStatus: conv.aiStatus, aiBoundaryAt: conv.aiBoundaryAt, message: { source: m.source, direction: m.direction, isHistory: m.isHistory, providerTs: m.providerTs } });
      if (!el.eligible) return { cancel: `tidak_layak:${el.reason}` };
      if (!evaluateWindow(conv.lastCustomerMessageAt).open) return { cancel: "jendela_tertutup" };
      const [idn] = await tx.select({ v: contactIdentities.identityValue }).from(contactIdentities).where(and(eq(contactIdentities.contactId, conv.contactId), eq(contactIdentities.identityType, "wa_id")));
      if (!idn) return { cancel: "tanpa_identitas_wa" };
      if (!(await recipientAllowed(tx, conn, idn.v))) return { cancel: "penerima_di_luar_daftar_uji" };
      const key = `job-${job.id}`;
      const ins = await tx.insert(messages).values({ conversationId: conv.id, channelId: conv.channelId, direction: "keluar", source: "ai", type: "text", body: (job.payload as { text: string }).text, status: "diproses", idempotencyKey: key })
        .onConflictDoNothing({ target: messages.idempotencyKey }).returning({ id: messages.id });
      if (ins.length === 0) return { cancel: "sudah_dikirim_sebelumnya" };
      const messageId = (ins[0] as { id: string }).id;
      await tx.update(automationJobs).set({ status: "dikirim", outboundMessageId: messageId, updatedAt: new Date(), lockedUntil: null }).where(eq(automationJobs.id, job.id));
      return { send: { messageId, to: idn.v, conversationId: conv.id, key } };
    });
    if ("cancel" in decision) return await cancelJob(job, decision.cancel!);

    // ── Panggilan Meta: tepat satu kali; kill switch diperiksa LAGI tepat sebelum kirim ──
    const { messageId, to, conversationId, key } = decision.send;
    const res = await executeSend({
      messageId, channelId: job.channelId, conversationId, conn, to, kind: "text", text: (job.payload as { text: string }).text, idempotencyKey: key,
      actor: ACTOR, auditObject: "automation",
      preSend: async () => ((await checkAutomation({ channelId: job.channelId, feature: job.feature, chatId: conversationId })).blocked ? "kill_switch" : null),
    });
    const status = res.status === "belum_pasti" ? "belum_pasti" : res.status === "gagal" ? (res.errorCategory === "kill_switch" ? "dibatalkan" : "gagal") : "selesai";
    await setJob(job.id, { status, statusReason: res.errorCategory ?? null });
    return { status, reason: res.errorCategory ?? undefined };
  } catch (e) {
    await setJob(job.id, { status: job.attempts >= MAX_ATTEMPTS ? "gagal" : "menunggu", statusReason: `galat:${safeErrorLabel(e)}` });
    return { status: "galat", reason: safeErrorLabel(e) };
  }
}

/** Menjalankan job yang sudah jatuh tempo + memulihkan job yang tertahan karena proses mati. Dipanggil worker/pemeliharaan. */
export async function runDueAutomationJobs(limit = 20): Promise<{ ran: number; recovered: number }> {
  const db = getDb();
  // Job `diproses` yang kuncinya habis dan BELUM mencatat pesan: aman dijalankan ulang (belum ada yang terkirim).
  const rec = await db.update(automationJobs).set({ status: "menunggu", statusReason: "dipulihkan", lockedUntil: null, updatedAt: new Date() })
    .where(and(eq(automationJobs.status, "diproses"), lt(automationJobs.lockedUntil, sql`now()`), sql`${automationJobs.outboundMessageId} IS NULL`, lt(automationJobs.attempts, MAX_ATTEMPTS))).returning({ id: automationJobs.id });
  await db.update(automationJobs).set({ status: "gagal", statusReason: "terlalu_banyak_percobaan", lockedUntil: null, updatedAt: new Date() })
    .where(and(eq(automationJobs.status, "diproses"), lt(automationJobs.lockedUntil, sql`now()`), sql`${automationJobs.outboundMessageId} IS NULL`));
  // Job `dikirim` yang pesannya sudah punya hasil (proses mati sebelum job diperbarui): selaraskan statusnya dengan bukti pesan.
  const sent = await db.select({ id: automationJobs.id, ms: messages.status, cat: messages.errorCategory }).from(automationJobs).innerJoin(messages, eq(messages.id, automationJobs.outboundMessageId))
    .where(and(eq(automationJobs.status, "dikirim"), lt(automationJobs.updatedAt, sql`now() - interval '30 seconds'`), inArray(messages.status, ["diterima_api", "terkirim", "diterima", "dibaca", "gagal", "belum_pasti"])));
  for (const s of sent) await setJob(s.id, { status: s.ms === "gagal" ? "gagal" : s.ms === "belum_pasti" ? "belum_pasti" : "selesai", statusReason: s.cat });
  const due = await db.select({ id: automationJobs.id }).from(automationJobs).where(and(eq(automationJobs.status, "menunggu"), lte(automationJobs.runAfter, sql`now()`))).orderBy(automationJobs.createdAt).limit(limit);
  let ran = 0;
  for (const d of due) { const r = await runAutomationJob(d.id); if (r.status !== "tidak_diklaim") ran++; }
  return { ran, recovered: rec.length };
}

export { isListedRecipient };
