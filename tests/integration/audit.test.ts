import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client as PgClient } from "pg";
import { closeDb, getDb } from "@/db/client";
import { auditLog } from "@/db/schema";
import { writeAudit, redact } from "@/modules/audit";
import { installClock, removeClock } from "../helpers/clock";
import { ownerQuery, resetDb } from "../helpers/db";
import { PASSWORD, loginFull, makeRole, makeSuperAdminSession, makeUser } from "../helpers/fixtures";
import { loginRaw } from "../helpers/api";
import { TEST_APP_URL } from "../test-env";

beforeAll(installClock);
afterAll(async () => { removeClock(); await closeDb(); });
// audit_log append-only → tidak pernah dikosongkan antar test. Test hanya menilai baris yang dibuat SETELAH titik awal ini.
let baselineId = 0;
beforeEach(async () => {
  await resetDb();
  baselineId = (await ownerQuery("select coalesce(max(id),0)::int m from audit_log")).rows[0].m;
});
const rowsSinceStart = () => ownerQuery("select id, occurred_at as \"occurredAt\", actor_user_id as \"actorUserId\", actor_label as \"actorLabel\", action, object_type as \"objectType\", object_id as \"objectId\", result, correlation_id as \"correlationId\" from audit_log where id > $1 order by id", [baselineId]).then((r) => r.rows as (typeof auditLog.$inferSelect)[]);

describe("@tahap-1 audit: peristiwa wajib tercatat", () => {
  it("login/logout, login gagal, pengguna, peran/izin, tim, channel, pengaturan, kill switch → semuanya masuk audit dengan aktor, objek, hasil, ID korelasi", async () => {
    const sa = await makeSuperAdminSession();
    const c = sa.client;
    await loginRaw("tidak-ada@contoh.test", "salah-salah-salah"); // login gagal
    const u = (await c.post("/api/v1/users", { email: "baru@contoh.test", name: "Pengguna Baru", password: PASSWORD })).body;
    await c.patch(`/api/v1/users/${u.id}`, { name: "Nama Berubah" });
    await c.put(`/api/v1/users/${u.id}/status`, { active: false });
    await c.put(`/api/v1/users/${u.id}/status`, { active: true });
    const role = (await c.post("/api/v1/roles", { name: "Peran Uji" })).body;
    await c.put(`/api/v1/roles/${role.id}/grants`, { grants: [{ permission: "report.view", scopeAll: true, channelIds: [] }] });
    await c.put(`/api/v1/users/${u.id}/roles`, { roleIds: [role.id] });
    await c.put(`/api/v1/users/${u.id}/grants`, { grants: [{ permission: "report.view", effect: "deny", scopeAll: true, channelIds: [] }] });
    const team = (await c.post("/api/v1/teams", { name: "Tim Uji" })).body;
    await c.put(`/api/v1/teams/${team.id}/members`, { userIds: [u.id] });
    const ch = (await c.post("/api/v1/channels", { name: "Ch Uji", functionLabel: "Uji", integrationKind: "cloud_api_only" })).body;
    await c.patch(`/api/v1/channels/${ch.id}`, { description: "ubah" });
    await c.post(`/api/v1/channels/${ch.id}/archive`);
    await c.patch("/api/v1/org-settings", { timezone: "Asia/Makassar" });
    await c.put("/api/v1/kill-switch", { scope: { type: "global" }, engaged: true, reason: "uji" });
    await c.put("/api/v1/kill-switch", { scope: { type: "global" }, engaged: false });
    await c.put("/api/v1/feature-flags", { key: "inbox", enabled: true });
    await c.post("/api/v1/auth/logout");

    const rows = await rowsSinceStart();
    const actions = new Set(rows.map((r) => r.action));
    for (const a of [
      "auth.login", "auth.logout", "auth.login_failed", "auth.totp_enabled", "user.created", "user.updated", "user.deactivated", "user.activated",
      "role.created", "role.grants_changed", "user.roles_changed", "user.grants_changed", "team.created", "team.members_changed",
      "channel.created", "channel.updated", "channel.archived", "org_settings.updated", "kill_switch.engaged", "kill_switch.released", "feature_flag.changed",
    ]) expect(actions.has(a), a).toBe(true);

    const created = rows.find((r) => r.action === "channel.created")!;
    expect(created).toMatchObject({ actorUserId: sa.user.id, actorLabel: sa.user.email, objectType: "channel", objectId: ch.id, result: "success" });
    expect(created.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.occurredAt).toBeInstanceOf(Date);
    const failed = rows.find((r) => r.action === "auth.login_failed")!;
    expect(failed.result).toBe("failure");
    expect(failed.actorUserId).toBeNull();
  });

  it("izin ditolak/eskalasi tidak mengubah data DAN tidak meninggalkan audit perubahan", async () => {
    const r = await makeRole("Pengelola", [{ permission: "user.manage", scopeAll: true }, { permission: "role.manage", scopeAll: true }]);
    const mgr = await loginFull(await makeUser({ roleIds: [r.id] }));
    const victim = await makeUser();
    const before = (await ownerQuery("select count(*)::int n from audit_log where action = 'user.grants_changed'")).rows[0].n;
    expect((await mgr.put(`/api/v1/users/${victim.id}/grants`, { grants: [{ permission: "audit.view", effect: "allow", scopeAll: true, channelIds: [] }] })).status).toBe(403);
    const after = (await ownerQuery("select count(*)::int n from audit_log where action = 'user.grants_changed'")).rows[0].n;
    expect(after).toBe(before);
  });

  it("filter & paginasi audit; hanya pemegang audit.view", async () => {
    const sa = await makeSuperAdminSession();
    for (let i = 0; i < 5; i++) await sa.client.post("/api/v1/teams", { name: `Tim ${i}` });
    const p1 = await sa.client.get("/api/v1/audit?action=team.created&limit=3");
    expect(p1.body.items).toHaveLength(3);
    expect(p1.body.nextBeforeId).toBeTruthy();
    const p2 = await sa.client.get(`/api/v1/audit?action=team.created&limit=3&beforeId=${p1.body.nextBeforeId}`);
    expect(p2.body.items.length).toBeGreaterThanOrEqual(2);
    const ids = [...p1.body.items, ...p2.body.items].map((x: { id: number }) => x.id);
    expect(new Set(ids).size).toBe(ids.length); // tanpa duplikat antar halaman
    expect((await sa.client.get("/api/v1/audit?limit=9999")).status).toBe(400);
  });
});

describe("@tahap-1 audit: append-only bagi aplikasi (CCP 1.4)", () => {
  async function appQuery(q: string) {
    const c = new PgClient({ connectionString: TEST_APP_URL });
    await c.connect();
    try { await c.query(q); return null; } catch (e) { return e as { code?: string; message: string }; } finally { await c.end(); }
  }

  it("role aplikasi dapat INSERT & SELECT, tetapi UPDATE / DELETE / TRUNCATE ditolak (hak akses)", async () => {
    await writeAudit(getDb(), { action: "uji.append", actorLabel: "uji" });
    const row = (await ownerQuery("select id from audit_log where action='uji.append' limit 1")).rows[0];
    expect(row).toBeTruthy();
    for (const q of [
      `UPDATE audit_log SET action = 'diubah' WHERE id = ${row.id}`,
      `DELETE FROM audit_log WHERE id = ${row.id}`,
      `TRUNCATE audit_log`,
    ]) {
      const err = await appQuery(q);
      expect(err?.code, q).toBe("42501"); // insufficient_privilege
    }
    expect((await ownerQuery("select action from audit_log where id=$1", [row.id])).rows[0].action).toBe("uji.append");
  });

  it("bahkan PEMILIK tabel ditolak oleh trigger (lapis kedua) — UPDATE, DELETE, TRUNCATE", async () => {
    await writeAudit(getDb(), { action: "uji.append2", actorLabel: "uji" });
    for (const q of [`UPDATE audit_log SET action = 'x'`, `DELETE FROM audit_log`, `TRUNCATE audit_log`]) {
      const err = await ownerQuery(q).catch((e) => e);
      expect(err.code, q).toBe("42501");
      expect(String(err.message)).toContain("append-only");
    }
    expect((await ownerQuery("select count(*)::int n from audit_log where action='uji.append2'")).rows[0].n).toBe(1);
  });

  it("aplikasi tidak dapat melepas trigger, mengubah tabel, atau membuat objek (tanpa hak DDL)", async () => {
    for (const q of [`ALTER TABLE audit_log DISABLE TRIGGER ALL`, `DROP TRIGGER audit_log_no_update_delete ON audit_log`, `DROP TABLE audit_log`, `CREATE TABLE x(a int)`]) {
      const err = await appQuery(q);
      expect(err?.code, q).toBe("42501");
    }
  });
});

describe("@tahap-1 audit: tidak menyimpan rahasia", () => {
  it("redact menyamarkan kunci sensitif, memotong string panjang, dan membatasi kedalaman", () => {
    const out = redact({ password: "abc", newPassword: "abc", totpSecret: "x", recoveryCodes: ["a"], token: "t", csrfToken: "c", apiKey: "k", nama: "aman", nested: { passwordHash: "h", ok: 1 }, panjang: "z".repeat(900) }) as Record<string, unknown>;
    expect(out.password).toBe("[disamarkan]");
    expect(out.newPassword).toBe("[disamarkan]");
    expect(out.totpSecret).toBe("[disamarkan]");
    expect(out.recoveryCodes).toBe("[disamarkan]");
    expect(out.token).toBe("[disamarkan]");
    expect(out.csrfToken).toBe("[disamarkan]");
    expect(out.apiKey).toBe("[disamarkan]");
    expect(out.nama).toBe("aman");
    expect((out.nested as Record<string, unknown>).passwordHash).toBe("[disamarkan]");
    expect((out.panjang as string).length).toBeLessThan(510);
  });

  it("setelah alur nyata (sandi, TOTP, kode pemulihan, token sesi), tidak ada rahasia di seluruh audit_log", async () => {
    const sa = await makeSuperAdminSession();
    const target = await makeUser();
    const secretPw = "Sandi-Rahasia-Sementara-777";
    await sa.client.post(`/api/v1/users/${target.id}/reset-password`, { newPassword: secretPw });
    await sa.client.post("/api/v1/users", { email: "rahasia@contoh.test", name: "R", password: secretPw });
    const token = sa.client.cookie!.split("=")[1]!;
    const all = JSON.stringify((await ownerQuery("select * from audit_log")).rows);
    for (const secret of [secretPw, PASSWORD, sa.secret, token, sa.client.csrf!, ...sa.recoveryCodes, ...sa.recoveryCodes.map((c) => c.replace(/-/g, ""))]) {
      expect(all.includes(secret), `rahasia bocor: ${secret.slice(0, 4)}…`).toBe(false);
    }
    expect(all).not.toMatch(/argon2id/); // hash sandi pun tidak
  });
});

