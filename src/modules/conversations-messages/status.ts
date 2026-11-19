/**
 * Status pesan keluar mengikuti BUKTI provider. Status dapat datang berulang, tidak berurutan, atau sebelum pesan
 * dicatat → semuanya disimpan di `message_status_events`; status akhir DITURUNKAN dari seluruh log (tidak bergantung urutan).
 *   dibaca > diterima > (gagal jika tanpa bukti penerimaan) > terkirim > diterima_api > diproses/belum_pasti
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { messageStatusEvents, messages } from "@/db/schema";
import type { Executor } from "@/db/client";

export type MessageStatus = "diproses" | "diterima_api" | "terkirim" | "diterima" | "dibaca" | "gagal" | "belum_pasti";
export const PROVIDER_STATUS: Record<string, "terkirim" | "diterima" | "dibaca" | "gagal"> = { sent: "terkirim", delivered: "diterima", read: "dibaca", failed: "gagal" };
const RANK: Record<string, number> = { diproses: 0, belum_pasti: 0, diterima_api: 1, terkirim: 2, diterima: 3, dibaca: 4 };

/** Fungsi murni: turunkan status dari status dasar + himpunan status provider yang pernah diterima. */
export function deriveStatus(base: string | null, provider: string[]): MessageStatus | null {
  const set = new Set(provider.map((p) => PROVIDER_STATUS[p]).filter(Boolean));
  if (set.has("dibaca")) return "dibaca";
  if (set.has("diterima")) return "diterima";
  if (set.has("gagal")) return "gagal"; // 'gagal' tanpa bukti penerimaan; 'terkirim' yang datang terlambat tidak membatalkannya
  if (set.has("terkirim")) return "terkirim";
  return (base as MessageStatus | null) ?? null;
}
export const statusRank = (s: string | null) => (s && s in RANK ? (RANK[s] as number) : s === "gagal" ? 5 : 0);

/** Menerapkan seluruh log status ke pesan keluar (bila sudah ada). Idempoten. Mengembalikan true bila status berubah. */
export async function applyStatusesToMessage(tx: Executor, channelId: string, providerMessageId: string): Promise<boolean> {
  const [m] = await tx.select().from(messages).where(and(eq(messages.channelId, channelId), eq(messages.providerMessageId, providerMessageId)));
  if (!m || m.direction !== "keluar") return false;
  const evs = await tx.select().from(messageStatusEvents).where(and(eq(messageStatusEvents.channelId, channelId), eq(messageStatusEvents.providerMessageId, providerMessageId)));
  if (evs.length === 0) return false;
  // Pesan yang sudah punya ID provider tetapi masih 'diproses'/'belum_pasti' berstatus dasar "diterima API".
  const base = !m.status || m.status === "diproses" || m.status === "belum_pasti" ? "diterima_api" : m.status;
  const derived = deriveStatus(base, evs.map((e) => e.status));
  if (!derived || derived === m.status) return false;
  const failed = evs.find((e) => e.status === "failed");
  await tx.update(messages).set({
    status: derived, statusRank: statusRank(derived), statusUpdatedAt: new Date(),
    ...(derived === "gagal" ? { errorCode: failed?.errorCode ?? null, errorCategory: "ditolak_penyedia" } : {}),
  }).where(eq(messages.id, m.id));
  return true;
}

/**
 * Mencatat satu status dari provider. Bila pesan belum punya ID provider (hasil kirim belum pasti / belum selesai dicatat)
 * tetapi `opaque` (= kunci idempotensi kita) cocok → ID provider ditautkan di sini (rekonsiliasi tanpa retry kirim).
 */
export async function recordStatusEvent(tx: Executor, channelId: string, s: { id: string; status: string; ts: string | null; errorCode: number | null; opaque: string | null }): Promise<void> {
  await tx.insert(messageStatusEvents).values({ channelId, providerMessageId: s.id, status: s.status, providerTs: s.ts ? new Date(s.ts) : null, errorCode: s.errorCode !== null ? String(s.errorCode) : null, opaque: s.opaque })
    .onConflictDoNothing({ target: [messageStatusEvents.channelId, messageStatusEvents.providerMessageId, messageStatusEvents.status] });
  if (s.opaque) {
    await tx.update(messages).set({ providerMessageId: s.id, status: sql`CASE WHEN ${messages.status} IN ('belum_pasti','diproses') THEN 'diterima_api' ELSE ${messages.status} END`, statusUpdatedAt: new Date(), errorCategory: sql`CASE WHEN ${messages.status} = 'belum_pasti' THEN NULL ELSE ${messages.errorCategory} END` })
      .where(and(eq(messages.channelId, channelId), eq(messages.idempotencyKey, s.opaque), isNull(messages.providerMessageId)));
  }
  await applyStatusesToMessage(tx, channelId, s.id);
}
