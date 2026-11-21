/**
 * Media pelanggan: PRIVAT (di luar webroot, nama acak, izin 0600), tipe & ukuran divalidasi (sniffing byte, bukan percaya
 * header), sha256 dicocokkan, akses selalu lewat pemeriksaan izin. URL/token sementara dari Meta tidak pernah dicatat.
 */
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, lt, sql } from "drizzle-orm";
import { media, messages } from "@/db/schema";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { forbidden, notFound } from "@/lib/errors";
import { downloadMedia, getMediaInfo } from "@/modules/whatsapp-adapter";
import type { Ctx } from "@/modules/shared/context";
import { canAccessConversation } from "./access";

export const MEDIA_LIMITS = { image: 5 * 1024 * 1024, document: 16 * 1024 * 1024 } as const;
export const ALLOWED_MIME = { image: ["image/jpeg", "image/png", "image/webp"], document: ["application/pdf"] } as const;
export const MAX_MEDIA_ATTEMPTS = 3;

export function sniffMime(b: Uint8Array): string | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
export const kindOfMime = (m: string): "image" | "document" | null => ((ALLOWED_MIME.image as readonly string[]).includes(m) ? "image" : (ALLOWED_MIME.document as readonly string[]).includes(m) ? "document" : null);

const root = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), getEnv().MEDIA_DIR);
const resolveKey = (key: string) => {
  const p = path.resolve(/*turbopackIgnore: true*/ root(), key);
  if (!p.startsWith(root() + path.sep)) throw new Error("kunci media tidak valid"); // anti path traversal
  return p;
};

export async function storeMediaFile(bytes: Uint8Array): Promise<{ key: string; sha256: string }> {
  const d = new Date();
  const key = path.join(String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), randomUUID());
  const full = resolveKey(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(/*turbopackIgnore: true*/ full, bytes, { mode: 0o600, flag: "wx" });
  await chmod(/*turbopackIgnore: true*/ full, 0o600);
  return { key, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Menyimpan salinan media pesan KELUAR (agar tampil di alat uji). */
export async function saveOutboundMedia(messageId: string, channelId: string, bytes: Uint8Array, mime: string, providerMediaId: string | null) {
  const { key, sha256 } = await storeMediaFile(bytes);
  await getDb().insert(media).values({ messageId, channelId, providerMediaId, mime, sha256, declaredSha256: sha256, sizeBytes: bytes.byteLength, storagePath: key, status: "tersimpan" }).onConflictDoNothing();
}

type FetchOutcome = "tersimpan" | "tidak_tersedia" | "gagal" | "menunggu";
const finish = async (id: string, status: "tersimpan" | "tidak_tersedia" | "gagal" | "menunggu", extra: Partial<typeof media.$inferInsert> = {}) => {
  await getDb().update(media).set({ status, ...extra }).where(eq(media.id, id));
  return status as FetchOutcome;
};

/** Mengunduh media masuk. Kegagalan TIDAK menggagalkan pemrosesan pesan; dicoba lagi (maks 3×) lalu `gagal`/`tidak_tersedia`. */
export async function fetchInboundMedia(mediaId: string): Promise<FetchOutcome> {
  const db = getDb();
  const [row] = await db.update(media).set({ attempts: sql`${media.attempts} + 1` }).where(and(eq(media.id, mediaId), eq(media.status, "menunggu"))).returning();
  if (!row || !row.providerMediaId) return "gagal";
  const giveUp = row.attempts >= MAX_MEDIA_ATTEMPTS;
  const transient = (cat: string) => finish(row.id, giveUp ? "gagal" : "menunggu", { errorCategory: cat });
  const info = await getMediaInfo(row.providerMediaId);
  if (!info.ok) {
    if (info.kind === "http" && (info.status === 404 || info.status === 410)) return finish(row.id, "tidak_tersedia", { errorCategory: "kedaluwarsa_atau_dihapus" });
    return transient("info_media_gagal");
  }
  const mime = (info.data?.mime_type ?? row.mime ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  const kind = kindOfMime(mime);
  if (!kind) return finish(row.id, "gagal", { errorCategory: "mime_tidak_diizinkan" });
  if (typeof info.data?.file_size === "number" && info.data.file_size > MEDIA_LIMITS[kind]) return finish(row.id, "gagal", { errorCategory: "terlalu_besar" });
  const url = info.data?.url;
  if (!url) return transient("url_media_tidak_ada");
  const dl = await downloadMedia(url, MEDIA_LIMITS[kind]);
  if (!dl.ok) {
    if (dl.kind === "terlalu_besar") return finish(row.id, "gagal", { errorCategory: "terlalu_besar" });
    if (dl.kind === "url_tidak_diizinkan") return finish(row.id, "gagal", { errorCategory: "url_media_tidak_diizinkan" });
    if (dl.kind === "http" && (dl.status === 404 || dl.status === 410)) return finish(row.id, "tidak_tersedia", { errorCategory: "kedaluwarsa_atau_dihapus" });
    return transient("unduh_gagal");
  }
  const sniffed = sniffMime(dl.bytes);
  if (!sniffed || kindOfMime(sniffed) !== kind) return finish(row.id, "gagal", { errorCategory: "isi_tidak_sesuai_tipe" });
  const digest = createHash("sha256").update(dl.bytes).digest("hex");
  const declared = (row.declaredSha256 ?? info.data?.sha256 ?? "").toLowerCase();
  // Meta mengirim sha256 dalam hex atau base64 tergantung jalur; bandingkan keduanya, tolak bila ADA nilai yang tidak cocok.
  const b64 = createHash("sha256").update(dl.bytes).digest("base64");
  if (declared && declared !== digest && declared !== b64.toLowerCase() && declared !== b64) return finish(row.id, "gagal", { errorCategory: "sha256_tidak_cocok" });
  const { key } = await storeMediaFile(dl.bytes);
  return finish(row.id, "tersimpan", { mime: sniffed, sha256: digest, sizeBytes: dl.bytes.byteLength, storagePath: key, errorCategory: null });
}

/** Membaca media untuk pengguna — SELALU memeriksa izin pada channel pesan. Di luar cakupan → 404 (keberadaan tidak dibocorkan). */
export async function readMediaForUser(ctx: Ctx, mediaId: string): Promise<{ bytes: Buffer; mime: string; kind: "image" | "document" }> {
  const [row] = await getDb().select({ m: media, channelId: messages.channelId, conversationId: messages.conversationId }).from(media).innerJoin(messages, eq(messages.id, media.messageId)).where(eq(media.id, mediaId));
  if (!row) throw notFound("Media tidak ditemukan.");
  const ch = row.channelId;
  // Akses media MENGIKUTI akses percakapan (Tahap 3): izin channel ATAU percakapan yang dialihkan ke tim pengguna — hanya percakapan itu.
  if (!ctx.perms.canAny("integration.test") && !ctx.perms.canAny("chat.view")) throw forbidden();
  const viaTool = ctx.perms.can("integration.test", ch);
  if (!viaTool && !(await canAccessConversation(ctx, row.conversationId, "view"))) throw notFound("Media tidak ditemukan.");
  if (row.m.status !== "tersimpan" || !row.m.storagePath || !row.m.mime) throw notFound("Media belum tersedia.");
  const kind = kindOfMime(row.m.mime);
  if (!kind) throw notFound("Media tidak tersedia.");
  let full: string;
  try { full = resolveKey(row.m.storagePath); } catch { throw notFound("Media tidak tersedia."); } // kunci di luar MEDIA_DIR ditolak
  return { bytes: await readFile(/*turbopackIgnore: true*/ full).catch(() => { throw notFound("Media tidak tersedia."); }), mime: row.m.mime, kind };
}

/** Untuk pemeliharaan: media `menunggu` yang tertunda dicoba lagi. */
export async function retryPendingMedia(olderThanMs = 30_000, limit = 10): Promise<number> {
  const rows = await getDb().select({ id: media.id }).from(media).where(and(eq(media.status, "menunggu"), lt(media.createdAt, new Date(Date.now() - olderThanMs)), lt(media.attempts, MAX_MEDIA_ATTEMPTS))).limit(limit);
  for (const r of rows) await fetchInboundMedia(r.id);
  return rows.length;
}
