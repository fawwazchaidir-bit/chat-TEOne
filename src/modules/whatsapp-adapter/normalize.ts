/**
 * Normalisasi payload webhook Meta → event internal. SATU-SATUNYA tempat asumsi bentuk payload Meta.
 *
 * STATUS VERIFIKASI (jujur): bentuk `messages` / `statuses` (envelope entry→changes→value, metadata.phone_number_id,
 * contacts[], messages[], statuses[]) adalah bentuk Cloud API yang umum dan stabil. Bentuk field COEXISTENCE `smb_message_echoes`,
 * `history` (history[].metadata{phase,chunk_order,progress}, threads[].{id,context{wa_id,user_id,…},messages[]}, errors[] kode 2593109, webhook aset media
 * terpisah) dan `smb_app_state_sync` (state_sync[].{type,contact{full_name,first_name,phone_number,user_id,username},action,metadata.timestamp}) DIVERIFIKASI
 * ke halaman resmi Meta "Onboarding WhatsApp Business app users" (dibaca 26 Nov 2026) — bentuk SIMULASI/dokumentasi, BELUM teramati pada akun nyata (M-12).
 * Objek `referral` dan pengenal selain `wa_id` pada `messages` tetap dari sumber SEKUNDER.
 * Karena itu normalizer: (1) tidak pernah melempar error, (2) mengabaikan field asing, (3) mengarantina yang tidak dikenali
 * (`unknown`), (4) selalu mempertahankan identitas event agar dedup tetap benar. Wajib diverifikasi pada nomor uji.
 */
import { createHash } from "node:crypto";

export type EventMeta = { phoneNumberId: string | null; wabaId: string | null; displayPhone: string | null };

export type InboundMedia = { id: string; mime: string | null; sha256: string | null; caption: string | null; filename: string | null };
export type Referral = { sourceType: string | null; sourceId: string | null; sourceUrl: string | null; headline: string | null; clickId: string | null };
export type ContactInfo = { waId: string | null; userId: string | null; name: string | null };
/** Kontak dari webhook `smb_app_state_sync` (buku alamat WhatsApp Business app). `action`: add = ditambah/diubah, remove = dihapus; null = tak dikenal. */
export type ContactSyncItem = { action: "add" | "remove" | null; fullName: string | null; firstName: string | null; phone: string | null; userId: string | null; username: string | null; ts: string | null };

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
  /** `to` = nomor penerima (dihilangkan Meta bila tidak tersedia); `toUserId` = BSUID penerima; `contact` = entri `contacts[]` yang TERBUKTI milik penerima. Dua bidang terakhir opsional: event lama di antrean tidak memilikinya. */
  | { kind: "echo"; to: string | null; toUserId?: string | null; contact?: ContactInfo | null; message: MessageFragment }
  /**
   * `direction` null = arah TIDAK dapat ditentukan (ingest mengarantina; tidak ditebak). `customer` = nomor pelanggan (thread.id / context.wa_id), `customerUserId` = BSUID
   * dari context thread, `fromUserId` = BSUID pengirim pesan (bila pesan dari pengguna). `identityConflict` = thread.id ≠ context.wa_id (identitas tidak dipercaya). Semua opsional:
   * event lama di antrean tidak memilikinya (F1-03).
   */
  | { kind: "history"; direction: "masuk" | "keluar" | null; customer: string | null; customerUserId?: string | null; fromUserId?: string | null; identityConflict?: boolean; historyStatus: string | null; message: MessageFragment }
  | { kind: "history"; progress: { phase: number | null; chunk: number | null; progress: number | null; errorCode: number | null; errorTitle: string | null }; message?: undefined; direction?: undefined; customer?: undefined; historyStatus?: undefined }
  /** Satu event per kontak (S-12); `contact` opsional: event lama di antrean hanya memuat hitungan. */
  | { kind: "contact_sync"; count: number; contact?: ContactSyncItem }
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

/**
 * Entri `contacts[]` pada echo = penerima. Dipakai HANYA bila terbukti milik echo itu (pengenal yang sama, tidak bertentangan — aturan G2-A01
 * yang sama dengan pesan masuk); tanpa fallback ke "entri pertama". Ambigu (beberapa entri berbeda cocok) → tidak ada yang dipakai.
 */
function pickEchoContact(contacts: Obj[], to: string | null, toUserId: string | null): ContactInfo | null {
  if (!to && !toUserId) return null;
  const matches = contacts
    .map((x): ContactInfo => ({ waId: digits(str(x.wa_id)), userId: str(x.user_id), name: str(obj(x.profile).name) }))
    .filter((ct) => contactMatchesMessage({ from: to, userId: toUserId }, ct));
  const distinct = new Set(matches.map((m) => `${m.waId ?? ""}|${m.userId ?? ""}`));
  return distinct.size === 1 ? (matches[0] as ContactInfo) : null;
}

/**
 * Arah pesan history. Urutan bukti (tanpa menebak): pesan dengan `to` (echo Business App) / dari nomor bisnis → keluar; pesan berpengirim BSUID (`from_user_id`,
 * pengguna tanpa nomor) → masuk; `from` = pelanggan thread → masuk; `from` lain pada thread ber-pelanggan → keluar (aturan lama). Tanpa bukti apa pun → null (dikarantina).
 */
function historyDirection(msg: MessageFragment, r: Obj, meta: EventMeta, customer: string | null): "masuk" | "keluar" | null {
  if (str(r.to)) return "keluar";
  if (msg.from && meta.displayPhone && msg.from === meta.displayPhone) return "keluar";
  if (str(r.from_user_id)) return "masuk";
  if (msg.from && customer) return msg.from === customer ? "masuk" : "keluar";
  return null;
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
          const echoContacts = arr(v.contacts).map(obj);
          for (const raw of list) {
            const msg = parseMessage(obj(raw));
            if (!msg) { out.push(unknownEvent(meta, "echo_tanpa_id", field, raw)); continue; }
            const r = obj(raw);
            // Bentuk resmi (dokumentasi Meta, dibaca 26 Nov): `to` dihilangkan bila nomor penerima tidak tersedia; `to_user_id` = BSUID (G2-B04/S-11).
            const to = digits(str(r.to) ?? str(r.recipient_id));
            const toUserId = str(r.to_user_id);
            out.push({ kind: "echo", eventKey: `echo:${msg.id}`, meta, providerTs: msg.ts, to, toUserId, contact: pickEchoContact(echoContacts, to, toUserId), message: msg });
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
              const tctx = obj(t.context);
              // Identitas thread (F1-03): nomor dari `id` / `context.wa_id` (dihilangkan Meta bila tak tersedia), BSUID dari `context.user_id`.
              // `id` ≠ `context.wa_id` = bukti bertentangan → tidak dipercaya sama sekali (tidak ada yang dipilih/digabung).
              const idPhone = digits(str(t.id));
              const ctxPhone = digits(str(tctx.wa_id));
              const identityConflict = !!idPhone && !!ctxPhone && idPhone !== ctxPhone;
              const customer = identityConflict ? null : (idPhone ?? ctxPhone);
              const customerUserId = identityConflict ? null : str(tctx.user_id);
              for (const raw of arr(t.messages)) {
                const r = obj(raw);
                const msg = parseMessage(r);
                if (!msg) continue;
                const fromUserId = str(r.from_user_id);
                out.push({ kind: "history", eventKey: `hist:${msg.id}`, meta, providerTs: msg.ts, direction: historyDirection(msg, r, meta, customer), customer, customerUserId, fromUserId, ...(identityConflict ? { identityConflict: true } : {}), historyStatus: str(obj(r.history_context).status), message: msg });
              }
            }
          }
          // Webhook ASET MEDIA terpisah (field `history` dengan `messages[]`, bukan `history[]`; hanya media ≤ 14 hari): Tahap 2 tidak mengunduh media riwayat →
          // dikarantina dengan alasan khusus (payload karantina hanya {field, reason}: tanpa nomor/ID media).
          for (const raw of arr(v.messages)) out.push(unknownEvent(meta, "history_media_tidak_diproses", field, raw));
        } else if (field === "smb_app_state_sync") {
          const items = arr(v.state_sync);
          if (items.length === 0) out.push({ kind: "contact_sync", eventKey: `cs:${sha([wabaId, meta.phoneNumberId, v])}`, meta, providerTs: null, count: 0 });
          for (const raw of items) {
            const i = obj(raw);
            if (!isObj(raw) || str(i.type) !== "contact") { out.push(unknownEvent(meta, "state_sync_bukan_kontak", field, raw)); continue; }
            const c2 = obj(i.contact);
            const act = str(i.action);
            const rawTs = str(obj(i.metadata).timestamp);
            const contact: ContactSyncItem = {
              action: act === "add" || act === "remove" ? act : null,
              fullName: str(c2.full_name)?.slice(0, 200) ?? null, firstName: str(c2.first_name)?.slice(0, 100) ?? null,
              phone: digits(str(c2.phone_number)), userId: str(c2.user_id), username: str(c2.username)?.slice(0, 100) ?? null, ts: parseTs(rawTs),
            };
            // Kunci = hash (tanpa nilai mentah): kontak + aksi + cap waktu + nama → suntingan baru (cap/nama berbeda) diproses, pengiriman ulang yang sama dideduplikasi.
            out.push({ kind: "contact_sync", eventKey: `cs:${sha([wabaId, meta.phoneNumberId, contact.phone ?? contact.userId, contact.action, rawTs, contact.fullName, contact.firstName])}`, meta, providerTs: contact.ts, count: 1, contact });
          }
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
