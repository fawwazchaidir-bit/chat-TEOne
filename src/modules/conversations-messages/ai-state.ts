/**
 * Mesin status AI per percakapan (kontrak inti #4; ADR-0008). Setiap perubahan: ATOMIK (baris percakapan dikunci), bernomor versi,
 * teraudit (baris `conversation_ai_events` + audit log), dan membatalkan job otomatisasi yang belum terkirim.
 * Saat diaktifkan kembali, BATAS "pesan yang layak diproses" dicatat. AI tidak pernah menyala kembali sendiri.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { automationJobs, conversationAiEvents, conversations } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { conflict } from "@/lib/errors";
import { writeAudit, type AuditEntry } from "@/modules/audit";

export const AI_OFF_REASONS = ["admin_mengambil_alih", "admin_membalas", "eskalasi", "balasan_dari_hp", "kill_switch", "manual"] as const;
export type AiOffReason = (typeof AI_OFF_REASONS)[number];
export const AI_OFF_LABEL: Record<AiOffReason, string> = {
  admin_mengambil_alih: "Admin mengambil alih", admin_membalas: "Admin membalas", eskalasi: "Eskalasi", balasan_dari_hp: "Balasan dari HP (WhatsApp Business App)",
  kill_switch: "Kill switch chat", manual: "Dimatikan manual",
};

export type AiState = { status: "aktif" | "off"; reason: AiOffReason | null; version: number; boundaryAt: Date | null };
export type AiChange = { to: "aktif" } | { to: "off"; reason: AiOffReason };
export type AiActor = { audit: Pick<AuditEntry, "actor" | "actorLabel" | "correlationId" | "ip">; actorId: string | null; label: string };

const stateOf = (c: typeof conversations.$inferSelect): AiState => ({ status: c.aiStatus as "aktif" | "off", reason: (c.aiOffReason as AiOffReason | null) ?? null, version: c.aiVersion, boundaryAt: c.aiBoundaryAt });

/**
 * Mengubah status AI. WAJIB dipanggil di dalam transaksi `tx`; baris percakapan dikunci (FOR UPDATE) sehingga pengambilalihan dan
 * komit-kirim job otomatis tidak dapat saling menyalip. `expectedVersion` (opsional) → 409 bila status sudah berubah (benturan dua admin).
 * Perubahan yang tidak mengubah apa pun (sudah Aktif / sudah Off) bersifat idempoten: tidak menaikkan versi dan tidak mengubah alasan pertama.
 */
export async function setAiState(tx: Executor, conversationId: string, change: AiChange, actor: AiActor, o: { expectedVersion?: number | null; now?: Date; locked?: typeof conversations.$inferSelect } = {}): Promise<{ changed: boolean; state: AiState }> {
  const now = o.now ?? new Date();
  const cur = o.locked ?? (await tx.select().from(conversations).where(eq(conversations.id, conversationId)).for("update"))[0];
  if (!cur) throw new Error("percakapan_tidak_ada");
  if (o.expectedVersion !== undefined && o.expectedVersion !== null && o.expectedVersion !== cur.aiVersion) {
    // Audit lewat koneksi TERPISAH: melempar 409 di bawah akan me-rollback `tx`, dan jejak benturan tidak boleh ikut hilang.
    await writeAudit(getDb(), { ...actor.audit, action: "conversation.ai_conflict", objectType: "conversation", objectId: conversationId, result: "denied", metadata: { expected: o.expectedVersion, current: cur.aiVersion } });
    throw conflict("AI_VERSION_CONFLICT", "Status AI percakapan ini sudah diubah oleh pengguna lain. Muat ulang lalu coba lagi.", { current: stateOf(cur) });
  }
  const noop = change.to === "aktif" ? cur.aiStatus === "aktif" : cur.aiStatus === "off";
  if (noop) return { changed: false, state: stateOf(cur) };
  const version = cur.aiVersion + 1;
  const [upd] = await tx.update(conversations).set({
    aiStatus: change.to, aiOffReason: change.to === "off" ? change.reason : null, aiVersion: version,
    ...(change.to === "aktif" ? { aiBoundaryAt: now } : {}), aiChangedAt: now, aiChangedBy: actor.actorId, reviewFlag: null,
  }).where(and(eq(conversations.id, conversationId), eq(conversations.aiVersion, cur.aiVersion))).returning();
  if (!upd) throw conflict("AI_VERSION_CONFLICT", "Status AI berubah bersamaan. Muat ulang lalu coba lagi.");
  await tx.insert(conversationAiEvents).values({
    conversationId, fromStatus: cur.aiStatus, toStatus: change.to, reason: change.to === "off" ? change.reason : null, version, actorId: actor.actorId, actorLabel: actor.label, boundaryAt: upd.aiBoundaryAt,
  });
  // Job yang belum terkirim milik versi lama dibatalkan segera (pemeriksaan ulang versi tepat sebelum kirim tetap berjalan sebagai lapis kedua).
  await tx.update(automationJobs).set({ status: "dibatalkan", statusReason: change.to === "off" ? "ai_off" : "versi_berubah", updatedAt: now })
    .where(and(eq(automationJobs.conversationId, conversationId), inArray(automationJobs.status, ["menunggu", "ditahan"]), ne(automationJobs.aiVersion, version)));
  await writeAudit(tx, { ...actor.audit, action: "conversation.ai_changed", objectType: "conversation", objectId: conversationId, metadata: { from: cur.aiStatus, to: change.to, reason: change.to === "off" ? change.reason : null, version, boundaryAt: upd.aiBoundaryAt?.toISOString() ?? null } });
  return { changed: true, state: stateOf(upd) };
}
