import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { channels, roleGrants, roles, userRoles, users, userGrants } from "@/db/schema";
import { hashPassword } from "@/modules/auth/password";
import { Client, loginRaw } from "./api";
import { freshTotp } from "./clock";

export const PASSWORD = "Sandi-Uji-Panjang-123";

export async function makeUser(o: { email?: string; name?: string; password?: string; superAdmin?: boolean; roleIds?: string[]; mustChange?: boolean; totpRequired?: boolean; status?: "active" | "disabled" } = {}) {
  const email = o.email ?? `u-${randomUUID().slice(0, 8)}@contoh.test`;
  const password = o.password ?? PASSWORD;
  const [u] = await getDb()
    .insert(users)
    .values({ email, name: o.name ?? "Pengguna Uji", passwordHash: await hashPassword(password), isSuperAdmin: o.superAdmin ?? false, mustChangePassword: o.mustChange ?? false, totpRequired: o.totpRequired ?? false, status: o.status ?? "active" })
    .returning();
  if (o.roleIds?.length) await getDb().insert(userRoles).values(o.roleIds.map((roleId) => ({ userId: u!.id, roleId })));
  return { id: u!.id, email, password };
}

export async function makeChannel(name: string, functionLabel = name, extra: Partial<typeof channels.$inferInsert> = {}) {
  const [c] = await getDb().insert(channels).values({ name, functionLabel, integrationKind: "cloud_api_only", environment: "development", isSample: true, ...extra }).returning();
  return c!;
}

export async function makeRole(name: string, grants: { permission: string; scopeAll?: boolean; channelIds?: string[] }[] = [], extra: { require2fa?: boolean } = {}) {
  const [r] = await getDb().insert(roles).values({ name, ...extra }).returning();
  if (grants.length) await getDb().insert(roleGrants).values(grants.map((g) => ({ roleId: r!.id, permission: g.permission, scopeAll: g.scopeAll ?? false, channelIds: g.scopeAll ? [] : (g.channelIds ?? []) })));
  return r!;
}

export async function addUserGrant(userId: string, g: { permission: string; effect: "allow" | "deny"; scopeAll?: boolean; channelIds?: string[] }) {
  await getDb().insert(userGrants).values({ userId, permission: g.permission, effect: g.effect, scopeAll: g.scopeAll ?? false, channelIds: g.scopeAll ? [] : (g.channelIds ?? []) });
}

export async function assignRole(userId: string, roleId: string) {
  await getDb().insert(userRoles).values({ userId, roleId });
}
export async function setRoles(userId: string, roleIds: string[]) {
  await getDb().delete(userRoles).where(eq(userRoles.userId, userId));
  if (roleIds.length) await getDb().insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
}

/** Login penuh untuk pengguna biasa (tanpa 2FA). */
export async function loginFull(u: { email: string; password: string }) {
  const { client, res } = await loginRaw(u.email, u.password);
  if (res.status !== 200) throw new Error(`login gagal: ${res.status} ${JSON.stringify(res.body)}`);
  if (client.stage !== "full") throw new Error(`stage bukan full: ${client.stage}`);
  return client;
}

/** Super Admin dengan 2FA terdaftar dan login penuh. Mengembalikan rahasia TOTP + kode pemulihan untuk test lanjutan. */
export async function makeSuperAdminSession(o: { email?: string } = {}) {
  const u = await makeUser({ superAdmin: true, email: o.email });
  const { client } = await loginRaw(u.email, u.password);
  const setup = await client.post("/api/v1/auth/totp/setup");
  if (setup.status !== 200) throw new Error("setup TOTP gagal: " + JSON.stringify(setup.body));
  const secret: string = setup.body.secret;
  const confirm = await client.post("/api/v1/auth/totp/confirm", { code: freshTotp(secret) });
  if (confirm.status !== 200) throw new Error("konfirmasi TOTP gagal: " + JSON.stringify(confirm.body));
  await client.refresh();
  return { client, user: u, secret, recoveryCodes: confirm.body.recoveryCodes as string[] };
}

export { Client };
