/**
 * Hook event domain. Otomatisasi tahap berikutnya (AI, follow-up, label, unread) HANYA boleh berlangganan di sini.
 * Kontrak inti #3: event `history` dan `echo` TIDAK PERNAH dipancarkan — hanya pesan pelanggan langsung yang baru.
 */
export type CustomerMessageEvent = { channelId: string; conversationId: string; messageId: string; contactId: string };
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
