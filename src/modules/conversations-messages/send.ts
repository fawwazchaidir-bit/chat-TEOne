/**
 * Pengiriman keluar (kontrak inti #5). Satu-satunya jalur ke `whatsapp-adapter` untuk mengirim; dipanggil hanya dari alat uji.
 *  1. Penerima HARUS ada di daftar penerima uji (SEMUA lingkungan) — ditegakkan di sini, di server.
 *  2. Kunci idempotensi UNIQUE: klik ganda / permintaan ulang tidak pernah mengirim dua kali.
 *  3. Pesan bebas hanya di dalam jendela layanan 24 jam yang terbukti.
 *  4. Baris pesan dicatat SEBELUM memanggil Meta. Timeout/jaringan/5xx ⇒ `belum_pasti` ⇒ TIDAK ADA retry otomatis;
 *     diselesaikan oleh status webhook (via biz_opaque_callback_data = kunci idempotensi) atau tindakan manual teraudit.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { conversations, messages } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, conflict, forbidden } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import { requireFeature } from "@/modules/feature-flags";
import { getChannel } from "@/modules/channels/service";
import { upsertContact } from "@/modules/contacts/service";
import {
  acquireSendSlot, buildDocument, buildImage, buildText, CATEGORY_LABEL, categorizeMetaError, getConnectionRow, getMetaConfig,
  postMessage, uploadMedia, type CallResult,
} from "@/modules/whatsapp-adapter";
import type { Ctx } from "@/modules/shared/context";
import { upsertConversation } from "./conversations";
import { ALLOWED_MIME, kindOfMime, MEDIA_LIMITS, saveOutboundMedia, sniffMime } from "./media";
import { isListedRecipient, maskIdentity, normalizeIdentity } from "./recipients";
import { applyStatusesToMessage } from "./status";
import { evaluateWindow } from "./window";

export type SendInput = {
  channelId: string; to: string; kind: "text" | "image" | "document"; idempotencyKey: string;
  text?: string; caption?: string; file?: { bytes: Uint8Array; mime: string; filename: string };
};
export type SendResult = { messageId: string; status: string; duplicate: boolean; errorCategory: string | null; detail: string | null };

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const safeName = (n: string) => n.replace(/[^\w.\- ]/g, "_").replace(/^\.+/, "").slice(0, 100) || "berkas";

function validate(input: SendInput) {
  if (!KEY_RE.test(input.idempotencyKey)) throw badRequest("Kunci idempotensi tidak valid (8–100 karakter alfanumerik).", undefined, "VALIDATION_ERROR");
  if (input.kind === "text") {
    if (!input.text || !input.text.trim() || input.text.length > 4096) throw badRequest("Teks wajib diisi (maks. 4096 karakter).", undefined, "VALIDATION_ERROR");
  } else {
    const f = input.file;
    if (!f) throw badRequest("Berkas wajib diisi.", undefined, "VALIDATION_ERROR");
    const mime = f.mime.toLowerCase();
    if (!(ALLOWED_MIME[input.kind] as readonly string[]).includes(mime)) throw badRequest("Tipe berkas tidak diizinkan (gambar JPEG/PNG/WEBP atau PDF).", undefined, "MIME_NOT_ALLOWED");
    if (f.bytes.byteLength === 0 || f.bytes.byteLength > MEDIA_LIMITS[input.kind]) throw badRequest("Ukuran berkas tidak valid atau melebihi batas.", undefined, "FILE_TOO_LARGE");
    const sniffed = sniffMime(f.bytes);
    if (!sniffed || kindOfMime(sniffed) !== input.kind || sniffed !== mime) throw badRequest("Isi berkas tidak sesuai tipe yang dinyatakan.", undefined, "MIME_MISMATCH");
    if (input.caption && input.caption.length > 1024) throw badRequest("Keterangan maks. 1024 karakter.", undefined, "VALIDATION_ERROR");
  }
}

/**
 * Klasifikasi kegagalan panggilan Meta. `uncertain` = Meta MUNGKIN sudah memproses permintaan (timeout, jaringan, 5xx) ⇒
 * hasil `belum_pasti`, bukan `gagal`, dan TIDAK BOLEH di-retry otomatis. 4xx = Meta menolak ⇒ pasti tidak terkirim.
 */
export function classifyFailure(r: Extract<CallResult<unknown>, { ok: false }>): { category: string; code: number | null; uncertain: boolean } {
  if (r.kind === "konfigurasi") return { category: "konfigurasi", code: null, uncertain: false };
  if (r.kind === "timeout" || r.kind === "jaringan") return { category: r.kind, code: null, uncertain: true };
  return { category: categorizeMetaError(r.meta.code, r.status), code: r.meta.code, uncertain: r.status >= 500 };
}

const byKey = async (key: string) => (await getDb().select().from(messages).where(eq(messages.idempotencyKey, key)))[0];
const asResult = (m: typeof messages.$inferSelect, duplicate: boolean): SendResult => ({
  messageId: m.id, status: m.status ?? "diproses", duplicate, errorCategory: m.errorCategory,
  detail: m.errorCategory && m.errorCategory in CATEGORY_LABEL ? CATEGORY_LABEL[m.errorCategory as keyof typeof CATEGORY_LABEL] : null,
});

export async function sendOutbound(ctx: Ctx, input: SendInput): Promise<SendResult> {
  await requireFeature("whatsapp_connector");
  const ch = await getChannel(ctx, input.channelId); // 403 bila tanpa hak lihat apa pun; 404 di luar cakupan
  if (!ctx.perms.can("integration.test", input.channelId)) throw forbidden();
  if (ch.archivedAt) throw badRequest("Channel diarsipkan.", undefined, "CHANNEL_ARCHIVED");
  validate(input);
  const db = getDb();
  const conn = await getConnectionRow(input.channelId);
  if (!conn) throw conflict("KONEKSI_BELUM_DIKONFIGURASI", "Koneksi Meta untuk channel ini belum dikonfigurasi.");
  const cfg = getMetaConfig();
  if (!cfg.accessToken) throw conflict("META_BELUM_DIKONFIGURASI", "Token akses Meta belum diisi di environment (META_ACCESS_TOKEN).");

  // 1) DAFTAR PENERIMA UJI — ditegakkan di server pada setiap pengiriman.
  const to = normalizeIdentity(input.to);
  if (!(await isListedRecipient(db, to))) {
    await writeAudit(db, { ...auditFor(ctx), action: "integration.send_blocked", result: "denied", objectType: "channel", objectId: input.channelId, metadata: { reason: "penerima_di_luar_daftar_uji", to: maskIdentity(to) } });
    throw forbidden("Penerima tidak ada di daftar penerima uji.", "RECIPIENT_NOT_ALLOWED");
  }

  // 2) Idempotensi: kunci yang sama → hasil yang sama, tanpa kirim ulang.
  const existing = await byKey(input.idempotencyKey);
  if (existing) {
    if (existing.channelId !== input.channelId) throw conflict("IDEMPOTENCY_KEY_REUSED", "Kunci idempotensi sudah dipakai untuk channel lain.");
    return asResult(existing, true);
  }

  // 3) Jendela layanan (pesan bebas).
  const { conversationId, last } = await db.transaction(async (tx) => {
    const contact = await upsertContact(tx, [{ type: "wa_id", value: to }], null);
    const id = await upsertConversation(tx, contact.id, input.channelId);
    const [c] = await tx.select({ t: conversations.lastCustomerMessageAt }).from(conversations).where(eq(conversations.id, id));
    return { conversationId: id, last: c?.t ?? null };
  });
  const win = evaluateWindow(last);
  if (!win.open) {
    await writeAudit(db, { ...auditFor(ctx), action: "integration.send_blocked", result: "denied", objectType: "channel", objectId: input.channelId, metadata: { reason: win.reason, to: maskIdentity(to) } });
    throw conflict("WINDOW_CLOSED", win.message, { reason: win.reason, closesAt: win.closesAt?.toISOString() ?? null });
  }

  // 4) Catat dulu (status `diproses`), baru panggil Meta. UNIQUE(idempotency_key) menjamin hanya satu pemanggil yang lanjut.
  const body = input.kind === "text" ? (input.text as string) : (input.caption ?? null);
  const ins = await db.insert(messages).values({ conversationId, channelId: input.channelId, direction: "keluar", source: "te_one", type: input.kind, body, status: "diproses", idempotencyKey: input.idempotencyKey, createdBy: ctx.user.id })
    .onConflictDoNothing({ target: messages.idempotencyKey }).returning({ id: messages.id });
  if (ins.length === 0) { const again = await byKey(input.idempotencyKey); return asResult(again as typeof messages.$inferSelect, true); }
  const messageId = (ins[0] as { id: string }).id;

  const settle = async (status: "diterima_api" | "gagal" | "belum_pasti", o: { wamid?: string; category?: string; code?: number | null } = {}): Promise<SendResult> => {
    let row: typeof messages.$inferSelect | undefined;
    await db.transaction(async (tx) => {
      // Hanya menulis bila belum ada ID provider (webhook status via opaque mungkin sudah mendahului kita). `belum_pasti` ikut diizinkan:
      // penyapu `diproses` kedaluwarsa (G2-A06) mungkin sudah menandainya, padahal pengirim yang lambat kini punya hasil pasti.
      await tx.update(messages).set({ status, statusUpdatedAt: new Date(), providerMessageId: o.wamid ?? null, errorCategory: o.category ?? null, errorCode: o.code != null ? String(o.code) : null })
        .where(and(eq(messages.id, messageId), inArray(messages.status, ["diproses", "belum_pasti"]), isNull(messages.providerMessageId)));
      if (o.wamid) await applyStatusesToMessage(tx, input.channelId, o.wamid);
      [row] = await tx.select().from(messages).where(eq(messages.id, messageId));
      await writeAudit(tx, { ...auditFor(ctx), action: "integration.message_sent", result: status === "diterima_api" ? "success" : "failure", objectType: "message", objectId: messageId, metadata: { channelId: input.channelId, type: input.kind, status, category: o.category ?? null, to: maskIdentity(to) } });
    });
    return asResult(row as typeof messages.$inferSelect, false);
  };

  // 5) Batas kecepatan per nomor.
  if (!(await acquireSendSlot(conn.phoneNumberId, conn.rateLimitPerSec))) return settle("gagal", { category: "rate_limit" }); // belum dikirim → pasti

  // 6) Media: unggah dulu. Unggah gagal/timeout ⇒ belum ada pesan terkirim ⇒ gagal PASTI.
  let payload;
  if (input.kind === "text") payload = buildText(to, input.text as string, input.idempotencyKey);
  else {
    const f = input.file as NonNullable<SendInput["file"]>;
    const up = await uploadMedia(conn.phoneNumberId, f.bytes, f.mime.toLowerCase(), safeName(f.filename));
    if (!up.ok) { const f = classifyFailure(up); return settle("gagal", { category: f.category === "konfigurasi" ? f.category : "media_upload", code: f.code }); } // belum ada pesan terkirim ⇒ gagal PASTI
    if (!up.data?.id) return settle("gagal", { category: "media_upload" });
    await saveOutboundMedia(messageId, input.channelId, f.bytes, f.mime.toLowerCase(), up.data.id);
    payload = input.kind === "image" ? buildImage(to, up.data.id, input.caption, input.idempotencyKey) : buildDocument(to, up.data.id, safeName(f.filename), input.caption, input.idempotencyKey);
  }

  // 6b) Periksa ulang jendela layanan TEPAT sebelum kirim (kontrak inti #6; G2-A02): unggah media/antrean/limiter memakan waktu,
  //     jendela bisa tertutup sejak pemeriksaan awal. Belum ada panggilan pengiriman ⇒ gagal PASTI.
  const [fresh] = await db.select({ t: conversations.lastCustomerMessageAt }).from(conversations).where(eq(conversations.id, conversationId));
  const win2 = evaluateWindow(fresh?.t ?? null);
  if (!win2.open) {
    await writeAudit(db, { ...auditFor(ctx), action: "integration.send_blocked", result: "denied", objectType: "message", objectId: messageId, metadata: { reason: win2.reason, stage: "sebelum_kirim", to: maskIdentity(to) } });
    return settle("gagal", { category: "jendela_layanan" });
  }

  // 7) KIRIM — tepat SATU kali. Tidak ada percobaan ulang pada hasil apa pun.
  const r = await postMessage(conn.phoneNumberId, payload);
  if (r.ok) {
    const wamid = r.data?.messages?.[0]?.id;
    return wamid ? settle("diterima_api", { wamid }) : settle("belum_pasti", { category: "respons_tidak_dikenal" });
  }
  const f = classifyFailure(r);
  return settle(f.uncertain ? "belum_pasti" : "gagal", { category: f.category, code: f.code });
}
