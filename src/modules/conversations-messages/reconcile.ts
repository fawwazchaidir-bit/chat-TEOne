/**
 * Rekonsiliasi pesan keluar berstatus `belum_pasti` (kontrak inti #5). TIDAK PERNAH mengirim ulang.
 *  - Otomatis: bila status webhook yang membawa `biz_opaque_callback_data` (= kunci idempotensi kita) sudah tercatat, ID provider ditautkan.
 *  - Manual: operator yang berizin memeriksa di ponsel peserta uji, lalu menandai `terkirim`/`gagal` (teraudit, dengan catatan).
 */
import { and, eq, isNull, lt } from "drizzle-orm";
import { messageStatusEvents, messages } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import type { Ctx } from "@/modules/shared/context";
import { getMetaConfig } from "@/modules/whatsapp-adapter";
import { applyStatusesToMessage } from "./status";

/**
 * `diproses` yang tertahan (G2-A06): proses mati setelah baris dicatat — sebelum ATAU sesudah panggilan Meta. Tidak dapat dibedakan
 * dari yang masih berjalan kecuali dari umur, sehingga yang melewati ambang dijadikan `belum_pasti` (hasil tidak diketahui) agar masuk
 * rekonsiliasi (opaque) / penyelesaian manual teraudit. TIDAK PERNAH mengirim ulang. Ambang > timeout HTTP × beberapa panggilan berurutan.
 */
export const processingStaleMs = () => Math.max(120_000, 4 * getMetaConfig().timeoutMs);
export async function expireStaleProcessing(now: Date = new Date(), maxAgeMs: number = processingStaleMs()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - maxAgeMs);
  return db.transaction(async (tx) => {
    // UPDATE bersyarat + RETURNING: dua pekerja bersamaan tidak menggandakan penandaan maupun audit.
    const rows = await tx.update(messages).set({ status: "belum_pasti", errorCategory: "proses_terhenti", statusUpdatedAt: now })
      .where(and(eq(messages.direction, "keluar"), eq(messages.status, "diproses"), isNull(messages.providerMessageId), lt(messages.receivedAt, cutoff)))
      .returning({ id: messages.id });
    for (const r of rows) await writeAudit(tx, { actorLabel: "sistem:rekonsiliasi", action: "integration.processing_expired", objectType: "message", objectId: r.id, result: "failure", metadata: { maxAgeMs } });
    return rows.length;
  });
}

export async function reconcileUncertain(now: Date = new Date(), minAgeMs = 60_000): Promise<{ resolved: number; stillUncertain: number; expired: number }> {
  const db = getDb();
  const expired = await expireStaleProcessing(now);
  const rows = await db.select().from(messages).where(and(eq(messages.status, "belum_pasti"), isNull(messages.providerMessageId), lt(messages.receivedAt, new Date(now.getTime() - minAgeMs))));
  let resolved = 0;
  for (const m of rows) {
    if (!m.idempotencyKey) continue;
    const [ev] = await db.select().from(messageStatusEvents).where(and(eq(messageStatusEvents.opaque, m.idempotencyKey), eq(messageStatusEvents.channelId, m.channelId))).limit(1);
    if (!ev) continue;
    await db.transaction(async (tx) => {
      await tx.update(messages).set({ providerMessageId: ev.providerMessageId, status: "diterima_api", errorCategory: null, statusUpdatedAt: new Date() }).where(and(eq(messages.id, m.id), eq(messages.status, "belum_pasti")));
      await applyStatusesToMessage(tx, m.channelId, ev.providerMessageId);
      await writeAudit(tx, { actorLabel: "sistem:rekonsiliasi", action: "integration.reconciled", objectType: "message", objectId: m.id, metadata: { by: "opaque" } });
    });
    resolved++;
  }
  return { resolved, stillUncertain: rows.length - resolved, expired };
}

export async function resolveUncertainManually(ctx: Ctx, messageId: string, outcome: "terkirim" | "gagal", note: string) {
  const [m] = await getDb().select().from(messages).where(eq(messages.id, messageId));
  if (!m) throw notFound("Pesan tidak ditemukan.");
  if (!ctx.perms.canAny("integration.test")) throw forbidden();
  if (!ctx.perms.can("integration.test", m.channelId)) throw notFound("Pesan tidak ditemukan."); // di luar cakupan
  if (m.status !== "belum_pasti") throw conflict("NOT_UNCERTAIN", "Hanya pesan berstatus 'belum pasti' yang dapat diselesaikan manual.");
  if (!note.trim()) throw badRequest("Catatan wajib diisi (mis. hasil pengecekan di ponsel peserta uji).", undefined, "VALIDATION_ERROR");
  await getDb().transaction(async (tx) => {
    await tx.update(messages).set({ status: outcome, statusUpdatedAt: new Date(), errorCategory: "dikonfirmasi_manual" }).where(and(eq(messages.id, messageId), eq(messages.status, "belum_pasti")));
    await writeAudit(tx, { ...auditFor(ctx), action: "integration.uncertain_resolved", objectType: "message", objectId: messageId, metadata: { outcome, note: note.trim().slice(0, 300) } });
  });
}
