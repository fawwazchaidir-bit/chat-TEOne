/**
 * Inbox: daftar, pencarian, filter, JUMLAH, detail, pesan, belum dibaca, dan umpan perubahan. SEMUA kueri memakai satu fragmen akses
 * (`conversationAccessSql`) sehingga daftar, jumlah, pencarian, riwayat lintas channel, dan pembaruan tampilan tidak dapat bocor
 * (CCP 3.1). Nomor telepon tidak pernah tampil lengkap di daftar (disamarkan); lengkap hanya di panel kontak untuk yang berhak.
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import { conversationNotes, conversationReads, conversations } from "@/db/schema";
import { getDb } from "@/db/client";
import { notFound } from "@/lib/errors";
import { requireFeature } from "@/modules/feature-flags";
import { canAccessConversation, conversationAccessSql, permittedChannelIds, evaluateWindow, getConversationForAction, maskIdentity, AI_OFF_LABEL, type AiOffReason } from "@/modules/conversations-messages";
import { getEngagedKillSwitches } from "@/modules/kill-switch";
import type { Ctx } from "@/modules/shared/context";

export type ListFilters = {
  channelId?: string; teamId?: string; assignee?: "me" | "none" | string; unread?: boolean; aiStatus?: "aktif" | "off"; escalated?: boolean; strayLead?: boolean; review?: boolean; q?: string;
};
export type ListItem = {
  id: string; channelId: string; channelName: string; contactName: string | null; identity: string | null; lastMessageAt: string | null;
  preview: { text: string | null; type: string; direction: string; source: string; status: string | null } | null;
  unread: number; aiStatus: "aktif" | "off"; aiOffReason: string | null; aiLabel: string; aiVersion: number;
  teamId: string | null; teamName: string | null; assigneeId: string | null; assigneeName: string | null; assignVersion: number;
  escalated: boolean; strayLead: boolean; reviewFlag: string | null; windowOpen: boolean; changeAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const aiLabel = (status: string, reason: string | null) => (status === "aktif" ? "AI disiapkan — agent belum terhubung" : `AI Off — ${AI_OFF_LABEL[reason as AiOffReason] ?? reason ?? ""}`);

/** Jumlah belum dibaca PER PENGGUNA (D-16): pesan `unread_eligible` yang diterima setelah `last_read_at` (null → semua). */
const unreadExpr = (userId: string) => sql`(SELECT count(*)::int FROM messages um WHERE um.conversation_id = ${conversations.id} AND um.unread_eligible
  AND um.received_at > COALESCE((SELECT r.last_read_at FROM conversation_reads r WHERE r.user_id = ${userId}::uuid AND r.conversation_id = ${conversations.id}), 'epoch'::timestamptz))`;

function filterSql(ctx: Ctx, f: ListFilters): SQL[] {
  const w: SQL[] = [];
  if (f.channelId) w.push(UUID.test(f.channelId) ? sql`${conversations.channelId} = ${f.channelId}::uuid` : sql`false`);
  if (f.teamId) w.push(UUID.test(f.teamId) ? sql`${conversations.teamId} = ${f.teamId}::uuid` : sql`false`);
  if (f.assignee === "me") w.push(sql`${conversations.assigneeId} = ${ctx.user.id}::uuid`);
  else if (f.assignee === "none") w.push(sql`${conversations.assigneeId} IS NULL`);
  else if (f.assignee) w.push(UUID.test(f.assignee) ? sql`${conversations.assigneeId} = ${f.assignee}::uuid` : sql`false`);
  if (f.unread) w.push(sql`${unreadExpr(ctx.user.id)} > 0`);
  if (f.aiStatus) w.push(sql`${conversations.aiStatus} = ${f.aiStatus}`);
  if (f.escalated) w.push(sql`${conversations.escalatedAt} IS NOT NULL`);
  if (f.strayLead) w.push(sql`${conversations.strayLead}`);
  if (f.review) w.push(sql`${conversations.reviewFlag} IS NOT NULL`);
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const byName = sql`EXISTS (SELECT 1 FROM contacts sc WHERE sc.id = ${conversations.contactId} AND sc.display_name ILIKE ${`%${likeEscape(q)}%`} ESCAPE '\\')`;
    const byId = digits.length >= 4 ? sql` OR EXISTS (SELECT 1 FROM contact_identities si WHERE si.contact_id = ${conversations.contactId} AND si.identity_value LIKE ${`%${digits}%`})` : sql``;
    w.push(sql`(${byName}${byId})`);
  }
  return w;
}

const SELECT_ROWS = (userId: string) => sql`
  SELECT ${conversations.id} AS id, ${conversations.channelId} AS channel_id, ch.name AS channel_name, ct.display_name AS contact_name,
    (SELECT i.identity_value FROM contact_identities i WHERE i.contact_id = ${conversations.contactId} AND i.identity_type = 'wa_id' ORDER BY i.created_at LIMIT 1) AS wa,
    ${conversations.lastMessageAt} AS last_message_at, ${conversations.lastCustomerMessageAt} AS last_customer_message_at,
    ${conversations.aiStatus} AS ai_status, ${conversations.aiOffReason} AS ai_off_reason, ${conversations.aiVersion} AS ai_version,
    ${conversations.teamId} AS team_id, tm.name AS team_name, ${conversations.assigneeId} AS assignee_id, us.name AS assignee_name, ${conversations.assignVersion} AS assign_version,
    ${conversations.escalatedAt} AS escalated_at, ${conversations.strayLead} AS stray_lead, ${conversations.reviewFlag} AS review_flag, ${conversations.changeAt} AS change_at,
    lm.body AS lm_body, lm.type AS lm_type, lm.direction AS lm_direction, lm.source AS lm_source, lm.status AS lm_status,
    ${unreadExpr(userId)} AS unread
  FROM conversations
  JOIN channels ch ON ch.id = ${conversations.channelId}
  JOIN contacts ct ON ct.id = ${conversations.contactId}
  LEFT JOIN teams tm ON tm.id = ${conversations.teamId}
  LEFT JOIN users us ON us.id = ${conversations.assigneeId}
  LEFT JOIN LATERAL (SELECT m.body, m.type, m.direction, m.source, m.status FROM messages m WHERE m.conversation_id = ${conversations.id}
    ORDER BY COALESCE(m.provider_ts, CASE WHEN m.is_history THEN 'epoch'::timestamptz ELSE m.received_at END) DESC, m.id DESC LIMIT 1) lm ON true`;

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
function toItem(r: Row): ListItem {
  const wa = r.wa as string | null;
  return {
    id: r.id as string, channelId: r.channel_id as string, channelName: r.channel_name as string, contactName: (r.contact_name as string | null) ?? null, identity: wa ? maskIdentity(wa) : null,
    lastMessageAt: iso(r.last_message_at),
    preview: r.lm_type ? { text: ((r.lm_body as string | null) ?? "").slice(0, 140) || null, type: r.lm_type as string, direction: r.lm_direction as string, source: r.lm_source as string, status: (r.lm_status as string | null) ?? null } : null,
    unread: Number(r.unread ?? 0), aiStatus: r.ai_status as "aktif" | "off", aiOffReason: (r.ai_off_reason as string | null) ?? null, aiLabel: aiLabel(r.ai_status as string, (r.ai_off_reason as string | null) ?? null), aiVersion: Number(r.ai_version),
    teamId: (r.team_id as string | null) ?? null, teamName: (r.team_name as string | null) ?? null, assigneeId: (r.assignee_id as string | null) ?? null, assigneeName: (r.assignee_name as string | null) ?? null, assignVersion: Number(r.assign_version),
    escalated: !!r.escalated_at, strayLead: !!r.stray_lead, reviewFlag: (r.review_flag as string | null) ?? null,
    windowOpen: evaluateWindow(r.last_customer_message_at ? new Date(r.last_customer_message_at as string) : null).open, changeAt: iso(r.change_at) as string,
  };
}

const needInbox = async (ctx: Ctx) => { await requireFeature("inbox"); void ctx; };

/** Daftar percakapan (kursor keyset: terbaru dulu). Jumlah `total` memakai akses + filter yang sama. */
export async function listConversations(ctx: Ctx, f: ListFilters = {}, o: { cursor?: string | null; limit?: number } = {}) {
  await needInbox(ctx);
  const db = getDb();
  const limit = Math.min(Math.max(o.limit ?? 30, 1), 100);
  const where = [await conversationAccessSql(ctx, "view"), ...filterSql(ctx, f)];
  const base = sql.join(where, sql` AND `);
  const [tot] = (await db.execute(sql`SELECT count(*)::int AS n FROM conversations WHERE ${base}`)).rows as { n: number }[];
  const page = [...where];
  if (o.cursor) {
    const [ts, id] = o.cursor.split("|");
    if (id && UUID.test(id)) {
      page.push(ts === "-"
        ? sql`(${conversations.lastMessageAt} IS NULL AND ${conversations.id} < ${id}::uuid)`
        : sql`(${conversations.lastMessageAt} < ${new Date(ts as string)} OR (${conversations.lastMessageAt} = ${new Date(ts as string)} AND ${conversations.id} < ${id}::uuid) OR ${conversations.lastMessageAt} IS NULL)`);
    }
  }
  const rows = (await db.execute(sql`${SELECT_ROWS(ctx.user.id)} WHERE ${sql.join(page, sql` AND `)} ORDER BY ${conversations.lastMessageAt} DESC NULLS LAST, ${conversations.id} DESC LIMIT ${limit + 1}`)).rows as Row[];
  const more = rows.length > limit;
  const items = rows.slice(0, limit).map(toItem);
  const last = items[items.length - 1];
  return { items, total: tot?.n ?? 0, nextCursor: more && last ? `${last.lastMessageAt ?? "-"}|${last.id}` : null };
}

/** Navigasi + jumlah (per channel, per tim, ditugaskan ke saya, belum ditugaskan, belum dibaca) — semuanya difilter akses. */
export async function inboxNav(ctx: Ctx) {
  await needInbox(ctx);
  const db = getDb();
  const access = await conversationAccessSql(ctx, "view");
  const unread = unreadExpr(ctx.user.id);
  const [tot] = (await db.execute(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE ${conversations.assigneeId} = ${ctx.user.id}::uuid)::int AS mine,
      count(*) FILTER (WHERE ${conversations.assigneeId} IS NULL)::int AS unassigned, count(*) FILTER (WHERE ${unread} > 0)::int AS unread,
      count(*) FILTER (WHERE ${conversations.escalatedAt} IS NOT NULL)::int AS escalated, count(*) FILTER (WHERE ${conversations.strayLead})::int AS stray,
      count(*) FILTER (WHERE ${conversations.reviewFlag} IS NOT NULL)::int AS review FROM conversations WHERE ${access}`)).rows as Record<string, number>[];
  const perChannel = (await db.execute(sql`SELECT ch.id, ch.name, count(*)::int AS n, count(*) FILTER (WHERE ${unread} > 0)::int AS unread, cc.verification_status, cc.verification_mode
      FROM conversations JOIN channels ch ON ch.id = ${conversations.channelId} LEFT JOIN channel_connections cc ON cc.channel_id = ch.id WHERE ${access}
      GROUP BY ch.id, ch.name, cc.verification_status, cc.verification_mode ORDER BY ch.name`)).rows as Row[];
  const perTeam = (await db.execute(sql`SELECT tm.id, tm.name, count(*)::int AS n FROM conversations JOIN teams tm ON tm.id = ${conversations.teamId} WHERE ${access} GROUP BY tm.id, tm.name ORDER BY tm.name`)).rows as Row[];
  const channelIds = perChannel.map((c) => c.id as string);
  return {
    totals: { all: tot?.total ?? 0, mine: tot?.mine ?? 0, unassigned: tot?.unassigned ?? 0, unread: tot?.unread ?? 0, escalated: tot?.escalated ?? 0, strayLead: tot?.stray ?? 0, review: tot?.review ?? 0 },
    channels: perChannel.map((c) => ({ id: c.id as string, name: c.name as string, count: Number(c.n), unread: Number(c.unread), connection: { status: (c.verification_status as string | null) ?? "belum_dikonfigurasi", mode: (c.verification_mode as string | null) ?? null } })),
    teams: perTeam.map((t) => ({ id: t.id as string, name: t.name as string, count: Number(t.n) })),
    killSwitches: await getEngagedKillSwitches(channelIds),
  };
}

/** Umpan perubahan untuk pembaruan tampilan (ADR-0009): percakapan terbaca-pengguna yang berubah sejak `since`. Izin diperiksa pada SETIAP panggilan. */
export async function inboxChanges(ctx: Ctx, since: string | null) {
  await needInbox(ctx);
  const db = getDb();
  const [now] = (await db.execute(sql`SELECT clock_timestamp() AS t`)).rows as { t: string }[];
  const serverTime = new Date(now?.t as string).toISOString();
  // Kill switch yang berlaku (global, fitur, dan channel YANG TERLIHAT) ikut dibawa agar spanduk di UI muncul/hilang tanpa menunggu percakapan berubah.
  const killSwitches = await getEngagedKillSwitches(await permittedChannelIds(ctx, "view"));
  if (!since || Number.isNaN(new Date(since).getTime())) return { serverTime, items: [] as ListItem[], truncated: false, resync: true, killSwitches };
  const where = [await conversationAccessSql(ctx, "view"), sql`${conversations.changeAt} > ${new Date(since)}`];
  const rows = (await db.execute(sql`${SELECT_ROWS(ctx.user.id)} WHERE ${sql.join(where, sql` AND `)} ORDER BY ${conversations.changeAt} ASC LIMIT 101`)).rows as Row[];
  return { serverTime, items: rows.slice(0, 100).map(toItem), truncated: rows.length > 100, resync: false, killSwitches };
}

export async function markRead(ctx: Ctx, id: string) {
  await needInbox(ctx);
  await getConversationForAction(ctx, id, "view");
  await getDb().insert(conversationReads).values({ userId: ctx.user.id, conversationId: id, lastReadAt: new Date() })
    .onConflictDoUpdate({ target: [conversationReads.userId, conversationReads.conversationId], set: { lastReadAt: new Date() } });
  return { ok: true };
}

/** Detail percakapan untuk panel: kontak, sumber lead, riwayat lintas channel (hanya channel/percakapan yang BOLEH diakses), status AI, job, aktivitas. */
export async function getConversationDetail(ctx: Ctx, id: string) {
  await needInbox(ctx);
  const conv = await getConversationForAction(ctx, id, "view");
  const db = getDb();
  const [row] = (await db.execute(sql`${SELECT_ROWS(ctx.user.id)} WHERE ${conversations.id} = ${id}::uuid`)).rows as Row[];
  if (!row) throw notFound("Percakapan tidak ditemukan.");
  const item = toItem(row);
  const [contact] = (await db.execute(sql`SELECT c.id, c.public_ref, c.display_name FROM contacts c WHERE c.id = ${conv.contactId}::uuid`)).rows as { id: string; public_ref: string; display_name: string | null }[];
  const identities = (await db.execute(sql`SELECT identity_type, identity_value FROM contact_identities WHERE contact_id = ${conv.contactId}::uuid ORDER BY created_at`)).rows as { identity_type: string; identity_value: string }[];
  const leadSources = (await db.execute(sql`SELECT source_type, source_id, source_url, headline, created_at FROM lead_sources WHERE conversation_id = ${id}::uuid ORDER BY created_at LIMIT 5`)).rows as Row[];
  // Riwayat lintas channel: percakapan lain milik kontak yang SAMA, hanya yang lolos fragmen akses yang sama (CCP 3.1).
  const others = (await db.execute(sql`${SELECT_ROWS(ctx.user.id)} WHERE ${sql.join([await conversationAccessSql(ctx, "view"), sql`${conversations.contactId} = ${conv.contactId}::uuid`, sql`${conversations.id} <> ${id}::uuid`], sql` AND `)} ORDER BY ${conversations.lastMessageAt} DESC NULLS LAST LIMIT 20`)).rows as Row[];
  const aiEvents = (await db.execute(sql`SELECT from_status, to_status, reason, version, actor_label, boundary_at, created_at FROM conversation_ai_events WHERE conversation_id = ${id}::uuid ORDER BY id DESC LIMIT 15`)).rows as Row[];
  const activity = (await db.execute(sql`SELECT action, actor_label, result, occurred_at AS created_at, metadata FROM audit_log WHERE object_type = 'conversation' AND object_id = ${id} AND action IN ('conversation.assigned','conversation.transferred','conversation.stray_lead','conversation.ai_changed','conversation.escalated') ORDER BY id DESC LIMIT 15`)).rows as Row[];
  const jobs = (await db.execute(sql`SELECT id, kind, status, status_reason, ai_version, created_at, updated_at FROM automation_jobs WHERE conversation_id = ${id}::uuid ORDER BY created_at DESC LIMIT 10`)).rows as Row[];
  const win = evaluateWindow(conv.lastCustomerMessageAt);
  // Hak aksi untuk percakapan INI (cermin keputusan server; UI memakainya hanya untuk menampilkan tombol — server tetap memeriksa).
  const can = {
    reply: await canAccessConversation(ctx, id, "reply"), note: await canAccessConversation(ctx, id, "note"), ai: await canAccessConversation(ctx, id, "ai"),
    assign: await canAccessConversation(ctx, id, "assign"), transfer: await canAccessConversation(ctx, id, "transfer"),
  };
  // Data routing hanya untuk yang berhak memakainya (nama tim/anggota adalah informasi internal).
  let routing: { teams: { id: string; name: string; members: { id: string; name: string }[] }[]; allTeams: { id: string; name: string }[] } = { teams: [], allTeams: [] };
  if (can.assign || can.transfer) {
    const linked = (await db.execute(sql`SELECT t.id, t.name FROM teams t JOIN team_channels tc ON tc.team_id = t.id WHERE tc.channel_id = ${conv.channelId}::uuid AND t.is_active ORDER BY t.name`)).rows as { id: string; name: string }[];
    const members = linked.length
      ? (await db.execute(sql`SELECT tm.team_id, u.id, u.name FROM team_members tm JOIN users u ON u.id = tm.user_id AND u.status = 'active' WHERE tm.team_id IN (${sql.join(linked.map((t) => sql`${t.id}::uuid`), sql`, `)}) ORDER BY u.name`)).rows as { team_id: string; id: string; name: string }[]
      : [];
    const allTeams = can.transfer ? (await db.execute(sql`SELECT id, name FROM teams WHERE is_active ORDER BY name`)).rows as { id: string; name: string }[] : [];
    routing = { teams: linked.map((t) => ({ id: t.id, name: t.name, members: members.filter((m) => m.team_id === t.id).map((m) => ({ id: m.id, name: m.name })) })), allTeams };
  }
  return {
    conversation: item,
    contact: { id: contact?.id, publicRef: contact?.public_ref, displayName: contact?.display_name ?? null, identities: identities.map((i) => ({ type: i.identity_type, value: i.identity_value })) },
    leadSources: leadSources.map((l) => ({ sourceType: l.source_type, sourceId: l.source_id, sourceUrl: l.source_url, headline: l.headline, at: iso(l.created_at) })),
    otherChannels: others.map(toItem),
    ai: { status: conv.aiStatus, reason: conv.aiOffReason, version: conv.aiVersion, boundaryAt: conv.aiBoundaryAt?.toISOString() ?? null, label: aiLabel(conv.aiStatus, conv.aiOffReason), connected: false },
    window: { open: win.open, reason: win.reason, closesAt: win.closesAt?.toISOString() ?? null, message: win.message },
    jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, status: j.status, reason: j.status_reason, aiVersion: j.ai_version, at: iso(j.updated_at) })),
    can, routing,
    aiEvents: aiEvents.map((e) => ({ from: e.from_status, to: e.to_status, reason: e.reason, version: e.version, actor: e.actor_label, at: iso(e.created_at) })),
    activity: activity.map((a) => ({ action: a.action, actor: a.actor_label, result: a.result, at: iso(a.created_at) })),
  };
}

/** Pesan (urut naik) + catatan internal. Halaman mundur lewat `before` (ISO). Catatan DITANDAI terpisah dan tidak pernah berasal dari tabel pesan. */
export async function listConversationMessages(ctx: Ctx, id: string, o: { before?: string | null; limit?: number } = {}) {
  await needInbox(ctx);
  await getConversationForAction(ctx, id, "view");
  const db = getDb();
  const limit = Math.min(Math.max(o.limit ?? 50, 1), 200);
  const before = o.before && !Number.isNaN(new Date(o.before).getTime()) ? new Date(o.before) : null;
  const rows = (await db.execute(sql`SELECT m.id, m.direction, m.source, m.type, m.raw_type, m.body, m.status, m.error_category, m.is_history, m.provider_ts, m.received_at,
      COALESCE(m.provider_ts, m.received_at) AS t, COALESCE(m.provider_ts, CASE WHEN m.is_history THEN 'epoch'::timestamptz ELSE m.received_at END) AS ord, md.id AS media_id, md.status AS media_status, md.mime AS media_mime
    FROM messages m LEFT JOIN media md ON md.message_id = m.id
    WHERE m.conversation_id = ${id}::uuid ${before ? sql`AND COALESCE(m.provider_ts, CASE WHEN m.is_history THEN 'epoch'::timestamptz ELSE m.received_at END) < ${before}` : sql``}
    ORDER BY ord DESC, m.id DESC LIMIT ${limit + 1}`)).rows as Row[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const from = page[0]?.ord ? new Date(page[0].ord as string) : null;
  const noteWhere = [eq(conversationNotes.conversationId, id)];
  const notes = await db.select().from(conversationNotes).where(and(...noteWhere)).orderBy(conversationNotes.createdAt);
  const inRange = notes.filter((n) => (!from || hasMore === false || n.createdAt >= from) && (!before || n.createdAt < before));
  return {
    hasMore, before: from ? from.toISOString() : null,
    messages: page.map((m) => ({
      id: m.id as string, direction: m.direction as string, source: m.source as string, type: m.type as string, rawType: (m.raw_type as string | null) ?? null,
      body: ((m.body as string | null) ?? null)?.slice(0, 4096) ?? null, status: (m.status as string | null) ?? null, errorCategory: (m.error_category as string | null) ?? null,
      isHistory: !!m.is_history, at: iso(m.t) as string, mediaId: (m.media_id as string | null) ?? null, mediaStatus: (m.media_status as string | null) ?? null,
    })),
    notes: inRange.map((n) => ({ id: n.id, body: n.body, authorId: n.authorId, at: n.createdAt.toISOString() })),
  };
}
