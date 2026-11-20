/**
 * Hook event domain. Otomatisasi tahap berikutnya (AI, follow-up, label, unread) HANYA boleh berlangganan di sini.
 * CATATAN KETAHANAN (G2-A03/T2-F15): hook ini berjalan DALAM MEMORI setelah commit — event bisa hilang bila proses mati antara commit dan
 * pemancaran. SEBELUM ada subscriber otomatisasi yang mengirim pesan (Tahap 3–6), pemancaran WAJIB dipindah ke desain durable (outbox).
 * Kontrak inti #3: event `history` dan `echo` TIDAK PERNAH dipancarkan — hanya pesan pelanggan langsung yang baru.
 */
export type CustomerMessageEvent = { channelId: string; conversationId: string; messageId: string; contactId: string; providerTs: string; receivedAt: string };

/**
 * Kelayakan otomatisasi (G2-A03): pesan hanya boleh dipancarkan bila WAKTU PESAN TERBUKTI dan cukup baru. Ketidakpastian ⇒ TIDAK layak
 * (AGENTS.md §8: ragu → jangan kirim, eskalasi). ASUMSI teknis konservatif (belum ada keputusan bisnis; Tahap 3/4 yang menentukan dan
 * mengikatnya ke "batas pesan layak diproses" saat AI diaktifkan kembali — kontrak inti #4).
 */
export const AUTOMATION_MAX_AGE_MS = 10 * 60_000;
export function automationEligible(proven: Date | null, now: Date = new Date()): boolean {
  return !!proven && now.getTime() - proven.getTime() <= AUTOMATION_MAX_AGE_MS;
}

type Handler = (e: CustomerMessageEvent) => void | Promise<void>;
const handlers = new Set<Handler>();

export function onCustomerMessage(h: Handler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}

export async function emitCustomerMessage(e: CustomerMessageEvent): Promise<void> {
  for (const h of handlers) {
    try { await h(e); } catch { console.error(`[hook] pelanggan-pesan gagal untuk pesan ${e.messageId}`); }
  }
}
