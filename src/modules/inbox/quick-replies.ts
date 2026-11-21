/**
 * Balasan cepat: pustaka teks per channel/tim dengan variabel aman. Dikelola pengguna berizin (`quickreply.manage` bercakupan channel;
 * balasan untuk SEMUA channel butuh izin di semua channel), setiap perubahan teraudit. Balasan cepat hanya MENGISI teks komposer —
 * pengirimannya tetap lewat jalur balasan manual (jendela layanan, izin, idempotensi tidak dilewati).
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { channels, contacts, conversations, quickReplies, teams } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import { requireFeature } from "@/modules/feature-flags";
import { getConversationForAction } from "@/modules/conversations-messages";
import type { Ctx } from "@/modules/shared/context";

export const QUICK_REPLY_VARIABLES = ["nama", "channel"] as const;
const VAR_RE = /\{([a-z_]+)\}/g;

/** Setiap token `{...}` harus variabel yang dikenal (huruf kecil persis). Token lain — termasuk `{NAMA}` — ditolak, bukan terkirim apa adanya ke pelanggan. */
const ANY_TOKEN_RE = /\{([^{}\s]{1,40})\}/g;
export function validateTemplate(body: string) {
  for (const m of body.matchAll(ANY_TOKEN_RE)) if (!(QUICK_REPLY_VARIABLES as readonly string[]).includes(m[1] as string)) throw badRequest(`Variabel {${m[1]}} tidak dikenal. Yang tersedia: ${QUICK_REPLY_VARIABLES.map((v) => `{${v}}`).join(", ")}.`, undefined, "UNKNOWN_VARIABLE");
}
export const renderTemplate = (body: string, vars: Record<string, string>) => body.replace(VAR_RE, (_, k: string) => vars[k] ?? "");

type Input = { title: string; body: string; channelId?: string | null; teamId?: string | null };
const mayManage = (ctx: Ctx, channelId: string | null) => (channelId ? ctx.perms.can("quickreply.manage", channelId) : ctx.perms.can("quickreply.manage"));

function check(i: Input) {
  const title = i.title?.trim(); const body = i.body?.trim();
  if (!title || title.length > 80) throw badRequest("Judul wajib diisi (maks. 80 karakter).", undefined, "VALIDATION_ERROR");
  if (!body || body.length > 1000) throw badRequest("Isi wajib diisi (maks. 1000 karakter).", undefined, "VALIDATION_ERROR");
  validateTemplate(body);
  return { title, body };
}

/** Daftar untuk pengelolaan: hanya yang boleh dikelola pengguna ini. */
export async function listQuickReplies(ctx: Ctx) {
  await requireFeature("inbox");
  if (!ctx.perms.canAny("quickreply.manage")) throw forbidden();
  const rows = await getDb().select().from(quickReplies).orderBy(quickReplies.title);
  return rows.filter((r) => mayManage(ctx, r.channelId)).map((r) => ({ id: r.id, title: r.title, body: r.body, channelId: r.channelId, teamId: r.teamId, isActive: r.isActive }));
}

export async function createQuickReply(ctx: Ctx, i: Input) {
  await requireFeature("inbox");
  const v = check(i);
  const channelId = i.channelId ?? null;
  if (!mayManage(ctx, channelId)) throw forbidden();
  const db = getDb();
  if (channelId) { const [c] = await db.select({ id: channels.id }).from(channels).where(eq(channels.id, channelId)); if (!c) throw badRequest("Channel tidak ditemukan.", undefined, "CHANNEL_INVALID"); }
  if (i.teamId) { const [t] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, i.teamId)); if (!t) throw badRequest("Tim tidak ditemukan.", undefined, "TEAM_INVALID"); }
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(quickReplies).values({ ...v, channelId, teamId: i.teamId ?? null, createdBy: ctx.user.id, updatedBy: ctx.user.id }).returning();
    await writeAudit(tx, { ...auditFor(ctx), action: "quick_reply.created", objectType: "quick_reply", objectId: (r as { id: string }).id, metadata: { title: v.title, channelId } });
    return { id: (r as { id: string }).id };
  });
}

export async function updateQuickReply(ctx: Ctx, id: string, i: Partial<Input> & { isActive?: boolean }) {
  await requireFeature("inbox");
  const db = getDb();
  const [cur] = await db.select().from(quickReplies).where(eq(quickReplies.id, id));
  if (!cur || !mayManage(ctx, cur.channelId)) throw notFound("Balasan cepat tidak ditemukan.");
  const v = check({ title: i.title ?? cur.title, body: i.body ?? cur.body });
  await db.transaction(async (tx) => {
    await tx.update(quickReplies).set({ ...v, ...(i.isActive !== undefined ? { isActive: i.isActive } : {}), updatedAt: new Date(), updatedBy: ctx.user.id }).where(eq(quickReplies.id, id));
    await writeAudit(tx, { ...auditFor(ctx), action: i.isActive === false ? "quick_reply.deactivated" : "quick_reply.updated", objectType: "quick_reply", objectId: id, metadata: { title: v.title } });
  });
  return { id };
}

/** Balasan cepat yang berlaku untuk percakapan ini, dengan variabel sudah diisi. Butuh akses `reply` pada percakapan. */
export async function quickRepliesForConversation(ctx: Ctx, conversationId: string) {
  await requireFeature("inbox");
  const conv = await getConversationForAction(ctx, conversationId, "reply");
  const db = getDb();
  const [row] = await db.select({ name: contacts.displayName, channel: channels.name }).from(conversations).innerJoin(contacts, eq(contacts.id, conversations.contactId)).innerJoin(channels, eq(channels.id, conversations.channelId)).where(eq(conversations.id, conversationId));
  const rows = await db.select().from(quickReplies).where(and(eq(quickReplies.isActive, true), or(isNull(quickReplies.channelId), eq(quickReplies.channelId, conv.channelId)), or(isNull(quickReplies.teamId), conv.teamId ? eq(quickReplies.teamId, conv.teamId) : isNull(quickReplies.teamId))));
  const vars = { nama: row?.name?.trim() || "Kak", channel: row?.channel ?? "" };
  return rows.map((r) => ({ id: r.id, title: r.title, text: renderTemplate(r.body, vars) }));
}
