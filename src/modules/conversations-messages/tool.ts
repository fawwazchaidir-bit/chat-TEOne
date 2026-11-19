/** Layanan alat uji integrasi (bukan inbox operasional). Semua baca difilter menurut cakupan channel (`integration.test`). */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { contactIdentities, conversations, inboundEvents, media, messages } from "@/db/schema";
import { getDb } from "@/db/client";
import { forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import { requireFeature } from "@/modules/feature-flags";
import { getChannel } from "@/modules/channels/service";
import { getConnectionView, requeueEvent } from "@/modules/whatsapp-adapter";
import type { Ctx } from "@/modules/shared/context";
import { evaluateWindow } from "./window";
import { maskIdentity } from "./recipients";
import { kickProcessing } from "./worker";

const needTool = async (ctx: Ctx, channelId: string) => {
  await requireFeature("whatsapp_connector");
  await getChannel(ctx, channelId);
  if (!ctx.perms.can("integration.test", channelId)) throw forbidden();
};

/** Daftar channel yang boleh dipakai alat uji oleh pengguna ini (difilter server-side). */
export async function listToolChannels(ctx: Ctx) {
  await requireFeature("whatsapp_connector");
  if (!ctx.perms.canAny("integration.test")) throw forbidden();
  const { listChannels } = await import("@/modules/channels/service");
  return (await listChannels(ctx)).filter((c) => ctx.perms.can("integration.test", c.id));
}

export async function getOverview(ctx: Ctx, channelId: string) {
  await needTool(ctx, channelId);
  const db = getDb();
  const connection = await getConnectionView(ctx, channelId);
  const evCounts = await db.select({ status: inboundEvents.status, n: sql<number>`count(*)::int` }).from(inboundEvents).where(eq(inboundEvents.channelId, channelId)).groupBy(inboundEvents.status);
  const since = new Date(Date.now() - 24 * 3600_000);
  const [unlisted] = await db.select({ n: sql<number>`count(*)::int` }).from(inboundEvents).where(and(eq(inboundEvents.channelId, channelId), eq(inboundEvents.quarantineReason, "pengirim_di_luar_daftar_uji"), gte(inboundEvents.receivedAt, since)));
  const [uncertain] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.channelId, channelId), eq(messages.status, "belum_pasti")));
  const rows = await db
    .select({ m: messages, mediaId: media.id, mediaStatus: media.status, wa: contactIdentities.identityValue, last: conversations.lastCustomerMessageAt })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .leftJoin(media, eq(media.messageId, messages.id))
    .leftJoin(contactIdentities, and(eq(contactIdentities.contactId, conversations.contactId), eq(contactIdentities.identityType, "wa_id")))
    .where(eq(messages.channelId, channelId))
    .orderBy(desc(messages.receivedAt))
    .limit(50);
  return {
    connection,
    events: Object.fromEntries(evCounts.map((e) => [e.status, e.n])) as Record<string, number>,
    unlistedSenders24h: unlisted?.n ?? 0,
    uncertainMessages: uncertain?.n ?? 0,
    messages: rows.map(({ m, mediaId, mediaStatus, wa, last }) => ({
      id: m.id, direction: m.direction, source: m.source, type: m.type, rawType: m.rawType, body: m.body?.slice(0, 500) ?? null, status: m.status,
      errorCategory: m.errorCategory, isHistory: m.isHistory, providerTs: m.providerTs?.toISOString() ?? null, receivedAt: m.receivedAt.toISOString(),
      counterpart: wa ? maskIdentity(wa) : null, mediaId: mediaId ?? null, mediaStatus: mediaStatus ?? null, windowOpen: evaluateWindow(last).open,
    })),
  };
}

export async function listProblemEvents(ctx: Ctx, channelId: string) {
  await needTool(ctx, channelId);
  const rows = await getDb().select({ id: inboundEvents.id, kind: inboundEvents.kind, status: inboundEvents.status, reason: inboundEvents.quarantineReason, attempts: inboundEvents.attempts, lastError: inboundEvents.lastError, receivedAt: inboundEvents.receivedAt, hasPayload: sql<boolean>`${inboundEvents.payload} IS NOT NULL` })
    .from(inboundEvents).where(and(eq(inboundEvents.channelId, channelId), sql`${inboundEvents.status} IN ('failed','quarantined')`)).orderBy(desc(inboundEvents.id)).limit(50);
  return rows.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() }));
}

export async function retryEvent(ctx: Ctx, eventId: number) {
  await requireFeature("whatsapp_connector");
  const [ev] = await getDb().select({ channelId: inboundEvents.channelId, phone: inboundEvents.phoneNumberId }).from(inboundEvents).where(eq(inboundEvents.id, eventId));
  if (!ev) throw notFound("Event tidak ditemukan.");
  // Event terkarantina karena channel tak dikenal belum punya channelId → hanya yang berizin di SEMUA channel yang boleh mengulang.
  if (ev.channelId) await needTool(ctx, ev.channelId);
  else if (!ctx.perms.can("integration.test")) throw notFound("Event tidak ditemukan.");
  const r = await requeueEvent(eventId);
  await writeAudit(getDb(), { ...auditFor(ctx), action: "integration.event_requeued", result: r.ok ? "success" : "failure", objectType: "inbound_event", objectId: String(eventId), metadata: r.ok ? {} : { reason: r.reason } });
  if (r.ok) kickProcessing();
  return r;
}

