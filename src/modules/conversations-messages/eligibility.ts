/**
 * Kelayakan pesan untuk diproses otomatisasi (kontrak inti #4; AGENTS.md §8: ragu → jangan proses). Fungsi MURNI.
 * Hanya pesan pelanggan LANGSUNG yang waktunya TERBUKTI dan SETELAH batas aktivasi ulang yang layak. Pesan lama, history, duplikat,
 * dan event terlambat sebelum batas TIDAK layak. Waktu tak terbukti saat AI Aktif ⇒ `review` (ditandai untuk ditinjau, tidak diproses).
 */
export type EligibilityInput = {
  aiStatus: string;
  aiBoundaryAt: Date | null;
  message: { source: string; direction: string; isHistory: boolean; providerTs: Date | null };
  now?: Date;
};
export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: "ai_off" | "bukan_pesan_pelanggan" | "history" | "waktu_tidak_terbukti" | "sebelum_batas"; review: boolean };

const SKEW_MS = 5 * 60_000;

export function evaluateEligibility(i: EligibilityInput): EligibilityResult {
  const now = i.now ?? new Date();
  if (i.message.isHistory || i.message.source === "history") return { eligible: false, reason: "history", review: false };
  if (i.message.direction !== "masuk" || i.message.source !== "pelanggan") return { eligible: false, reason: "bukan_pesan_pelanggan", review: false };
  if (i.aiStatus !== "aktif") return { eligible: false, reason: "ai_off", review: false };
  const ts = i.message.providerTs;
  if (!ts || Number.isNaN(ts.getTime()) || ts.getTime() > now.getTime() + SKEW_MS) return { eligible: false, reason: "waktu_tidak_terbukti", review: true };
  if (i.aiBoundaryAt && ts.getTime() <= i.aiBoundaryAt.getTime()) return { eligible: false, reason: "sebelum_batas", review: false };
  return { eligible: true };
}
