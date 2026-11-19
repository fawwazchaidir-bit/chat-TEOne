import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { E2E_ADMIN_URL, E2E_CUSTOMER, E2E_DB, E2E_ENV, E2E_OWNER_URL, E2E_PHONE_ID, E2E_WABA, FIXTURE_FILE } from "./env";

export const E2E_SA = { email: "superadmin@e2e.contoh.test", name: "Super Admin E2E", password: "Sandi-E2E-Super-Admin-1" };
export const E2E_KEMITRAAN = { email: "kemitraan@e2e.contoh.test", name: "Penguji Kemitraan E2E", password: "Sandi-E2E-Kemitraan-Uji-1" };
export const E2E_HOTLINE = { email: "hotline@e2e.contoh.test", name: "Admin Hotline E2E", password: "Sandi-E2E-Hotline-Admin-1" };

/** Membuat database E2E dari nol, migrasi, seed contoh, Super Admin (lewat jalur bootstrap CLI), dan satu Admin Hotline. */
export async function prepareE2eDatabase() {
  const admin = new Client({ connectionString: E2E_ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
  for (const [role, pw, extra] of [["teone_owner", "owner_test_pw", ""], ["teone_app", "app_test_pw", "NOSUPERUSER NOCREATEDB NOCREATEROLE"]] as const) {
    const ex = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (ex.rowCount === 0) await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${pw}' ${extra}`);
    else await admin.query(`ALTER ROLE ${role} PASSWORD '${pw}'`);
  }
  await admin.query(`CREATE DATABASE ${E2E_DB} OWNER teone_owner`);
  await admin.end();
  const db = new Client({ connectionString: E2E_ADMIN_URL.replace(/\/[^/]*$/, `/${E2E_DB}`) });
  await db.connect();
  await db.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO teone_owner; GRANT USAGE ON SCHEMA public TO teone_app;");
  await db.end();

  Object.assign(process.env, E2E_ENV);
  const { runMigrations } = await import("../../scripts/migrate");
  await runMigrations(E2E_OWNER_URL, { quiet: true });
  const { seedSample } = await import("../../scripts/seed-sample");
  await seedSample();
  const { bootstrapSuperAdmin } = await import("../../scripts/bootstrap-super-admin");
  await bootstrapSuperAdmin(E2E_SA);

  const { getDb, closeDb } = await import("../../src/db/client");
  const { users, roles, userRoles, channels } = await import("../../src/db/schema");
  const { hashPassword } = await import("../../src/modules/auth/password");
  const { eq } = await import("drizzle-orm");
  const d = getDb();
  const [u] = await d.insert(users).values({ email: E2E_HOTLINE.email, name: E2E_HOTLINE.name, passwordHash: await hashPassword(E2E_HOTLINE.password), mustChangePassword: false }).returning({ id: users.id });
  const [role] = await d.select({ id: roles.id }).from(roles).where(eq(roles.name, "Admin Hotline"));
  await d.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const chs = await d.select({ id: channels.id, name: channels.name }).from(channels);
  // Tahap 2: flag nyala, koneksi channel Kemitraan terpetakan, penerima uji, dan penguji khusus integrasi.
  const { channelConnections, testRecipients, featureFlagOverrides, roleGrants } = await import("../../src/db/schema");
  const kem = chs.find((c) => c.name === "Kemitraan — contoh")!;
  await d.insert(featureFlagOverrides).values({ key: "whatsapp_connector", enabled: true });
  await d.insert(channelConnections).values({ channelId: kem.id, wabaId: E2E_WABA, phoneNumberId: E2E_PHONE_ID });
  await d.insert(testRecipients).values({ label: "Peserta uji E2E", identityValue: E2E_CUSTOMER });
  const [tr] = await d.insert(roles).values({ name: "Penguji Integrasi E2E" }).returning({ id: roles.id });
  await d.insert(roleGrants).values([
    { roleId: tr!.id, permission: "channel.view", scopeAll: false, channelIds: [kem.id] },
    { roleId: tr!.id, permission: "channel.manage", scopeAll: false, channelIds: [kem.id] },
    { roleId: tr!.id, permission: "integration.test", scopeAll: true, channelIds: [] },
  ]);
  const [ku] = await d.insert(users).values({ email: E2E_KEMITRAAN.email, name: E2E_KEMITRAAN.name, passwordHash: await hashPassword(E2E_KEMITRAAN.password), mustChangePassword: false }).returning({ id: users.id });
  await d.insert(userRoles).values({ userId: ku!.id, roleId: tr!.id });
  await closeDb();

  mkdirSync(path.dirname(FIXTURE_FILE), { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify({ sa: E2E_SA, hotline: E2E_HOTLINE, kemitraan: E2E_KEMITRAAN, channels: Object.fromEntries(chs.map((c) => [c.name, c.id])) }));
}

if (process.argv[1]?.endsWith("prepare-db.ts")) {
  prepareE2eDatabase().then(() => console.log("[e2e] database E2E siap")).catch((e) => { console.error("[e2e] gagal menyiapkan database:", e.message); process.exit(1); });
}
