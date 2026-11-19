/** Fixture & helper Tahap 2. Semua identitas SINTETIS (bukan nomor Indonesia; tidak ada data pelanggan). */
import { createHash, randomUUID } from "node:crypto";
import { signBody } from "@/modules/whatsapp-adapter/signature";
import { TEST_ENV } from "../test-env";
import { ownerQuery } from "./db";
import { makeChannel, makeRole, makeUser } from "./fixtures";

export const APP_SECRET = TEST_ENV.META_APP_SECRET as string;
export const VERIFY_TOKEN = TEST_ENV.META_VERIFY_TOKEN as string;
export const WABA = "100000000000001";
export const PHONE_ID = "200000000000001";
export const BUSINESS_DISPLAY = "15550000001";
export const CUSTOMER = "15550001001"; // peserta uji sintetis (terdaftar di daftar penerima uji)
export const STRANGER = "15550009999"; // pengirim di luar daftar uji

export const nowSec = () => String(Math.floor(Date.now() / 1000));
export const secAgo = (s: number) => String(Math.floor(Date.now() / 1000) - s);

type Obj = Record<string, unknown>;
export const envelope = (changes: Obj[], waba = WABA): Obj => ({ object: "whatsapp_business_account", entry: [{ id: waba, changes }] });
const meta = (phoneId: string, display = BUSINESS_DISPLAY) => ({ messaging_product: "whatsapp", metadata: { display_phone_number: display, phone_number_id: phoneId } });

export const textMsg = (id: string, from: string, body: string, ts = nowSec()): Obj => ({ from, id, timestamp: ts, type: "text", text: { body } });
export const imageMsg = (id: string, from: string, mediaId: string, mime = "image/jpeg", sha?: string, caption?: string, ts = nowSec()): Obj => ({ from, id, timestamp: ts, type: "image", image: { id: mediaId, mime_type: mime, ...(sha ? { sha256: sha } : {}), ...(caption ? { caption } : {}) } });
export const docMsg = (id: string, from: string, mediaId: string, mime = "application/pdf", filename = "dokumen.pdf", ts = nowSec()): Obj => ({ from, id, timestamp: ts, type: "document", document: { id: mediaId, mime_type: mime, filename } });

export const messagesChange = (o: { phoneId?: string; messages?: Obj[]; statuses?: Obj[]; contacts?: Obj[]; display?: string }): Obj => ({
  field: "messages",
  value: { ...meta(o.phoneId ?? PHONE_ID, o.display), ...(o.contacts ? { contacts: o.contacts } : o.messages?.length ? { contacts: [{ profile: { name: "Peserta Uji" }, wa_id: (o.messages[0] as Obj).from }] } : {}), ...(o.messages ? { messages: o.messages } : {}), ...(o.statuses ? { statuses: o.statuses } : {}) },
});
export const statusObj = (id: string, status: string, recipient = CUSTOMER, extra: Obj = {}): Obj => ({ id, status, timestamp: nowSec(), recipient_id: recipient, ...extra });
export const echoChange = (echoes: Obj[], phoneId = PHONE_ID): Obj => ({ field: "smb_message_echoes", value: { ...meta(phoneId), message_echoes: echoes } });
export const historyChange = (threads: Obj[], progress: Obj = { phase: 0, chunk_order: 1, progress: 10 }, phoneId = PHONE_ID): Obj => ({ field: "history", value: { ...meta(phoneId), history: [{ metadata: progress, threads }] } });

/** Mengirim webhook ke handler route yang SEBENARNYA (raw body + tanda tangan). */
export async function postWebhook(body: unknown, o: { sign?: boolean | string; rawOverride?: string; headers?: Record<string, string> } = {}) {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const raw = o.rawOverride ?? (typeof body === "string" ? body : JSON.stringify(body));
  const headers: Record<string, string> = { "content-type": "application/json", ...o.headers };
  if (o.sign !== false) headers["x-hub-signature-256"] = typeof o.sign === "string" ? o.sign : signBody(raw, APP_SECRET);
  const res = await POST(new Request("http://localhost:3000/api/webhooks/whatsapp", { method: "POST", headers, body: raw }));
  return { status: res.status, text: await res.text() };
}
export async function getChallenge(params: Record<string, string>) {
  const { GET } = await import("@/app/api/webhooks/whatsapp/route");
  const res = await GET(new Request(`http://localhost:3000/api/webhooks/whatsapp?${new URLSearchParams(params)}`));
  return { status: res.status, text: await res.text() };
}

export const sha256Hex = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
// Berkas minimal yang LULUS sniffing (bukan dokumen sungguhan).
export const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("uji-isi-gambar-sintetis")]);
export const JPG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("uji-isi-jpeg-sintetis")]);
export const PDF_BYTES = Buffer.from("%PDF-1.4\n% dokumen uji sintetis\n%%EOF\n");

export async function enableConnector(on = true) {
  await ownerQuery("insert into feature_flag_overrides(key, enabled) values('whatsapp_connector', $1) on conflict (key) do update set enabled = excluded.enabled", [on]);
}
export async function mapChannel(channelId: string, o: { waba?: string; phoneId?: string; testMode?: boolean } = {}) {
  await ownerQuery("insert into channel_connections(channel_id, waba_id, phone_number_id, test_mode) values($1,$2,$3,$4)", [channelId, o.waba ?? WABA, o.phoneId ?? PHONE_ID, o.testMode ?? true]);
}
export const listRecipient = (identity: string, label = "Peserta uji") => ownerQuery("insert into test_recipients(label, identity_value) values($1,$2) on conflict do nothing", [label, identity]);

/** Dunia uji standar: flag nyala, channel contoh terpetakan, penerima uji terdaftar, satu pengguna penguji. */
export async function world(o: { testMode?: boolean } = {}) {
  await enableConnector();
  const channel = await makeChannel("Kemitraan — contoh", "Kemitraan");
  await mapChannel(channel.id, { testMode: o.testMode });
  await listRecipient(CUSTOMER);
  const role = await makeRole("Penguji Integrasi", [
    { permission: "channel.view", channelIds: [channel.id] }, { permission: "channel.manage", channelIds: [channel.id] },
    { permission: "integration.test", scopeAll: true },
  ]);
  const user = await makeUser({ roleIds: [role.id], email: `penguji-${randomUUID().slice(0, 6)}@contoh.test` });
  return { channel, user, role };
}
