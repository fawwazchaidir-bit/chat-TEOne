/**
 * Akses percakapan (kontrak inti #1; ADR-0007). SATU-SATUNYA tempat yang memutuskan siapa boleh melakukan apa pada percakapan.
 *
 * Aturan (default MENOLAK):
 *  1. Izin aksi pada channel percakapan (cakupan channel) → boleh.
 *  2. Percakapan yang DIALIHKAN ke tim X: anggota tim X (tim aktif) boleh bertindak pada percakapan ITU SAJA — bila ia memegang
 *     izin aksi tersebut di setidaknya satu channel (`canAny`) dan TIDAK ditolak secara eksplisit pada channel percakapan itu.
 *     Akses ini TIDAK meluas ke percakapan lain di channel yang sama.
 *  3. Penolakan spesifik pengguna selalu menang. Akses dihitung ulang di SETIAP permintaan (izin yang dicabut berlaku segera).
 * Percakapan di luar akses → 404 (keberadaannya tidak dibocorkan); terlihat tetapi tanpa izin aksi → 403.
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import { channels, conversations } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { forbidden, notFound } from "@/lib/errors";
import type { Ctx } from "@/modules/shared/context";

export type ConvAction = "view" | "reply" | "note" | "ai" | "assign" | "transfer";
export const ACTION_PERMISSION: Record<ConvAction, string> = {
  view: "chat.view", reply: "chat.reply", note: "chat.note", ai: "ai.toggle", assign: "chat.assign", transfer: "chat.transfer",
};

let channelIdCache: { at: number; ids: string[] } | null = null;
/** Semua id channel (termasuk arsip — percakapan lama tetap dapat dibaca). Cache sangat singkat; hanya daftar id, bukan izin. */
async function allChannelIds(ex: Executor): Promise<string[]> {
  if (channelIdCache && Date.now() - channelIdCache.at < 2000) return channelIdCache.ids;
  const rows = await ex.select({ id: channels.id }).from(channels);
  channelIdCache = { at: Date.now(), ids: rows.map((r) => r.id) };
  return channelIdCache.ids;
}
export const resetAccessCacheForTests = () => { channelIdCache = null; };

/** Id channel yang boleh dilihat/dikerjakan pengguna lewat IZIN CHANNEL (tanpa akses pengalihan per percakapan). Dipakai untuk menyaring data tingkat channel (mis. kill switch). */
export async function permittedChannelIds(ctx: Ctx, action: ConvAction = "view", ex: Executor = getDb()): Promise<string[]> {
  const perm = ACTION_PERMISSION[action];
  return (await allChannelIds(ex)).filter((id) => ctx.perms.can(perm, id));
}

const list = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

/**
 * Fragmen WHERE (alias tabel `conversations`) untuk percakapan yang boleh diakses ctx dengan aksi tertentu.
 * Dipakai oleh daftar, pencarian, filter, JUMLAH, dan riwayat lintas channel — satu sumber kebenaran, tanpa kebocoran.
 */
export async function conversationAccessSql(ctx: Ctx, action: ConvAction = "view", ex: Executor = getDb()): Promise<SQL> {
  const perm = ACTION_PERMISSION[action];
  const ids = await allChannelIds(ex);
  const allowed = ids.filter((id) => ctx.perms.can(perm, id));
  const channelCond = allowed.length ? sql`${conversations.channelId} IN (${list(allowed)})` : sql`false`;
  if (!ctx.perms.canAny(perm)) return sql`(${channelCond})`;
  const denied = ids.filter((id) => ctx.perms.deniesChannel(perm, id));
  const notDenied = denied.length ? sql` AND ${conversations.channelId} NOT IN (${list(denied)})` : sql``;
  const teamCond = sql`(EXISTS (
    SELECT 1 FROM conversation_team_access a
      JOIN team_members m ON m.team_id = a.team_id
      JOIN teams t ON t.id = a.team_id AND t.is_active
    WHERE a.conversation_id = ${conversations.id} AND a.revoked_at IS NULL AND m.user_id = ${ctx.user.id}::uuid)${notDenied})`;
  return sql`(${channelCond} OR ${teamCond})`;
}

/** Memuat percakapan (dikunci bila `ex` adalah transaksi dan `lock` true) sambil memeriksa akses `action`. */
export async function getConversationForAction(ctx: Ctx, id: string, action: ConvAction, opts: { ex?: Executor; lock?: boolean } = {}) {
  const ex = opts.ex ?? getDb();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Percakapan tidak ditemukan.");
  const base = ex.select().from(conversations).where(and(eq(conversations.id, id), await conversationAccessSql(ctx, "view", ex)));
  const [row] = opts.lock ? await base.for("update") : await base;
  if (!row) throw notFound("Percakapan tidak ditemukan.");
  if (action !== "view") {
    const [ok] = await ex.select({ n: sql<number>`1` }).from(conversations).where(and(eq(conversations.id, id), await conversationAccessSql(ctx, action, ex)));
    if (!ok) throw forbidden();
  }
  return row;
}

export async function canAccessConversation(ctx: Ctx, id: string, action: ConvAction = "view", ex: Executor = getDb()): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const [ok] = await ex.select({ n: sql<number>`1` }).from(conversations).where(and(eq(conversations.id, id), await conversationAccessSql(ctx, action, ex)));
  return !!ok;
}
