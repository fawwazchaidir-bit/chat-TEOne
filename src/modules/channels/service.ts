import { and, eq, isNull } from "drizzle-orm";
import { channels } from "@/db/schema";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import type { Ctx } from "@/modules/shared/context";
import { mapDbError } from "@/modules/shared/db-errors";

export const INTEGRATION_KINDS = { cloud_api_coexistence: "Cloud API — Coexistence", cloud_api_only: "Cloud API — API saja" } as const;
export const CHANNEL_STATUS_LABEL = { belum_dikonfigurasi: "Belum dikonfigurasi", sedang_dikonfigurasi: "Sedang dikonfigurasi" } as const;
const UNIQUE = { channels_active_name_unique: ["CHANNEL_NAME_TAKEN", "Sudah ada channel aktif dengan nama itu."] as [string, string] };

/** Lingkungan channel harus sama dengan lingkungan aplikasi (mode `test` diperlakukan sebagai development). */
export const currentChannelEnvironment = () => (getEnv().APP_ENV === "test" ? "development" : getEnv().APP_ENV);

export type ChannelInput = { name: string; functionLabel: string; description?: string; integrationKind: keyof typeof INTEGRATION_KINDS; isOperational?: boolean };

/** Daftar channel DIFILTER server-side menurut cakupan `channel.view` — channel di luar cakupan tidak pernah dikembalikan. */
export async function listChannels(ctx: Ctx, opts: { includeArchived?: boolean } = {}) {
  if (!ctx.perms.canAny("channel.view")) throw forbidden();
  const rows = await getDb().select().from(channels).where(opts.includeArchived ? undefined : isNull(channels.archivedAt)).orderBy(channels.createdAt);
  return ctx.perms.filterChannels("channel.view", rows);
}

export async function getChannel(ctx: Ctx, id: string) {
  if (!ctx.perms.canAny("channel.view")) throw forbidden();
  const [c] = await getDb().select().from(channels).where(eq(channels.id, id));
  // Di luar cakupan → 404 (tidak membocorkan keberadaan channel).
  if (!c || !ctx.perms.can("channel.view", c.id)) throw notFound("Channel tidak ditemukan.");
  return c;
}

export async function createChannel(ctx: Ctx, input: ChannelInput) {
  // Membuat channel baru berarti hak mengelola di SEMUA channel (tanpa channelId).
  if (!ctx.perms.can("channel.manage")) throw forbidden();
  if (input.isOperational && !ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat menandai channel sebagai operasional.");
  try {
    return await getDb().transaction(async (tx) => {
      const [c] = await tx
        .insert(channels)
        .values({
          name: input.name.trim(), functionLabel: input.functionLabel.trim(), description: input.description?.trim() ?? "",
          integrationKind: input.integrationKind, environment: currentChannelEnvironment(), isOperational: input.isOperational ?? false,
          createdBy: ctx.user.id, updatedBy: ctx.user.id,
        })
        .returning();
      await writeAudit(tx, { ...auditFor(ctx), action: "channel.created", objectType: "channel", objectId: c!.id, metadata: { name: c!.name, functionLabel: c!.functionLabel, integrationKind: c!.integrationKind, isOperational: c!.isOperational } });
      return c!;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}

export async function updateChannel(ctx: Ctx, id: string, patch: Partial<ChannelInput>) {
  const before = await getChannel(ctx, id); // 404 bila di luar cakupan lihat
  if (!ctx.perms.can("channel.manage", id)) throw forbidden();
  if (patch.isOperational !== undefined && patch.isOperational !== before.isOperational && !ctx.user.isSuperAdmin)
    throw forbidden("Hanya Super Admin yang dapat mengubah penanda operasional.");
  if (before.archivedAt) throw badRequest("Channel yang diarsipkan tidak dapat diubah. Pulihkan dulu.", undefined, "CHANNEL_ARCHIVED");
  // Catatan: `status` TIDAK dapat diubah lewat API pada Tahap 1 (tidak ada koneksi nyata → tidak pernah "terhubung").
  try {
    return await getDb().transaction(async (tx) => {
      const [c] = await tx
        .update(channels)
        .set({
          ...(patch.name !== undefined && { name: patch.name.trim() }), ...(patch.functionLabel !== undefined && { functionLabel: patch.functionLabel.trim() }),
          ...(patch.description !== undefined && { description: patch.description.trim() }), ...(patch.integrationKind !== undefined && { integrationKind: patch.integrationKind }),
          ...(patch.isOperational !== undefined && { isOperational: patch.isOperational }), updatedAt: new Date(), updatedBy: ctx.user.id,
        })
        .where(eq(channels.id, id))
        .returning();
      await writeAudit(tx, { ...auditFor(ctx), action: "channel.updated", objectType: "channel", objectId: id, metadata: { before: { name: before.name, functionLabel: before.functionLabel, integrationKind: before.integrationKind, isOperational: before.isOperational }, after: patch } });
      return c!;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}

/**
 * Aturan slot: mengarsipkan membebaskan slot SEGERA (saat commit). Memulihkan channel butuh slot kosong
 * (batas dihitung ulang di database dengan lock) dan nama aktif yang belum dipakai. Jejak audit tetap.
 */
export async function setChannelArchived(ctx: Ctx, id: string, archived: boolean) {
  const c = await getChannel(ctx, id);
  if (!ctx.perms.can("channel.manage", id)) throw forbidden();
  if (archived === Boolean(c.archivedAt)) return c;
  try {
    return await getDb().transaction(async (tx) => {
      const [u] = await tx
        .update(channels)
        .set({ archivedAt: archived ? new Date() : null, archivedBy: archived ? ctx.user.id : null, updatedAt: new Date(), updatedBy: ctx.user.id })
        .where(and(eq(channels.id, id)))
        .returning();
      await writeAudit(tx, { ...auditFor(ctx), action: archived ? "channel.archived" : "channel.unarchived", objectType: "channel", objectId: id, metadata: { name: c.name } });
      return u!;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}
