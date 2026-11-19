import { z } from "zod";
import { inArray } from "drizzle-orm";
import { channels } from "@/db/schema";
import type { Executor } from "@/db/client";
import { badRequest, forbidden } from "@/lib/errors";
import type { Ctx } from "@/modules/shared/context";
import { canDelegate, type GrantInput } from "./engine";
import { PERMISSION_META } from "./registry";

export const grantSchema = z.object({
  permission: z.string().min(1).max(60),
  scopeAll: z.boolean(),
  channelIds: z.array(z.uuid()).max(100).default([]),
});
export const userGrantSchema = grantSchema.extend({ effect: z.enum(["allow", "deny"]) });
export type UserGrantInput = z.infer<typeof userGrantSchema>;

/** Validasi bentuk grant: izin dikenal, cakupan konsisten, channel yang dirujuk ada. */
export async function validateGrants(ex: Executor, grants: (GrantInput & { effect?: string })[]) {
  const seen = new Set<string>();
  const channelIds = new Set<string>();
  for (const g of grants) {
    const meta = PERMISSION_META[g.permission];
    if (!meta) throw badRequest(`Izin tidak dikenal: ${g.permission}`, undefined, "UNKNOWN_PERMISSION");
    const key = `${g.permission}:${g.effect ?? "allow"}`;
    if (seen.has(key)) throw badRequest(`Izin ganda: ${g.permission}`, undefined, "DUPLICATE_GRANT");
    seen.add(key);
    if (!meta.channelScoped && (!g.scopeAll || g.channelIds.length > 0))
      throw badRequest(`Izin "${meta.label}" tidak dapat dibatasi per channel.`, undefined, "SCOPE_NOT_SUPPORTED");
    if (meta.channelScoped && g.scopeAll === (g.channelIds.length > 0))
      throw badRequest(`Pilih "semua channel" ATAU channel tertentu untuk "${meta.label}".`, undefined, "INVALID_SCOPE");
    g.channelIds.forEach((id) => channelIds.add(id));
  }
  if (channelIds.size > 0) {
    const found = await ex.select({ id: channels.id }).from(channels).where(inArray(channels.id, [...channelIds]));
    if (found.length !== channelIds.size) throw badRequest("Ada channel yang tidak ditemukan.", undefined, "INVALID_REFERENCE");
  }
}

const same = (a: GrantInput, b: GrantInput) =>
  a.permission === b.permission && a.scopeAll === b.scopeAll && [...a.channelIds].sort().join() === [...b.channelIds].sort().join();

/**
 * Anti-eskalasi (CCP 1.2): hanya grant yang BARU/BERUBAH yang diperiksa; pemberi tidak boleh memberi izin
 * yang tidak ia miliki (termasuk cakupannya). Menolak/mengurangi izin selalu diperbolehkan.
 */
export function assertDelegable(ctx: Ctx, next: (GrantInput & { effect?: string })[], existing: (GrantInput & { effect?: string })[]) {
  for (const g of next) {
    if ((g.effect ?? "allow") === "deny") continue;
    if (existing.some((e) => (e.effect ?? "allow") === "allow" && same(e, g))) continue;
    if (!canDelegate(ctx.perms, g)) throw forbidden(`Anda tidak boleh memberikan izin "${PERMISSION_META[g.permission]?.label ?? g.permission}" dengan cakupan tersebut.`, "ESCALATION_BLOCKED");
  }
}
