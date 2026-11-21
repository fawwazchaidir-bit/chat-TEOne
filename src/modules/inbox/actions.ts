/**
 * Tindakan inbox: balasan manual, catatan internal, status AI/pengambilalihan, penugasan, pengalihan antartim, penanda Lead Nyasar.
 * Semua memeriksa akses PERCAKAPAN di server (kanal atau tim tujuan), idempoten/optimistis terhadap benturan, dan teraudit.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { channels, contactIdentities, conversationNotes, conversationTeamAccess, conversations, messages, teamChannels, teamMembers, teams, users } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, conflict, forbidden } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import { requireFeature } from "@/modules/feature-flags";
import {
  asResult, byKey, evaluateWindow, executeSend, getConversationForAction, maskIdentity, recipientAllowed, setAiState, validateSendInput,
  type AiActor, type AiChange, type SendInput, type SendResult,
} from "@/modules/conversations-messages";
import { getConnectionRow, getMetaConfig } from "@/modules/whatsapp-adapter";
import { loadPermissionSet } from "@/modules/roles-permissions/loader";
import type { Ctx } from "@/modules/shared/context";

const aiActor = (ctx: Ctx): AiActor => ({ audit: auditFor(ctx), actorId: ctx.user.id, label: ctx.user.email });

// ───────────── Balasan manual ─────────────
export type ReplyInput = { kind: "text" | "image" | "document"; text?: string; caption?: string; file?: SendInput["file"]; idempotencyKey: string };

/**
 * Balasan admin dari inbox. Urutan penting (CCP 3.3 / 3.5):
 *  1. akses `reply` + validasi + kebijakan penerima (daftar uji di non-production / mode uji);
 *  2. TITIK KOMIT (satu transaksi, percakapan dikunci): idempotensi → jendela layanan → catat pesan `diproses` → AI Off ("admin membalas");
 *     klik ganda ⇒ transaksi kedua menemukan kunci yang sama ⇒ hasil yang sama, tanpa pesan/transisi ganda;
 *  3. panggilan Meta tepat satu kali. AI TETAP Off walaupun pengiriman gagal/belum pasti.
 * Balasan yang diblokir sebelum komit (jendela tertutup, validasi) tidak membuat pesan dan tidak mengubah status AI.
 */
export async function replyToConversation(ctx: Ctx, conversationId: string, input: ReplyInput): Promise<SendResult & { aiStatus: string; aiVersion: number }> {
  await requireFeature("inbox");
  await requireFeature("whatsapp_connector");
  const conv = await getConversationForAction(ctx, conversationId, "reply");
  validateSendInput({ channelId: conv.channelId, to: "x", ...input });
  const db = getDb();
  const [ch] = await db.select().from(channels).where(eq(channels.id, conv.channelId));
  if (ch?.archivedAt) throw badRequest("Channel diarsipkan.", undefined, "CHANNEL_ARCHIVED");
  const conn = await getConnectionRow(conv.channelId);
  if (!conn) throw conflict("KONEKSI_BELUM_DIKONFIGURASI", "Koneksi Meta untuk channel ini belum dikonfigurasi.");
  if (!getMetaConfig().accessToken) throw conflict("META_BELUM_DIKONFIGURASI", "Token akses Meta belum diisi di environment (META_ACCESS_TOKEN).");
  const [idn] = await db.select({ v: contactIdentities.identityValue }).from(contactIdentities).where(and(eq(contactIdentities.contactId, conv.contactId), eq(contactIdentities.identityType, "wa_id")));
  if (!idn) throw conflict("KONTAK_TANPA_NOMOR_WA", "Kontak ini tidak memiliki identitas WhatsApp yang dapat dibalas.");
  const to = idn.v;
  if (!(await recipientAllowed(db, conn, to))) {
    await writeAudit(db, { ...auditFor(ctx), action: "inbox.send_blocked", result: "denied", objectType: "conversation", objectId: conversationId, metadata: { reason: "penerima_di_luar_daftar_uji", to: maskIdentity(to) } });
    throw forbidden("Penerima tidak ada di daftar penerima uji (lingkungan non-production / mode uji).", "RECIPIENT_NOT_ALLOWED");
  }

  const key = input.idempotencyKey;
  const dupOf = async (): Promise<(SendResult & { aiStatus: string; aiVersion: number }) | null> => {
    const ex = await byKey(key);
    if (!ex) return null;
    if (ex.conversationId !== conversationId) throw conflict("IDEMPOTENCY_KEY_REUSED", "Kunci idempotensi sudah dipakai untuk percakapan lain.");
    const [c] = await db.select({ s: conversations.aiStatus, v: conversations.aiVersion }).from(conversations).where(eq(conversations.id, conversationId));
    return { ...asResult(ex, true), aiStatus: c?.s ?? "off", aiVersion: c?.v ?? 0 };
  };
  const early = await dupOf();
  if (early) return early;

  const commit = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).for("update");
    if (!locked) throw forbidden();
    const [exists] = await tx.select().from(messages).where(eq(messages.idempotencyKey, key));
    if (exists) return { duplicate: true as const };
    const win = evaluateWindow(locked.lastCustomerMessageAt);
    if (!win.open) {
      await writeAudit(getDb(), { ...auditFor(ctx), action: "inbox.send_blocked", result: "denied", objectType: "conversation", objectId: conversationId, metadata: { reason: win.reason, to: maskIdentity(to) } });
      throw conflict("WINDOW_CLOSED", win.message, { reason: win.reason, closesAt: win.closesAt?.toISOString() ?? null });
    }
    const body = input.kind === "text" ? (input.text as string) : (input.caption ?? null);
    const [ins] = await tx.insert(messages).values({ conversationId, channelId: conv.channelId, direction: "keluar", source: "te_one", type: input.kind, body, status: "diproses", idempotencyKey: key, createdBy: ctx.user.id }).returning({ id: messages.id });
    const ai = await setAiState(tx, conversationId, { to: "off", reason: "admin_membalas" }, aiActor(ctx), { locked });
    return { duplicate: false as const, messageId: (ins as { id: string }).id, ai: ai.state };
  });
  if (commit.duplicate) return (await dupOf()) as SendResult & { aiStatus: string; aiVersion: number };

  const res = await executeSend({
    messageId: commit.messageId, channelId: conv.channelId, conversationId, conn, to, kind: input.kind, text: input.text, caption: input.caption, file: input.file,
    idempotencyKey: key, actor: auditFor(ctx), auditObject: "inbox",
  });
  return { ...res, aiStatus: commit.ai.status, aiVersion: commit.ai.version };
}

// ───────────── Catatan internal ─────────────
export async function addNote(ctx: Ctx, conversationId: string, body: string) {
  await requireFeature("inbox");
  const conv = await getConversationForAction(ctx, conversationId, "note");
  const text = body.trim();
  if (!text || text.length > 2000) throw badRequest("Catatan wajib diisi (maks. 2000 karakter).", undefined, "VALIDATION_ERROR");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [n] = await tx.insert(conversationNotes).values({ conversationId, channelId: conv.channelId, authorId: ctx.user.id, body: text }).returning();
    await writeAudit(tx, { ...auditFor(ctx), action: "conversation.note_added", objectType: "conversation", objectId: conversationId, metadata: { length: text.length } }); // isi catatan tidak masuk audit
    return { id: (n as { id: string }).id, body: text, authorId: ctx.user.id, at: (n as { createdAt: Date }).createdAt.toISOString() };
  });
}

// ───────────── Status AI / pengambilalihan ─────────────
export type AiActionName = "ambil_alih" | "matikan" | "aktifkan" | "eskalasi" | "kill_switch";
const AI_ACTIONS: Record<AiActionName, AiChange> = {
  ambil_alih: { to: "off", reason: "admin_mengambil_alih" }, matikan: { to: "off", reason: "manual" }, aktifkan: { to: "aktif" },
  eskalasi: { to: "off", reason: "eskalasi" }, kill_switch: { to: "off", reason: "kill_switch" },
};

export async function aiAction(ctx: Ctx, conversationId: string, action: AiActionName, expectedVersion: number | null) {
  await requireFeature("inbox");
  await getConversationForAction(ctx, conversationId, "ai");
  const change = AI_ACTIONS[action];
  if (!change) throw badRequest("Aksi AI tidak dikenal.", undefined, "VALIDATION_ERROR");
  return getDb().transaction(async (tx) => {
    const r = await setAiState(tx, conversationId, change, aiActor(ctx), { expectedVersion });
    if (action === "eskalasi") {
      await tx.update(conversations).set({ escalatedAt: new Date() }).where(and(eq(conversations.id, conversationId), isNull(conversations.escalatedAt)));
      await writeAudit(tx, { ...auditFor(ctx), action: "conversation.escalated", objectType: "conversation", objectId: conversationId });
    }
    return { changed: r.changed, ai: r.state };
  });
}

// ───────────── Penugasan & pengalihan ─────────────
const conflictAudit = (ctx: Ctx, conversationId: string, expected: number, current: number) =>
  writeAudit(getDb(), { ...auditFor(ctx), action: "conversation.assign_conflict", objectType: "conversation", objectId: conversationId, result: "denied", metadata: { expected, current } });

/** Mengubah tim (yang terhubung ke channel) dan/atau PIC chat. `expectedVersion` wajib: dua admin yang mengubah bersamaan → yang kedua 409 + teraudit. */
export async function assignConversation(ctx: Ctx, conversationId: string, patch: { teamId?: string | null; assigneeId?: string | null; expectedVersion: number }) {
  await requireFeature("inbox");
  const conv = await getConversationForAction(ctx, conversationId, "assign");
  const db = getDb();
  let cur: typeof conversations.$inferSelect | undefined;
  const result = await db.transaction(async (tx) => {
    [cur] = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).for("update");
    if (!cur) throw forbidden();
    if (cur.assignVersion !== patch.expectedVersion) return { conflict: cur.assignVersion };
    const teamId = patch.teamId === undefined ? cur.teamId : patch.teamId;
    const assigneeId = patch.assigneeId === undefined ? cur.assigneeId : patch.assigneeId;
    if (patch.teamId) {
      const [t] = await tx.select({ id: teams.id, active: teams.isActive }).from(teams).where(eq(teams.id, patch.teamId));
      if (!t || !t.active) throw badRequest("Tim tidak ditemukan atau nonaktif.", undefined, "TEAM_INVALID");
      const [link] = await tx.select().from(teamChannels).where(and(eq(teamChannels.teamId, patch.teamId), eq(teamChannels.channelId, conv.channelId)));
      if (!link) throw badRequest("Tim itu belum terhubung ke channel ini. Gunakan 'Alihkan' untuk tim lain.", undefined, "TEAM_NOT_LINKED");
    }
    if (assigneeId) {
      const [u] = await tx.select({ id: users.id, status: users.status, sa: users.isSuperAdmin }).from(users).where(eq(users.id, assigneeId));
      if (!u || u.status !== "active") throw badRequest("PIC tidak ditemukan atau nonaktif.", undefined, "ASSIGNEE_INVALID");
      if (teamId) {
        const [m] = await tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, assigneeId)));
        if (!m) throw badRequest("PIC harus anggota tim yang dipilih.", undefined, "ASSIGNEE_NOT_IN_TEAM");
      } else {
        const perms = await loadPermissionSet(tx, u.id, u.sa);
        if (!perms.can("chat.reply", conv.channelId)) throw badRequest("PIC tidak memiliki izin membalas di channel ini.", undefined, "ASSIGNEE_NOT_ALLOWED");
      }
    }
    await tx.update(conversations).set({ teamId, assigneeId, assignVersion: cur.assignVersion + 1 }).where(eq(conversations.id, conversationId));
    await writeAudit(tx, { ...auditFor(ctx), action: "conversation.assigned", objectType: "conversation", objectId: conversationId, metadata: { from: { teamId: cur.teamId, assigneeId: cur.assigneeId }, to: { teamId, assigneeId }, version: cur.assignVersion + 1 } });
    return { version: cur.assignVersion + 1, teamId, assigneeId };
  });
  if ("conflict" in result) {
    await conflictAudit(ctx, conversationId, patch.expectedVersion, result.conflict as number);
    throw conflict("ASSIGN_CONFLICT", "Penugasan percakapan ini sudah diubah oleh pengguna lain. Muat ulang lalu coba lagi.", { currentVersion: result.conflict });
  }
  return result;
}

/**
 * Mengalihkan percakapan ke tim lain DI PERCAKAPAN YANG SAMA (D-22, ASUMSI). Anggota tim tujuan mendapat akses ke PERCAKAPAN INI SAJA —
 * bukan seluruh channel (kontrak inti #1). Akses tim sebelumnya dicabut; seluruh perubahan teraudit.
 */
export async function transferConversation(ctx: Ctx, conversationId: string, p: { teamId: string; strayLead?: boolean; note?: string; expectedVersion: number }) {
  await requireFeature("inbox");
  await getConversationForAction(ctx, conversationId, "transfer");
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).for("update");
    if (!cur) throw forbidden();
    if (cur.assignVersion !== p.expectedVersion) return { conflict: cur.assignVersion };
    const [t] = await tx.select({ id: teams.id, name: teams.name, active: teams.isActive }).from(teams).where(eq(teams.id, p.teamId));
    if (!t || !t.active) throw badRequest("Tim tujuan tidak ditemukan atau nonaktif.", undefined, "TEAM_INVALID");
    if (cur.teamId === p.teamId) throw badRequest("Percakapan sudah berada di tim itu.", undefined, "SAME_TEAM");
    const now = new Date();
    await tx.update(conversationTeamAccess).set({ revokedAt: now, revokedBy: ctx.user.id }).where(and(eq(conversationTeamAccess.conversationId, conversationId), isNull(conversationTeamAccess.revokedAt)));
    await tx.insert(conversationTeamAccess).values({ conversationId, teamId: p.teamId, grantedBy: ctx.user.id });
    let assigneeId = cur.assigneeId;
    if (assigneeId) {
      const [m] = await tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, p.teamId), eq(teamMembers.userId, assigneeId)));
      if (!m) assigneeId = null; // PIC lama bukan anggota tim tujuan → dilepas
    }
    await tx.update(conversations).set({ teamId: p.teamId, assigneeId, assignVersion: cur.assignVersion + 1, ...(p.strayLead ? { strayLead: true } : {}) }).where(eq(conversations.id, conversationId));
    await writeAudit(tx, { ...auditFor(ctx), action: "conversation.transferred", objectType: "conversation", objectId: conversationId, metadata: { fromTeamId: cur.teamId, toTeamId: p.teamId, strayLead: !!p.strayLead, note: p.note?.slice(0, 300) ?? null, version: cur.assignVersion + 1 } });
    return { version: cur.assignVersion + 1, teamId: p.teamId, teamName: t.name, assigneeId };
  });
  if ("conflict" in result) {
    await conflictAudit(ctx, conversationId, p.expectedVersion, result.conflict as number);
    throw conflict("ASSIGN_CONFLICT", "Penugasan percakapan ini sudah diubah oleh pengguna lain. Muat ulang lalu coba lagi.", { currentVersion: result.conflict });
  }
  return result;
}

/** Penanda manual "Lead Nyasar" (deteksi otomatis = Tahap 4). */
export async function setStrayLead(ctx: Ctx, conversationId: string, value: boolean) {
  await requireFeature("inbox");
  await getConversationForAction(ctx, conversationId, "assign");
  await getDb().transaction(async (tx) => {
    await tx.update(conversations).set({ strayLead: value }).where(eq(conversations.id, conversationId));
    await writeAudit(tx, { ...auditFor(ctx), action: "conversation.stray_lead", objectType: "conversation", objectId: conversationId, metadata: { value } });
  });
  return { strayLead: value };
}

/** Mengosongkan penanda "perlu ditinjau" (urutan tak pasti) — tindakan manusia yang teraudit. */
export async function clearReview(ctx: Ctx, conversationId: string) {
  await requireFeature("inbox");
  await getConversationForAction(ctx, conversationId, "reply");
  await getDb().transaction(async (tx) => {
    await tx.update(conversations).set({ reviewFlag: null }).where(and(eq(conversations.id, conversationId), sql`${conversations.reviewFlag} IS NOT NULL`));
    await writeAudit(tx, { ...auditFor(ctx), action: "conversation.review_cleared", objectType: "conversation", objectId: conversationId });
  });
  return { ok: true };
}

