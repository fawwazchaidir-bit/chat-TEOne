import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { users } from "@/db/schema";
import { installClock, removeClock } from "../helpers/clock";
import { resetDb, ownerQuery } from "../helpers/db";
import { addUserGrant, assignRole, loginFull, makeChannel, makeRole, makeSuperAdminSession, makeUser, setRoles } from "../helpers/fixtures";
import { loginRaw } from "../helpers/api";

beforeAll(installClock);
afterAll(async () => { removeClock(); await closeDb(); });
beforeEach(resetDb);

async function world() {
  const admisi = await makeChannel("Admisi — contoh", "Admisi");
  const hotline = await makeChannel("Hotline — contoh", "Hotline");
  const rolePerms = ["channel.view", "channel.manage"];
  const rAdmisi = await makeRole("Admin Admisi", rolePerms.map((permission) => ({ permission, channelIds: [admisi.id] })));
  const rHotline = await makeRole("Admin Hotline", rolePerms.map((permission) => ({ permission, channelIds: [hotline.id] })));
  const uHotline = await makeUser({ roleIds: [rHotline.id] });
  const uAdmisi = await makeUser({ roleIds: [rAdmisi.id] });
  return { admisi, hotline, rAdmisi, rHotline, uHotline, uAdmisi };
}

describe("@tahap-1 izin diperiksa di server: cakupan channel (UI & API langsung)", () => {
  it("pengguna Hotline TIDAK dapat membaca data channel Admisi — daftar, detail, ubah, arsip", async () => {
    const w = await world();
    const c = await loginFull(w.uHotline);

    const list = await c.get("/api/v1/channels");
    expect(list.status).toBe(200);
    expect(list.body.items.map((x: { name: string }) => x.name)).toEqual(["Hotline — contoh"]); // Admisi tidak bocor
    expect(JSON.stringify(list.body)).not.toContain(w.admisi.id);

    expect((await c.get(`/api/v1/channels/${w.hotline.id}`)).status).toBe(200);
    const direct = await c.get(`/api/v1/channels/${w.admisi.id}`);
    expect(direct.status).toBe(404); // keberadaan channel di luar cakupan tidak dibocorkan
    expect(JSON.stringify(direct.body)).not.toContain("Admisi");

    expect((await c.patch(`/api/v1/channels/${w.admisi.id}`, { name: "diretas" })).status).toBe(404);
    expect((await c.post(`/api/v1/channels/${w.admisi.id}/archive`)).status).toBe(404);
    const [row] = await ownerQuery("select name, archived_at from channels where id=$1", [w.admisi.id]).then((r) => r.rows);
    expect(row.name).toBe("Admisi — contoh");
    expect(row.archived_at).toBeNull();
  });

  it("izin 'lihat' tanpa 'kelola' → tidak dapat mengubah channel yang terlihat (403)", async () => {
    const hotline = await makeChannel("Hotline — contoh", "Hotline");
    const r = await makeRole("Pemantau", [{ permission: "channel.view", channelIds: [hotline.id] }]);
    const c = await loginFull(await makeUser({ roleIds: [r.id] }));
    expect((await c.get(`/api/v1/channels/${hotline.id}`)).status).toBe(200);
    expect((await c.patch(`/api/v1/channels/${hotline.id}`, { name: "Baru" })).status).toBe(403);
    expect((await c.post(`/api/v1/channels/${hotline.id}/archive`)).status).toBe(403);
  });

  it("membuat channel baru memerlukan izin kelola di SEMUA channel; admin satu channel ditolak", async () => {
    const w = await world();
    const c = await loginFull(w.uHotline);
    const r = await c.post("/api/v1/channels", { name: "Channel Baru", functionLabel: "Finance", integrationKind: "cloud_api_only" });
    expect(r.status).toBe(403);
  });

  it("pengguna tanpa izin apa pun: 403 pada semua endpoint administratif", async () => {
    await world();
    const c = await loginFull(await makeUser());
    const paths = ["/api/v1/users", "/api/v1/roles", "/api/v1/teams", "/api/v1/channels", "/api/v1/audit", "/api/v1/kill-switch", "/api/v1/feature-flags"];
    for (const p of paths) expect((await c.get(p)).status, p).toBe(403);
    expect((await c.post("/api/v1/users", { email: "a@b.test", name: "Aa", password: "Sandi-Uji-Panjang-123" })).status).toBe(403);
    expect((await c.patch("/api/v1/org-settings", { maxChannels: 50 })).status).toBe(403);
  });

  it("tim: nama channel di luar cakupan pengguna tidak ditampilkan; tidak dapat memasang channel di luar cakupan", async () => {
    const w = await world();
    const sa = await makeSuperAdminSession();
    const team = (await sa.client.post("/api/v1/teams", { name: "Tim Campuran" })).body;
    expect((await sa.client.put(`/api/v1/teams/${team.id}/channels`, { channelIds: [w.admisi.id, w.hotline.id] })).status).toBe(200);

    const r = await makeRole("Manajer Tim", [{ permission: "team.manage", scopeAll: true }, { permission: "channel.view", channelIds: [w.hotline.id] }]);
    const c = await loginFull(await makeUser({ roleIds: [r.id] }));
    const t = await c.get(`/api/v1/teams/${team.id}`);
    expect(t.body.channels.map((x: { name: string }) => x.name)).toEqual(["Hotline — contoh"]);
    expect(JSON.stringify(t.body)).not.toContain("Admisi");
    expect((await c.put(`/api/v1/teams/${team.id}/channels`, { channelIds: [w.admisi.id] })).status).toBe(403);
    // menyimpan perubahan tidak menghapus channel tersembunyi milik tim
    expect((await c.put(`/api/v1/teams/${team.id}/channels`, { channelIds: [w.hotline.id] })).status).toBe(200);
    const after = await sa.client.get(`/api/v1/teams/${team.id}`);
    expect(after.body.channels).toHaveLength(2);
  });
});

describe("@tahap-1 izin: perubahan langsung berlaku & penolakan per pengguna", () => {
  it("izin dicabut/ditambah → berlaku pada permintaan berikutnya tanpa login ulang", async () => {
    const w = await world();
    const c = await loginFull(w.uHotline);
    expect((await c.get(`/api/v1/channels/${w.hotline.id}`)).status).toBe(200);
    await setRoles(w.uHotline.id, []);
    expect((await c.get(`/api/v1/channels/${w.hotline.id}`)).status).toBe(403);
    await setRoles(w.uHotline.id, [w.rHotline.id]);
    expect((await c.get(`/api/v1/channels/${w.hotline.id}`)).status).toBe(200);
  });

  it("penolakan spesifik pengguna mengalahkan izin dari peran", async () => {
    const w = await world();
    const c = await loginFull(w.uHotline);
    expect((await c.get(`/api/v1/channels/${w.hotline.id}`)).status).toBe(200);
    await addUserGrant(w.uHotline.id, { permission: "channel.view", effect: "deny", channelIds: [w.hotline.id] });
    // Satu-satunya channel miliknya ditolak → tidak punya channel.view di mana pun → 403 di semua jalur.
    expect((await c.get(`/api/v1/channels/${w.hotline.id}`)).status).toBe(403);
    expect((await c.get("/api/v1/channels")).status).toBe(403);
  });

  it("penolakan atas SATU dari dua channel: yang ditolak 404 dan tidak muncul di daftar", async () => {
    const w = await world();
    const both = await makeRole("Dua Channel", [{ permission: "channel.view", channelIds: [w.admisi.id, w.hotline.id] }]);
    const u = await makeUser({ roleIds: [both.id] });
    await addUserGrant(u.id, { permission: "channel.view", effect: "deny", channelIds: [w.hotline.id] });
    const c = await loginFull(u);
    expect((await c.get(`/api/v1/channels/${w.hotline.id}`)).status).toBe(404);
    expect((await c.get(`/api/v1/channels/${w.admisi.id}`)).status).toBe(200);
    expect((await c.get("/api/v1/channels")).body.items.map((x: { name: string }) => x.name)).toEqual(["Admisi — contoh"]);
  });

  it("penolakan sebagian ('semua kecuali') bekerja lewat API admin", async () => {
    const w = await world();
    const sa = await makeSuperAdminSession();
    const mgr = await makeRole("Lihat Semua", [{ permission: "channel.view", scopeAll: true }]);
    const u = await makeUser({ roleIds: [mgr.id] });
    const put = await sa.client.put(`/api/v1/users/${u.id}/grants`, { grants: [{ permission: "channel.view", effect: "deny", scopeAll: false, channelIds: [w.admisi.id] }] });
    expect(put.status).toBe(200);
    const c = await loginFull(u);
    expect((await c.get("/api/v1/channels")).body.items.map((x: { name: string }) => x.name)).toEqual(["Hotline — contoh"]);
  });

  it("audit hanya untuk yang berizin audit.view", async () => {
    const r = await makeRole("Auditor", [{ permission: "audit.view", scopeAll: true }]);
    const withPerm = await loginFull(await makeUser({ roleIds: [r.id] }));
    const without = await loginFull(await makeUser());
    expect((await withPerm.get("/api/v1/audit")).status).toBe(200);
    expect((await without.get("/api/v1/audit")).status).toBe(403);
  });
});

describe("@tahap-1 hak Super Admin & anti-eskalasi", () => {
  it("pengguna biasa tidak dapat menjadikan dirinya Super Admin (API langsung)", async () => {
    const r = await makeRole("Pengelola", [{ permission: "user.manage", scopeAll: true }, { permission: "role.manage", scopeAll: true }]);
    const u = await makeUser({ roleIds: [r.id] });
    const c = await loginFull(u);
    expect((await c.put(`/api/v1/users/${u.id}/super-admin`, { value: true })).status).toBe(403);
    const [row] = await getDb().select().from(users).where(eq(users.id, u.id));
    expect(row!.isSuperAdmin).toBe(false);
  });

  it("hanya Super Admin yang dapat memberi/mencabut hak Super Admin", async () => {
    const sa = await makeSuperAdminSession();
    const r = await makeRole("Pengelola", [{ permission: "user.manage", scopeAll: true }, { permission: "role.manage", scopeAll: true }]);
    const mgr = await makeUser({ roleIds: [r.id] });
    const target = await makeUser();
    const c = await loginFull(mgr);
    expect((await c.put(`/api/v1/users/${target.id}/super-admin`, { value: true })).status).toBe(403);
    expect((await sa.client.put(`/api/v1/users/${target.id}/super-admin`, { value: true })).status).toBe(200);
  });

  it("non-Super Admin tidak dapat mengubah/menonaktifkan/mereset akun Super Admin", async () => {
    const sa = await makeSuperAdminSession();
    const r = await makeRole("Pengelola", [{ permission: "user.manage", scopeAll: true }, { permission: "role.manage", scopeAll: true }]);
    const c = await loginFull(await makeUser({ roleIds: [r.id] }));
    const id = sa.user.id;
    expect((await c.put(`/api/v1/users/${id}/status`, { active: false })).status).toBe(403);
    expect((await c.patch(`/api/v1/users/${id}`, { name: "Diretas" })).status).toBe(403);
    expect((await c.post(`/api/v1/users/${id}/reset-password`, { newPassword: "Sandi-Peretas-Panjang-1" })).status).toBe(403);
    expect((await c.post(`/api/v1/users/${id}/reset-2fa`)).status).toBe(403);
    expect((await c.put(`/api/v1/users/${id}/roles`, { roleIds: [] })).status).toBe(403);
  });

  it("tidak dapat mengubah peran/izin/status akun sendiri", async () => {
    const r = await makeRole("Pengelola", [{ permission: "user.manage", scopeAll: true }, { permission: "role.manage", scopeAll: true }, { permission: "chat.view", scopeAll: true }]);
    const u = await makeUser({ roleIds: [r.id] });
    const c = await loginFull(u);
    const other = await makeRole("Lain", [{ permission: "chat.view", scopeAll: true }]);
    expect((await c.put(`/api/v1/users/${u.id}/roles`, { roleIds: [r.id, other.id] })).status).toBe(403);
    expect((await c.put(`/api/v1/users/${u.id}/grants`, { grants: [{ permission: "chat.view", effect: "allow", scopeAll: true, channelIds: [] }] })).status).toBe(403);
    expect((await c.put(`/api/v1/users/${u.id}/status`, { active: false })).status).toBe(403);
  });

  it("anti-eskalasi: tidak dapat memberi izin yang tidak dimiliki, melalui peran maupun grant langsung", async () => {
    const w = await world();
    const mgrRole = await makeRole("Pengelola", [
      { permission: "user.manage", scopeAll: true }, { permission: "role.manage", scopeAll: true },
      { permission: "channel.view", channelIds: [w.hotline.id] },
    ]);
    const mgr = await loginFull(await makeUser({ roleIds: [mgrRole.id] }));
    const victim = await makeUser();
    // grant langsung di luar cakupan sendiri
    const g1 = await mgr.put(`/api/v1/users/${victim.id}/grants`, { grants: [{ permission: "channel.view", effect: "allow", scopeAll: false, channelIds: [w.admisi.id] }] });
    expect(g1.status).toBe(403);
    expect(g1.body.error.code).toBe("ESCALATION_BLOCKED");
    // izin yang tidak dimiliki sama sekali
    expect((await mgr.put(`/api/v1/users/${victim.id}/grants`, { grants: [{ permission: "audit.view", effect: "allow", scopeAll: true, channelIds: [] }] })).status).toBe(403);
    // melalui peran: peran 'Admin Admisi' memuat izin di luar cakupan pemberi
    expect((await mgr.put(`/api/v1/users/${victim.id}/roles`, { roleIds: [w.rAdmisi.id] })).status).toBe(403);
    // yang dimiliki boleh didelegasikan
    expect((await mgr.put(`/api/v1/users/${victim.id}/roles`, { roleIds: [w.rHotline.id] })).status).toBe(403); // rHotline memuat channel.manage yg tak dimiliki
    expect((await mgr.put(`/api/v1/users/${victim.id}/grants`, { grants: [{ permission: "channel.view", effect: "allow", scopeAll: false, channelIds: [w.hotline.id] }] })).status).toBe(200);
    // penolakan (deny) selalu boleh
    expect((await mgr.put(`/api/v1/users/${victim.id}/grants`, { grants: [{ permission: "channel.view", effect: "deny", scopeAll: true, channelIds: [] }] })).status).toBe(200);
  });

  it("pemegang role.manage tidak dapat memperluas peran yang ia pegang sendiri", async () => {
    const w = await world();
    const mgrRole = await makeRole("Pengelola", [{ permission: "role.manage", scopeAll: true }, { permission: "channel.view", channelIds: [w.hotline.id] }]);
    const mgr = await loginFull(await makeUser({ roleIds: [mgrRole.id] }));
    const r = await mgr.put(`/api/v1/roles/${mgrRole.id}/grants`, { grants: [{ permission: "channel.view", scopeAll: true, channelIds: [] }] });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("SELF_ROLE_EDIT_FORBIDDEN");
    // peran lain: tetap dibatasi oleh anti-eskalasi
    const other = await makeRole("Lain");
    expect((await mgr.put(`/api/v1/roles/${other.id}/grants`, { grants: [{ permission: "channel.view", scopeAll: true, channelIds: [] }] })).status).toBe(403);
    expect((await mgr.put(`/api/v1/roles/${other.id}/grants`, { grants: [{ permission: "channel.view", scopeAll: false, channelIds: [w.hotline.id] }] })).status).toBe(200);
  });

  it("izin kill switch hanya dapat diberikan Super Admin; 2FA per peran/pengguna hanya Super Admin", async () => {
    const sa = await makeSuperAdminSession();
    const mgrRole = await makeRole("Pengelola", [{ permission: "role.manage", scopeAll: true }, { permission: "user.manage", scopeAll: true }, { permission: "killswitch.manage", scopeAll: true }]);
    const mgr = await loginFull(await makeUser({ roleIds: [mgrRole.id] }));
    const role2 = await makeRole("R2");
    expect((await mgr.put(`/api/v1/roles/${role2.id}/grants`, { grants: [{ permission: "killswitch.manage", scopeAll: true, channelIds: [] }] })).status).toBe(403);
    expect((await sa.client.put(`/api/v1/roles/${role2.id}/grants`, { grants: [{ permission: "killswitch.manage", scopeAll: true, channelIds: [] }] })).status).toBe(200);
    expect((await mgr.patch(`/api/v1/roles/${role2.id}`, { require2fa: true })).status).toBe(403);
    expect((await sa.client.patch(`/api/v1/roles/${role2.id}`, { require2fa: true })).status).toBe(200);
    const target = await makeUser();
    expect((await mgr.patch(`/api/v1/users/${target.id}`, { totpRequired: true })).status).toBe(403);
    expect((await sa.client.patch(`/api/v1/users/${target.id}`, { totpRequired: true })).status).toBe(200);
  });

  it("role.manage: peran bawaan tidak dapat dihapus; peran yang dipakai tidak dapat dihapus", async () => {
    const sa = await makeSuperAdminSession();
    await ownerQuery("insert into roles(name,is_system) values('Sistem',true)");
    const sys = (await ownerQuery("select id from roles where name='Sistem'")).rows[0].id;
    expect((await sa.client.delete(`/api/v1/roles/${sys}`)).body.error.code).toBe("ROLE_IS_SYSTEM");
    const used = await makeRole("Terpakai");
    const u = await makeUser();
    await assignRole(u.id, used.id);
    expect((await sa.client.delete(`/api/v1/roles/${used.id}`)).body.error.code).toBe("ROLE_IN_USE");
    const free = await makeRole("Bebas");
    expect((await sa.client.delete(`/api/v1/roles/${free.id}`)).status).toBe(200);
  });
});

describe("@tahap-1 Super Admin aktif terakhir terlindungi", () => {
  it("tidak dapat dinonaktifkan atau diturunkan lewat API (juga oleh dirinya sendiri)", async () => {
    const sa = await makeSuperAdminSession();
    const r1 = await sa.client.put(`/api/v1/users/${sa.user.id}/status`, { active: false });
    expect(r1.status).toBe(403); // aksi pada diri sendiri ditolak
    const sa2 = await makeSuperAdminSession();
    // dua Super Admin: yang satu dapat menonaktifkan yang lain...
    expect((await sa.client.put(`/api/v1/users/${sa2.user.id}/status`, { active: false })).status).toBe(200);
    // ...tetapi sekarang hanya tersisa satu; mencabut haknya lewat pengguna aktif lain tidak mungkin.
    const other = await makeUser({ superAdmin: true }); // Super Admin tanpa 2FA terdaftar tidak dapat bertindak
    const { client } = await loginRaw(other.email, other.password);
    expect((await client.put(`/api/v1/users/${sa.user.id}/super-admin`, { value: false })).status).toBe(403);
    const [still] = await getDb().select().from(users).where(eq(users.id, sa.user.id));
    expect(still!.isSuperAdmin && still!.status === "active").toBe(true);
  });

  it("DATABASE menolak walau lapisan aplikasi dilewati (trigger)", async () => {
    const sa = await makeSuperAdminSession();
    await expect(getDb().update(users).set({ status: "disabled" }).where(eq(users.id, sa.user.id))).rejects.toThrow();
    await expect(getDb().update(users).set({ isSuperAdmin: false }).where(eq(users.id, sa.user.id))).rejects.toThrow();
    await expect(getDb().delete(users).where(eq(users.id, sa.user.id))).rejects.toThrow();
    const [still] = await getDb().select().from(users).where(eq(users.id, sa.user.id));
    expect(still!.status).toBe("active");
  });

  it("dua Super Admin saling menurunkan SECARA BERSAMAAN → minimal satu tetap tersisa", async () => {
    const a = await makeSuperAdminSession();
    const b = await makeSuperAdminSession();
    const results = await Promise.all([
      a.client.put(`/api/v1/users/${b.user.id}/super-admin`, { value: false }),
      b.client.put(`/api/v1/users/${a.user.id}/super-admin`, { value: false }),
    ]);
    const remaining = await getDb().select().from(users).where(and(eq(users.isSuperAdmin, true), eq(users.status, "active")));
    expect(remaining.length).toBeGreaterThanOrEqual(1);
    // Penurunan diserialkan oleh database: tepat satu yang berhasil; yang lain ditolak (409 trigger, atau 403 bila haknya sudah tercabut).
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 200).every((r) => [403, 409].includes(r.status))).toBe(true);
  });

  it("Super Admin lain dapat menonaktifkan Super Admin (selama masih ada pengganti), sesi dicabut", async () => {
    const a = await makeSuperAdminSession();
    const b = await makeSuperAdminSession();
    expect((await a.client.put(`/api/v1/users/${b.user.id}/status`, { active: false })).status).toBe(200);
    expect((await b.client.get("/api/v1/auth/me")).status).toBe(401);
  });
});

