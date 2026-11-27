/**
 * Pembangun payload webhook S-12 — bentuk MENGIKUTI contoh resmi Meta (halaman "Onboarding WhatsApp Business app users", dibaca 26 Nov 2026):
 * `smb_app_state_sync` (state_sync[].contact + action + metadata.timestamp) dan `history` (history[].metadata{phase,chunk_order,progress}, threads[].{id,context,messages[]},
 * history_context.status, errors[] kode 2593109, serta webhook aset media terpisah). Semua nilai SINTETIS.
 */
import { BUSINESS_DISPLAY, PHONE_ID, nowSec } from "./whatsapp";

type Obj = Record<string, unknown>;
const meta = (phoneId = PHONE_ID) => ({ messaging_product: "whatsapp", metadata: { display_phone_number: BUSINESS_DISPLAY, phone_number_id: phoneId } });

export const syncContact = (o: { full?: string; first?: string; phone?: string; userId?: string; username?: string; action?: "add" | "remove" | string; ts?: string } = {}): Obj => ({
  type: "contact",
  contact: { ...(o.full ? { full_name: o.full } : {}), ...(o.first ? { first_name: o.first } : {}), ...(o.phone ? { phone_number: o.phone } : {}), ...(o.userId ? { user_id: o.userId } : {}), ...(o.username ? { username: o.username } : {}) },
  action: o.action ?? "add",
  metadata: { timestamp: o.ts ?? nowSec() },
});
export const contactSyncChange = (items: unknown[], phoneId = PHONE_ID): Obj => ({ field: "smb_app_state_sync", value: { ...meta(phoneId), state_sync: items } });

export const histMsg = (id: string, o: { from?: string; fromUserId?: string; to?: string; text?: string; ts?: string; status?: string; type?: string } = {}): Obj => ({
  ...(o.from ? { from: o.from } : {}), ...(o.fromUserId ? { from_user_id: o.fromUserId } : {}), ...(o.to ? { to: o.to } : {}),
  id, timestamp: o.ts ?? nowSec(), type: o.type ?? "text", ...(o.type && o.type !== "text" ? {} : { text: { body: o.text ?? `isi sintetis ${id}` } }),
  history_context: { status: o.status ?? "read" },
});
export const histThread = (o: { id?: string; context?: Obj; messages: Obj[] }): Obj => ({ ...(o.id ? { id: o.id } : {}), ...(o.context ? { context: o.context } : {}), messages: o.messages });
export const historyFull = (threads: Obj[], md: { phase: number; chunk_order: number; progress: number }, phoneId = PHONE_ID): Obj => ({ field: "history", value: { ...meta(phoneId), history: [{ metadata: md, threads }] } });
/** Pemilik bisnis menolak berbagi riwayat (kode 2593109; teks galat dari dokumentasi resmi). */
export const historyDeclined = (phoneId = PHONE_ID): Obj => ({
  field: "history",
  value: { ...meta(phoneId), history: [{ errors: [{ code: 2593109, title: "History sync is turned off by the business from the WhatsApp Business App", message: "History sync is turned off by the business from the WhatsApp Business App", error_data: { details: "History sharing is turned off by the business" } }] }] },
});
/** Webhook aset media TERPISAH (field `history` dengan `messages[]`, bukan `history[]`) — hanya untuk media ≤ 14 hari. */
export const historyMediaAsset = (id: string, from: string, mediaId: string, phoneId = PHONE_ID): Obj => ({
  field: "history",
  value: { ...meta(phoneId), messages: [{ from, id, timestamp: nowSec(), type: "image", image: { caption: "teks sintetis", mime_type: "image/jpeg", sha256: "a".repeat(64), id: mediaId } }] },
});
