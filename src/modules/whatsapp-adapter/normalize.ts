/**
 * Normalisasi payload webhook Meta → event internal. SATU-SATUNYA tempat asumsi bentuk payload Meta.
 *
 * STATUS VERIFIKASI (jujur): bentuk `messages` / `statuses` (envelope entry→changes→value, metadata.phone_number_id,
 * contacts[], messages[], statuses[]) adalah bentuk Cloud API yang umum dan stabil. Bentuk field COEXISTENCE
 * (`smb_message_echoes`, `history`, `smb_app_state_sync`), objek `referral`, dan pengenal selain `wa_id` disusun dari sumber
 * SEKUNDER dan pengetahuan umum — BELUM diverifikasi ke dokumentasi resmi Meta (host dokumentasi diblokir saat pembangunan).
 * Karena itu normalizer: (1) tidak pernah melempar error, (2) mengabaikan field asing, (3) mengarantina yang tidak dikenali
 * (`unknown`), (4) selalu mempertahankan identitas event agar dedup tetap benar. Wajib diverifikasi pada nomor uji.
 */
import { createHash } from "node:crypto";

export type EventMeta = { phoneNumberId: string | null; wabaId: string | null; displayPhone: string | null };

export type InboundMedia = { id: string; mime: string | null; sha256: string | null; caption: string | null; filename: string | null };
export type Referral = { sourceType: string | null; sourceId: string | null; sourceUrl: string | null; headline: string | null; clickId: string | null };
export type ContactInfo = { waId: string | null; userId: string | null; name: string | null };

export type MessageFragment = {
  id: string;
  from: string | null;
  userId: string | null;
  ts: string | null;
  type: "text" | "image" | "document" | "unsupported";
  rawType: string;
  text: string | null;
  media: InboundMedia | null;
  referral: Referral | null;
};
export type StatusFragment = { id: string; status: string; ts: string | null; recipient: string | null; errorCode: number | null; errorTitle: string | null; opaque: string | null };

export type NormalizedEvent = { eventKey: string; meta: EventMeta; providerTs: string | null } & (
  | { kind: "message"; contact: ContactInfo | null; message: MessageFragment }
  | { kind: "status"; status: StatusFragment }
  | { kind: "echo"; to: string | null; message: MessageFragment }
  | { kind: "history"; direction: "masuk" | "keluar"; customer: string | null; historyStatus: string | null; message: MessageFragment }
  | { kind: "history"; progress: { phase: number | null; chunk: number | null; progress: number | null; errorCode: number | null; errorTitle: string | null }; message?: undefined; direction?: undefined; customer?: undefined; historyStatus?: undefined }
  | { kind: "contact_sync"; count: number }
  | { kind: "unknown"; reason: string; field: string | null }
);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const digits = (s: string | null) => (s ? s.replace(/\D/g, "") : null);
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v) ?? "").digest("hex").slice(0, 32);

/** Cap waktu → ISO. Meta mengirim detik-epoch sebagai string. Tidak valid → null. */
export function parseTs(v: unknown): string | null {
  const s = str(v);
  if (!s || !/^\d{9,13}$/.test(s)) return null;
  const n = Number(s);
  const ms = s.length > 11 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2015 || d.getFullYear() > 2100 ? null : d.toISOString();
}

function parseMessage(m: Obj): MessageFragment | null {
  const id = str(m.id);
  if (!id) return null;
  const rawType = str(m.type) ?? "unknown";
  let type: MessageFragment["type"] = "unsupported";
  let text: string | null = null;
  let media: InboundMedia | null = null;
  if (rawType === "text") {
    type = "text";
    text = str(obj(m.text).body);
  } else if (rawType === "image" || rawType === "document") {
    const x = obj(m[rawType]);
    const mediaId = str(x.id);
    if (mediaId) {
      media = { id: mediaId, mime: str(x.mime_type), sha256: str(x.sha256), caption: str(x.caption), filename: str(x.filename) };
      type = rawType; // pembatasan MIME (hanya PDF untuk dokumen) dilakukan saat ingest
    }
  }
  const r = obj(m.referral);
  const referral: Referral | null = Object.keys(r).length
    ? { sourceType: str(r.source_type), sourceId: str(r.source_id), sourceUrl: str(r.source_url), headline: str(r.headline), clickId: str(r.ctwa_clid) }
    : null;
  return { id, from: digits(str(m.from)), userId: str(m.user_id), ts: parseTs(m.timestamp), type, rawType, text, media, referral };
}

/**
 * Menautkan satu entri `contacts[]` ke pesan HANYA bila hubungannya dapat dibuktikan dari pengenal yang SAMA di payload (G2-A01):
 * `wa_id` entri = `from` pesan, atau `user_id` entri = `user_id` pesan — dan entri itu TIDAK bertentangan (pengenal lain pada entri
 * yang sama tidak boleh berbeda dari yang dibawa pesan). Tidak ada fallback ke "entri pertama". Dipakai ulang oleh ingest untuk
 * memvalidasi ulang event lama di antrean (pertahanan berlapis).
 */
export function contactMatchesMessage(msg: Pick<MessageFragment, "from" | "userId">, ct: ContactInfo): boolean {
  const byWa = !!msg.from && ct.waId === msg.from;
  const byUser = !!msg.userId && ct.userId === msg.userId;
  if (!byWa && !byUser) return false;
  if (msg.from && ct.waId && ct.waId !== msg.from) return false; // bertentangan
  if (msg.userId && ct.userId && ct.userId !== msg.userId) return false; // bertentangan
  return true;
}

function pickContact(contacts: Obj[], msg: MessageFragment): ContactInfo | null {
  const matches = contacts
    .map((x): ContactInfo => ({ waId: digits(str(x.wa_id)), userId: str(x.user_id), name: str(obj(x.profile).name) }))
    .filter((ct) => contactMatchesMessage(msg, ct));
  // Ambigu (beberapa entri berbeda cocok) → tidak ada yang dipakai: pengenal hanya dari pesan itu sendiri.
  const distinct = new Set(matches.map((m) => `${m.waId ?? ""}|${m.userId ?? ""}`));
  return distinct.size === 1 ? (matches[0] as ContactInfo) : null;
}

function unknownEvent(meta: EventMeta, reason: string, field: string | null, basis: unknown): NormalizedEvent {
  return { kind: "unknown", eventKey: `unk:${sha(basis)}`, meta, providerTs: null, reason, field };
}

export function normalizePayload(body: unknown): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  const noMeta: EventMeta = { phoneNumberId: null, wabaId: null, displayPhone: null };
  if (!isObj(body) || body.object !== "whatsapp_business_account") return [unknownEvent(noMeta, "objek_bukan_whatsapp", null, body)];
  for (const entry of arr(body.entry)) {
    const e = obj(entry);
    const wabaId = str(e.id);
    for (const change of arr(e.changes)) {
      const c = obj(change);
      const field = str(c.field);
      const v = obj(c.value);
      const md = obj(v.metadata);
      const meta: EventMeta = { phoneNumberId: str(md.phone_number_id), wabaId, displayPhone: digits(str(md.display_phone_number)) };
      try {
        if (field === "messages") {
          const contacts = arr(v.contacts).map(obj);
          for (const raw of arr(v.messages)) {
            const msg = parseMessage(obj(raw));
            if (!msg) { out.push(unknownEvent(meta, "pesan_tanpa_id", field, raw)); continue; }
            const contact = pickContact(contacts, msg); // G2-A01: tanpa fallback ke contacts[0]
            out.push({ kind: "message", eventKey: `msg:${msg.id}`, meta, providerTs: msg.ts, contact, message: msg });
          }
          for (const raw of arr(v.statuses)) {
            const s = obj(raw);
            const id = str(s.id);
            const status = str(s.status);
            if (!id || !status) { out.push(unknownEvent(meta, "status_tanpa_id_atau_nilai", field, raw)); continue; }
            const err = obj(arr(s.errors)[0]);
            const code = typeof err.code === "number" ? err.code : null;
            out.push({
              kind: "status", eventKey: `st:${id}:${status}`, meta, providerTs: parseTs(s.timestamp),
              status: { id, status, ts: parseTs(s.timestamp), recipient: digits(str(s.recipient_id)), errorCode: code, errorTitle: str(err.title)?.slice(0, 200) ?? null, opaque: str(s.biz_opaque_callback_data) },
            });
          }
        } else if (field === "smb_message_echoes") {
          const list = arr(v.message_echoes).length ? arr(v.message_echoes) : arr(v.messages);
          for (const raw of list) {
            const msg = parseMessage(obj(raw));
            if (!msg) { out.push(unknownEvent(meta, "echo_tanpa_id", field, raw)); continue; }
            out.push({ kind: "echo", eventKey: `echo:${msg.id}`, meta, providerTs: msg.ts, to: digits(str(obj(raw).to) ?? str(obj(raw).recipient_id)), message: msg });
          }
        } else if (field === "history") {
          for (const item of arr(v.history)) {
            const h = obj(item);
            const hm = obj(h.metadata);
            const errs = arr(h.errors).map(obj);
            const progress = { phase: typeof hm.phase === "number" ? hm.phase : null, chunk: typeof hm.chunk_order === "number" ? hm.chunk_order : null, progress: typeof hm.progress === "number" ? hm.progress : null, errorCode: typeof errs[0]?.code === "number" ? (errs[0].code as number) : null, errorTitle: str(errs[0]?.title)?.slice(0, 200) ?? null };
            out.push({ kind: "history", eventKey: `histp:${sha([wabaId, meta.phoneNumberId, progress])}`, meta, providerTs: null, progress });
            for (const th of arr(h.threads)) {
              const t = obj(th);
              const customer = digits(str(t.id));
              for (const raw of arr(t.messages)) {
                const r = obj(raw);
                const msg = parseMessage(r);
                if (!msg) continue;
                const fromBusiness = meta.displayPhone !== null && msg.from === meta.displayPhone;
                const direction = fromBusiness || (customer !== null && msg.from !== null && msg.from !== customer) ? "keluar" : "masuk";
                out.push({ kind: "history", eventKey: `hist:${msg.id}`, meta, providerTs: msg.ts, direction, customer, historyStatus: str(obj(r.history_context).status), message: msg });
              }
            }
          }
        } else if (field === "smb_app_state_sync") {
          const count = arr(v.state_sync).length;
          out.push({ kind: "contact_sync", eventKey: `cs:${sha([wabaId, meta.phoneNumberId, v])}`, meta, providerTs: null, count });
        } else {
          out.push(unknownEvent(meta, "field_tidak_dikenal", field, c));
        }
      } catch {
        out.push(unknownEvent(meta, "gagal_normalisasi", field, c));
      }
    }
  }
  return out.length ? out : [unknownEvent(noMeta, "payload_tanpa_event", null, body)];
}
