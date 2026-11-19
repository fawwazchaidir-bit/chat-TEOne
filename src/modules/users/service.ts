import { eq, inArray } from "drizzle-orm";
import { roleGrants, roles, userGrants, userRoles, users } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import { assertPasswordPolicy, hashPassword } from "@/modules/auth/password";
import { destroyUserSessions } from "@/modules/auth/session";
import { normalizeEmail } from "@/modules/auth/service";
import { recoveryCodes } from "@/db/schema";
import type { Ctx } from "@/modules/shared/context";
import { mapDbError } from "@/modules/shared/db-errors";
import { assertDelegable, validateGrants, type UserGrantInput } from "@/modules/roles-permissions/grants";

const UNIQUE = { users_email_unique: ["EMAIL_TAKEN", "Email sudah dipakai pengguna lain."] as [string, string] };

const publicCols = {
  id: users.id, email: users.email, name: users.name, status: users.status, isSuperAdmin: users.isSuperAdmin,
  mustChangePassword: users.mustChangePassword, totpEnabled: users.totpEnabled, totpRequired: users.totpRequired,
  createdAt: users.createdAt, disabledAt: users.disabledAt,
};

async function getTarget(ctx: Ctx, id: string) {
  const [t] = await getDb().select(publicCols).from(users).where(eq(users.id, id));
  if (!t) throw notFound("Pengguna tidak ditemukan.");
  return t;
}

/** Aturan umum atas pengguna lain: Super Admin hanya dapat diubah oleh Super Admin; mengubah diri sendiri dibatasi. */
function assertCanActOn(ctx: Ctx, target: { id: string; isSuperAdmin: boolean }, opts: { allowSelf?: boolean } = {}) {
  if (target.isSuperAdmin && !ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat mengubah akun Super Admin.", "SUPER_ADMIN_PROTECTED");
  if (!opts.allowSelf && target.id === ctx.user.id) throw forbidden("Anda tidak dapat melakukan tindakan ini pada akun Anda sendiri.", "SELF_ACTION_FORBIDDEN");
}

const need = (ctx: Ctx, perm: string) => {
  if (!ctx.perms.can(perm)) throw forbidden();
};

export async function listUsers(ctx: Ctx) {
  need(ctx, "user.manage");
  const rows = await getDb().select(publicCols).from(users).orderBy(users.name);
  const rr = await getDb().select({ userId: userRoles.userId, roleId: roles.id, name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId));
  return rows.map((u) => ({ ...u, roles: rr.filter((r) => r.userId === u.id).map((r) => ({ id: r.roleId, name: r.name })) }));
}

/** Direktori ringkas (id, nama, email) untuk memilih anggota tim. Cukup `user.manage` ATAU `team.manage`. */
export async function listUserDirectory(ctx: Ctx) {
  if (!ctx.perms.can("user.manage") && !ctx.perms.can("team.manage")) throw forbidden();
  return getDb().select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.status, "active")).orderBy(users.name);
}

export async function getUser(ctx: Ctx, id: string) {
  need(ctx, "user.manage");
  const db = getDb();
  const u = await getTarget(ctx, id);
  const rr = await db.select({ id: roles.id, name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, id));
  const grants = await db.select().from(userGrants).where(eq(userGrants.userId, id));
  return { ...u, roles: rr, grants: grants.map((g) => ({ permission: g.permission, effect: g.effect, scopeAll: g.scopeAll, channelIds: g.channelIds })) };
}

export async function createUser(ctx: Ctx, input: { email: string; name: string; password: string; roleIds?: string[]; totpRequired?: boolean }) {
  need(ctx, "user.manage");
  const email = normalizeEmail(input.email);
  assertPasswordPolicy(input.password, email);
  if (input.totpRequired && !ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat mewajibkan 2FA per pengguna.");
  if (input.roleIds?.length) need(ctx, "role.manage");
  const passwordHash = await hashPassword(input.password);
  try {
    return await getDb().transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ email, name: input.name.trim(), passwordHash, mustChangePassword: true, totpRequired: input.totpRequired ?? false, createdBy: ctx.user.id })
        .returning(publicCols);
      if (!u) throw new Error("insert gagal");
      if (input.roleIds?.length) await applyRoles(ctx, tx, u.id, input.roleIds, []);
      await writeAudit(tx, { ...auditFor(ctx), action: "user.created", objectType: "user", objectId: u.id, metadata: { email, roleIds: input.roleIds ?? [], totpRequired: input.totpRequired ?? false } });
      return u;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}

export async function updateUser(ctx: Ctx, id: string, patch: { name?: string; email?: string; totpRequired?: boolean }) {
  need(ctx, "user.manage");
  const target = await getTarget(ctx, id);
  assertCanActOn(ctx, target, { allowSelf: true });
  if (patch.totpRequired !== undefined && !ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat mewajibkan 2FA per pengguna.");
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.email !== undefined) set.email = normalizeEmail(patch.email);
  if (patch.totpRequired !== undefined) set.totpRequired = patch.totpRequired;
  try {
    return await getDb().transaction(async (tx) => {
      const [u] = await tx.update(users).set(set).where(eq(users.id, id)).returning(publicCols);
      await writeAudit(tx, { ...auditFor(ctx), action: "user.updated", objectType: "user", objectId: id, metadata: { before: { name: target.name, email: target.email, totpRequired: target.totpRequired }, after: patch } });
      return u!;
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
}

export async function setUserActive(ctx: Ctx, id: string, active: boolean) {
  need(ctx, "user.manage");
  const target = await getTarget(ctx, id);
  assertCanActOn(ctx, target);
  try {
    await getDb().transaction(async (tx) => {
      await tx.update(users).set({ status: active ? "active" : "disabled", disabledAt: active ? null : new Date(), updatedAt: new Date() }).where(eq(users.id, id));
      if (!active) await destroyUserSessions(id, tx); // session lama langsung tidak berlaku
      await writeAudit(tx, { ...auditFor(ctx), action: active ? "user.activated" : "user.deactivated", objectType: "user", objectId: id });
    });
  } catch (e) {
    mapDbError(e);
  }
}

export async function setSuperAdmin(ctx: Ctx, id: string, value: boolean) {
  if (!ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat memberi atau mencabut hak Super Admin.", "SUPER_ADMIN_ONLY");
  const target = await getTarget(ctx, id);
  assertCanActOn(ctx, target);
  if (value && target.status !== "active") throw badRequest("Pengguna nonaktif tidak dapat dijadikan Super Admin.");
  try {
    await getDb().transaction(async (tx) => {
      await tx.update(users).set({ isSuperAdmin: value, updatedAt: new Date() }).where(eq(users.id, id));
      await writeAudit(tx, { ...auditFor(ctx), action: value ? "user.super_admin_granted" : "user.super_admin_revoked", objectType: "user", objectId: id });
    });
  } catch (e) {
    mapDbError(e);
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function applyRoles(ctx: Ctx, tx: Tx, userId: string, roleIds: string[], current: string[]) {
  const unique = [...new Set(roleIds)];
  if (unique.length) {
    const found = await tx.select({ id: roles.id }).from(roles).where(inArray(roles.id, unique));
    if (found.length !== unique.length) throw badRequest("Ada peran yang tidak ditemukan.", undefined, "INVALID_REFERENCE");
  }
  const added = unique.filter((r) => !current.includes(r));
  // Peran yang ditambahkan tidak boleh memuat izin yang tidak dimiliki pemberi (anti-eskalasi).
  for (const roleId of added) {
    const gs = await tx.select().from(roleGrants).where(eq(roleGrants.roleId, roleId));
    assertDelegable(ctx, gs, []);
  }
  await tx.delete(userRoles).where(eq(userRoles.userId, userId));
  if (unique.length) await tx.insert(userRoles).values(unique.map((roleId) => ({ userId, roleId, assignedBy: ctx.user.id })));
  return { added, removed: current.filter((r) => !unique.includes(r)) };
}

export async function setUserRoles(ctx: Ctx, id: string, roleIds: string[]) {
  need(ctx, "role.manage");
  const target = await getTarget(ctx, id);
  assertCanActOn(ctx, target); // termasuk: tidak boleh mengubah peran sendiri
  return getDb().transaction(async (tx) => {
    const current = (await tx.select({ id: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, id))).map((r) => r.id);
    const diff = await applyRoles(ctx, tx, id, roleIds, current);
    await writeAudit(tx, { ...auditFor(ctx), action: "user.roles_changed", objectType: "user", objectId: id, metadata: diff });
    return diff;
  });
}

export async function setUserGrants(ctx: Ctx, id: string, grants: UserGrantInput[]) {
  need(ctx, "role.manage");
  const target = await getTarget(ctx, id);
  assertCanActOn(ctx, target);
  return getDb().transaction(async (tx) => {
    await validateGrants(tx, grants);
    const existing = await tx.select().from(userGrants).where(eq(userGrants.userId, id));
    assertDelegable(ctx, grants, existing);
    await tx.delete(userGrants).where(eq(userGrants.userId, id));
    if (grants.length) await tx.insert(userGrants).values(grants.map((g) => ({ userId: id, permission: g.permission, effect: g.effect, scopeAll: g.scopeAll, channelIds: g.scopeAll ? [] : g.channelIds })));
    await writeAudit(tx, { ...auditFor(ctx), action: "user.grants_changed", objectType: "user", objectId: id, metadata: { grants: grants.map((g) => `${g.effect}:${g.permission}:${g.scopeAll ? "semua" : g.channelIds.length + " channel"}`) } });
  });
}

/** Pemulihan akun oleh administrator: sandi sementara (wajib diganti) — semua session pengguna dicabut. */
export async function adminResetPassword(ctx: Ctx, id: string, newPassword: string) {
  need(ctx, "user.manage");
  const target = await getTarget(ctx, id);
  assertCanActOn(ctx, target);
  assertPasswordPolicy(newPassword, target.email);
  const passwordHash = await hashPassword(newPassword);
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, id));
    await destroyUserSessions(id, tx);
    await writeAudit(tx, { ...auditFor(ctx), action: "user.password_reset", objectType: "user", objectId: id });
  });
}

/** Reset 2FA (perangkat hilang): pengguna wajib mendaftarkan ulang pada login berikutnya jika 2FA diwajibkan. */
export async function adminResetTotp(ctx: Ctx, id: string) {
  need(ctx, "user.manage");
  const target = await getTarget(ctx, id);
  assertCanActOn(ctx, target);
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ totpEnabled: false, totpSecretEnc: null, totpLastStep: null, updatedAt: new Date() }).where(eq(users.id, id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, id));
    await destroyUserSessions(id, tx);
    await writeAudit(tx, { ...auditFor(ctx), action: "user.totp_reset", objectType: "user", objectId: id });
  });
}
