import { eq, sql } from "drizzle-orm";
import { roleGrants, roles, userRoles } from "@/db/schema";
import { getDb } from "@/db/client";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import type { Ctx } from "@/modules/shared/context";
import { mapDbError } from "@/modules/shared/db-errors";
import { assertDelegable, validateGrants } from "./grants";
import type { GrantInput } from "./engine";

const UNIQUE = { roles_name_unique: ["ROLE_NAME_TAKEN", "Nama peran sudah dipakai."] as [string, string] };
const need = (ctx: Ctx, perm: string) => { if (!ctx.perms.can(perm)) throw forbidden(); };

async function userHoldsRole(ctx: Ctx, roleId: string) {
  const r = await getDb().select({ r: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, ctx.user.id));
  return r.some((x) => x.r === roleId);
}

export async function listRoles(ctx: Ctx) {
  if (!ctx.perms.can("role.manage") && !ctx.perms.can("user.manage")) throw forbidden();
  const db = getDb();
  const rs = await db.select().from(roles).orderBy(roles.name);
  const gs = await db.select().from(roleGrants);
  const counts = await db.select({ roleId: userRoles.roleId, n: sql<number>`count(*)::int` }).from(userRoles).groupBy(userRoles.roleId);
  return rs.map((r) => ({
    ...r,
    memberCount: counts.find((c) => c.roleId === r.id)?.n ?? 0,
    grants: gs.filter((g) => g.roleId === r.id).map((g) => ({ permission: g.permission, scopeAll: g.scopeAll, channelIds: g.channelIds })),
  }));
}

export async function createRole(ctx: Ctx, input: { name: string; description?: string; require2fa?: boolean }) {
  need(ctx, "role.manage");
  if (input.require2fa && !ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat mewajibkan 2FA per peran.");
  try {
    return await getDb().transaction(async (tx) => {
      const [r] = await tx.insert(roles).values({ name: input.name.trim(), description: input.description?.trim() ?? "", require2fa: input.require2fa ?? false }).returning();
      await writeAudit(tx, { ...auditFor(ctx), action: "role.created", objectType: "role", objectId: r!.id, metadata: { name: r!.name } });
      return r!;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}

export async function updateRole(ctx: Ctx, id: string, patch: { name?: string; description?: string; require2fa?: boolean }) {
  need(ctx, "role.manage");
  const [role] = await getDb().select().from(roles).where(eq(roles.id, id));
  if (!role) throw notFound("Peran tidak ditemukan.");
  if (!ctx.user.isSuperAdmin && (await userHoldsRole(ctx, id))) throw forbidden("Anda tidak dapat mengubah peran yang Anda miliki sendiri.", "SELF_ROLE_EDIT_FORBIDDEN");
  if (patch.require2fa !== undefined && !ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat mewajibkan 2FA per peran.");
  try {
    return await getDb().transaction(async (tx) => {
      const [r] = await tx
        .update(roles)
        .set({ ...(patch.name !== undefined && { name: patch.name.trim() }), ...(patch.description !== undefined && { description: patch.description.trim() }), ...(patch.require2fa !== undefined && { require2fa: patch.require2fa }), updatedAt: new Date() })
        .where(eq(roles.id, id))
        .returning();
      await writeAudit(tx, { ...auditFor(ctx), action: "role.updated", objectType: "role", objectId: id, metadata: { before: { name: role.name, require2fa: role.require2fa }, after: patch } });
      return r!;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}

export async function setRoleGrants(ctx: Ctx, id: string, grants: GrantInput[]) {
  need(ctx, "role.manage");
  const [role] = await getDb().select().from(roles).where(eq(roles.id, id));
  if (!role) throw notFound("Peran tidak ditemukan.");
  // Pemegang peran tidak boleh memperluas peran miliknya sendiri (menaikkan hak sendiri secara tidak langsung).
  if (!ctx.user.isSuperAdmin && (await userHoldsRole(ctx, id))) throw forbidden("Anda tidak dapat mengubah izin peran yang Anda miliki sendiri.", "SELF_ROLE_EDIT_FORBIDDEN");
  return getDb().transaction(async (tx) => {
    await validateGrants(tx, grants);
    const existing = await tx.select().from(roleGrants).where(eq(roleGrants.roleId, id));
    assertDelegable(ctx, grants, existing);
    await tx.delete(roleGrants).where(eq(roleGrants.roleId, id));
    if (grants.length) await tx.insert(roleGrants).values(grants.map((g) => ({ roleId: id, permission: g.permission, scopeAll: g.scopeAll, channelIds: g.scopeAll ? [] : g.channelIds })));
    await writeAudit(tx, { ...auditFor(ctx), action: "role.grants_changed", objectType: "role", objectId: id, metadata: { grants: grants.map((g) => `${g.permission}:${g.scopeAll ? "semua" : g.channelIds.length + " channel"}`) } });
  });
}

export async function deleteRole(ctx: Ctx, id: string) {
  need(ctx, "role.manage");
  const [role] = await getDb().select().from(roles).where(eq(roles.id, id));
  if (!role) throw notFound("Peran tidak ditemukan.");
  if (role.isSystem) throw conflict("ROLE_IS_SYSTEM", "Peran bawaan tidak dapat dihapus.");
  if (!ctx.user.isSuperAdmin && (await userHoldsRole(ctx, id))) throw forbidden("Anda tidak dapat menghapus peran yang Anda miliki.");
  const [c] = await getDb().select({ n: sql<number>`count(*)::int` }).from(userRoles).where(eq(userRoles.roleId, id));
  if ((c?.n ?? 0) > 0) throw conflict("ROLE_IN_USE", "Peran masih dipakai pengguna. Lepaskan dulu dari semua pengguna.");
  await getDb().transaction(async (tx) => {
    await tx.delete(roles).where(eq(roles.id, id));
    await writeAudit(tx, { ...auditFor(ctx), action: "role.deleted", objectType: "role", objectId: id, metadata: { name: role.name } });
  });
}
