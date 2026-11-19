import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { recoveryCodes, sessions, users } from "@/db/schema";
import { Client, loginRaw } from "../helpers/api";
import { installClock, removeClock, freshTotp } from "../helpers/clock";
import { resetDb } from "../helpers/db";
import { PASSWORD, loginFull, makeSuperAdminSession, makeUser } from "../helpers/fixtures";
import { MAX_FAILURES_PER_ACCOUNT, MAX_FAILURES_PER_IP } from "@/modules/auth/rate-limit";
import { resetEnvCacheForTests } from "@/lib/env";

beforeAll(installClock);
afterAll(async () => { removeClock(); await closeDb(); });
beforeEach(resetDb);

describe("@tahap-1 autentikasi: login & sesi", () => {
  it("login benar membuat sesi; kata sandi salah ditolak dengan pesan generik", async () => {
    const u = await makeUser();
    const ok = await loginRaw(u.email, u.password);
    expect(ok.res.status).toBe(200);
    expect(ok.client.stage).toBe("full");

    const bad = await loginRaw(u.email, "salah-salah-salah");
    const unknown = await loginRaw("tidak-ada@contoh.test", "salah-salah-salah");
    expect(bad.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    // Tidak membedakan "akun tidak ada" dan "sandi salah" (anti-enumerasi).
    expect(bad.res.body.error.message).toBe(unknown.res.body.error.message);
    expect(bad.res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("kata sandi disimpan sebagai Argon2id, session disimpan sebagai hash", async () => {
    const u = await makeUser();
    const { client } = await loginRaw(u.email, u.password);
    const [row] = await getDb().select().from(users).where(eq(users.email, u.email));
    expect(row!.passwordHash.startsWith("$argon2id$")).toBe(true);
    const token = client.cookie!.split("=")[1]!;
    const s = await getDb().select().from(sessions);
    expect(s).toHaveLength(1);
    expect(s[0]!.tokenHash).not.toBe(token); // hanya hash yang tersimpan
    expect(s[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cookie sesi: HttpOnly + SameSite (+ Path=/)", async () => {
    const u = await makeUser();
    const c = new Client();
    const r = await c.post("/api/v1/auth/login", { email: u.email, password: u.password });
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toContain("HttpOnly");
    expect(sc).toContain("SameSite=Lax");
    expect(sc).toContain("Path=/");
  });

  it("pengguna nonaktif tidak bisa masuk, dan sesi lamanya langsung tidak berlaku", async () => {
    const admin = await makeSuperAdminSession();
    const u = await makeUser();
    const c = await loginFull(u);
    expect((await c.get("/api/v1/auth/me")).status).toBe(200);

    const off = await admin.client.put(`/api/v1/users/${u.id}/status`, { active: false });
    expect(off.status).toBe(200);
    // Pencabutan EAGER: baris sesi sudah hilang di database sebelum pengguna itu mengirim permintaan lagi.
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
    expect((await c.get("/api/v1/auth/me")).status).toBe(401); // sesi lama mati
    const again = await loginRaw(u.email, u.password);
    expect(again.res.status).toBe(401);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
  });

  it("logout membatalkan sesi di server", async () => {
    const u = await makeUser();
    const c = await loginFull(u);
    expect((await c.post("/api/v1/auth/logout")).status).toBe(200);
    const stale = new Client();
    stale.cookie = c.cookie; // cookie lama dipakai ulang
    expect((await stale.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("tanpa cookie → 401; token acak → 401", async () => {
    expect((await new Client().get("/api/v1/auth/me")).status).toBe(401);
    const c = new Client();
    c.cookie = "teone_session=" + "a".repeat(43);
    expect((await c.get("/api/v1/auth/me")).status).toBe(401);
  });
});

describe("@tahap-1 autentikasi: pembatasan percobaan login", () => {
  it(`akun terkunci setelah ${MAX_FAILURES_PER_ACCOUNT} kegagalan — sandi benar pun ditolak (429)`, async () => {
    const u = await makeUser();
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) {
      expect((await loginRaw(u.email, "salah-salah-salah")).res.status).toBe(401);
    }
    const locked = await loginRaw(u.email, u.password);
    expect(locked.res.status).toBe(429);
    expect(locked.res.headers.get("retry-after")).toBeTruthy();
  });

  it(`batas per-IP: ${MAX_FAILURES_PER_IP} kegagalan dari satu IP (akun berbeda-beda) → IP itu ditolak, IP lain tidak terpengaruh`, async () => {
    const victim = await makeUser();
    const attackerIp = "203.0.113.50";
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) await loginRaw(`tebak-${i}@contoh.test`, "salah-salah-salah", attackerIp);
    expect((await loginRaw(victim.email, victim.password, attackerIp)).res.status).toBe(429); // penyerang terblokir walau sandi benar
    expect((await loginRaw(victim.email, victim.password, "198.51.100.7")).res.status).toBe(200); // pengguna sah dari IP lain tetap bisa
  });

  it("IP tidak diketahui (TRUST_PROXY=false): satu penyerang TIDAK dapat mengunci login semua orang", async () => {
    const legit = await makeUser();
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "false";
    resetEnvCacheForTests();
    try {
      for (let i = 0; i < MAX_FAILURES_PER_IP + 3; i++) await loginRaw(`tebak-${i}@contoh.test`, "salah-salah-salah");
      expect((await loginRaw(legit.email, legit.password)).res.status).toBe(200);
      // batas per-akun tetap berlaku walau IP tidak diketahui
      for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) await loginRaw(legit.email, "salah-salah-salah");
      expect((await loginRaw(legit.email, legit.password)).res.status).toBe(429);
    } finally {
      process.env.TRUST_PROXY = prev;
      resetEnvCacheForTests();
    }
  });

  it("kegagalan 2FA juga dihitung ke batas yang sama", async () => {
    const { client, user } = await makeSuperAdminSession();
    await client.post("/api/v1/auth/logout");
    const { client: c2 } = await loginRaw(user.email, user.password);
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) {
      expect((await c2.post("/api/v1/auth/totp/verify", { code: "000000" })).status).toBe(401);
    }
    expect((await c2.post("/api/v1/auth/totp/verify", { code: "000000" })).status).toBe(429);
  });
});

describe("@tahap-1 autentikasi: 2FA TOTP", () => {
  it("Super Admin tanpa 2FA terdaftar: API administratif DITOLAK sebelum TOTP berhasil", async () => {
    const u = await makeUser({ superAdmin: true });
    const { client, res } = await loginRaw(u.email, u.password);
    expect(res.status).toBe(200);
    expect(client.stage).toBe("totp_setup_required");
    for (const p of ["/api/v1/users", "/api/v1/audit", "/api/v1/channels", "/api/v1/kill-switch", "/api/v1/org-settings"]) {
      const r = await client.get(p);
      expect(r.status, p).toBe(403);
      expect(r.body.error.code).toBe("TOTP_SETUP_REQUIRED");
    }
  });

  it("alur penuh: setup → konfirmasi → akses; login berikutnya wajib kode TOTP", async () => {
    const { client, user, secret, recoveryCodes: codes } = await makeSuperAdminSession();
    expect(client.stage).toBe("full");
    expect(codes).toHaveLength(10);
    expect((await client.get("/api/v1/users")).status).toBe(200);

    await client.post("/api/v1/auth/logout");
    const { client: c2 } = await loginRaw(user.email, user.password);
    expect(c2.stage).toBe("totp_required");
    expect((await c2.get("/api/v1/users")).status).toBe(403);
    expect((await c2.get("/api/v1/users")).body.error.code).toBe("TOTP_REQUIRED");

    expect((await c2.post("/api/v1/auth/totp/verify", { code: "123456" })).status).toBe(401);
    expect((await c2.post("/api/v1/auth/totp/verify", { code: freshTotp(secret) })).status).toBe(200);
    await c2.refresh();
    expect(c2.stage).toBe("full");
    expect((await c2.get("/api/v1/users")).status).toBe(200);
  });

  it("rahasia TOTP disimpan terenkripsi (bukan teks biasa); kode pemulihan hanya hash", async () => {
    const { user, secret, recoveryCodes: codes } = await makeSuperAdminSession();
    const [row] = await getDb().select().from(users).where(eq(users.email, user.email));
    expect(row!.totpSecretEnc).toBeTruthy();
    expect(row!.totpSecretEnc).not.toContain(secret);
    expect(row!.totpSecretEnc!.startsWith("v1.")).toBe(true);
    const stored = await getDb().select().from(recoveryCodes);
    expect(stored).toHaveLength(10);
    for (const s of stored) for (const c of codes) expect(s.codeHash).not.toContain(c.replace(/-/g, ""));
  });

  it("kode TOTP yang sama tidak dapat dipakai dua kali (anti-replay)", async () => {
    const { client, user, secret } = await makeSuperAdminSession();
    await client.post("/api/v1/auth/logout");
    const code = freshTotp(secret);
    const a = (await loginRaw(user.email, user.password)).client;
    expect((await a.post("/api/v1/auth/totp/verify", { code })).status).toBe(200);
    const b = (await loginRaw(user.email, user.password)).client;
    const replay = await b.post("/api/v1/auth/totp/verify", { code });
    expect(replay.status).toBe(401);
    expect((await b.get("/api/v1/users")).status).toBe(403);
  });

  it("kode pemulihan hanya berlaku SEKALI", async () => {
    const { client, user, recoveryCodes: codes } = await makeSuperAdminSession();
    await client.post("/api/v1/auth/logout");
    const code = codes[0]!;
    const a = (await loginRaw(user.email, user.password)).client;
    const used = await a.post("/api/v1/auth/recovery", { code });
    expect(used.status).toBe(200);
    expect(used.body.remaining).toBe(9);
    await a.refresh();
    expect(a.stage).toBe("full");

    const b = (await loginRaw(user.email, user.password)).client;
    expect((await b.post("/api/v1/auth/recovery", { code })).status).toBe(401); // sudah terpakai
    expect((await b.post("/api/v1/auth/recovery", { code: "AAAA-BBBB-CCCC-DDDD" })).status).toBe(401); // tidak ada
    // kode lain masih berlaku
    expect((await b.post("/api/v1/auth/recovery", { code: codes[1]!.toLowerCase() })).status).toBe(200);
  });

  it("kode pemulihan: 10 permintaan paralel dengan kode yang sama → tepat satu berhasil", async () => {
    const { client, user, recoveryCodes: codes } = await makeSuperAdminSession();
    await client.post("/api/v1/auth/logout");
    const clients = await Promise.all(Array.from({ length: 4 }, async () => (await loginRaw(user.email, user.password)).client));
    const results = await Promise.all(clients.map((c) => c.post("/api/v1/auth/recovery", { code: codes[2]! })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it("pengguna biasa: 2FA opsional; bila diwajibkan per pengguna/peran maka ikut wajib", async () => {
    const plain = await makeUser();
    expect((await loginRaw(plain.email, plain.password)).client.stage).toBe("full");
    const required = await makeUser({ totpRequired: true });
    expect((await loginRaw(required.email, required.password)).client.stage).toBe("totp_setup_required");
  });

  it("reset sandi oleh admin: sandi lama mati, semua sesi dicabut (eager), sandi sementara wajib diganti", async () => {
    const admin = await makeSuperAdminSession();
    const u = await makeUser();
    const c = await loginFull(u);
    const r = await admin.client.post(`/api/v1/users/${u.id}/reset-password`, { newPassword: "Sandi-Sementara-Admin-42" });
    expect(r.status).toBe(200);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
    expect((await c.get("/api/v1/auth/me")).status).toBe(401);
    expect((await loginRaw(u.email, u.password)).res.status).toBe(401);
    const { client, res } = await loginRaw(u.email, "Sandi-Sementara-Admin-42");
    expect(res.status).toBe(200);
    expect(client.stage).toBe("password_change_required");
  });

  it("reset 2FA oleh admin mencabut sesi dan memaksa daftar ulang", async () => {
    const admin = await makeSuperAdminSession();
    const target = await makeSuperAdminSession(); // Super Admin lain
    const r = await admin.client.post(`/api/v1/users/${target.user.id}/reset-2fa`);
    expect(r.status).toBe(200);
    expect((await target.client.get("/api/v1/auth/me")).status).toBe(401);
    const { client } = await loginRaw(target.user.email, target.user.password);
    expect(client.stage).toBe("totp_setup_required");
  });
});

describe("@tahap-1 autentikasi: CSRF, Origin, ganti sandi", () => {
  it("mutasi tanpa token CSRF atau dengan token salah → 403", async () => {
    const u = await makeUser();
    const c = await loginFull(u);
    const noToken = await c.request("POST", "/api/v1/auth/logout", {}, { csrf: false });
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe("BAD_CSRF");
    c.csrf = "token-palsu";
    expect((await c.post("/api/v1/auth/logout")).status).toBe(403);
    expect((await c.get("/api/v1/auth/me")).status).toBe(200); // sesi tetap hidup
  });

  it("Origin asing atau tidak ada → 403 (termasuk pada login)", async () => {
    const u = await makeUser();
    const c = new Client();
    const evil = await c.request("POST", "/api/v1/auth/login", { email: u.email, password: u.password }, { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe("BAD_ORIGIN");
    expect((await c.request("POST", "/api/v1/auth/login", { email: u.email, password: u.password }, { origin: null })).status).toBe(403);
  });

  it("validasi input di server: body bukan JSON / bentuk salah → 400", async () => {
    const c = new Client();
    const r = await c.post("/api/v1/auth/login", { email: 123 });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("wajib ganti sandi: akses lain ditolak sampai sandi diganti; sesi lain dicabut", async () => {
    const u = await makeUser({ mustChange: true });
    const c = (await loginRaw(u.email, u.password)).client;
    expect(c.stage).toBe("password_change_required");
    expect((await c.get("/api/v1/channels")).status).toBe(403);
    const other = (await loginRaw(u.email, u.password)).client; // sesi kedua
    expect((await c.post("/api/v1/auth/password", { currentPassword: u.password, newPassword: "pendek" })).status).toBe(400);
    expect((await c.post("/api/v1/auth/password", { currentPassword: "salah-salah-salah", newPassword: PASSWORD + "x" })).status).toBe(401);
    const ok = await c.post("/api/v1/auth/password", { currentPassword: u.password, newPassword: "Sandi-Baru-Lebih-Panjang-9" });
    expect(ok.status).toBe(200);
    await c.refresh();
    expect(c.stage).toBe("full");
    expect((await other.get("/api/v1/auth/me")).status).toBe(401);
    expect((await loginRaw(u.email, u.password)).res.status).toBe(401); // sandi lama tidak berlaku
    expect((await loginRaw(u.email, "Sandi-Baru-Lebih-Panjang-9")).res.status).toBe(200);
  });

  it("sesi pending (belum lolos 2FA) berumur singkat", async () => {
    const { client, user } = await makeSuperAdminSession();
    await client.post("/api/v1/auth/logout");
    const { client: pending } = await loginRaw(user.email, user.password);
    const [s] = await getDb().select().from(sessions).where(eq(sessions.userId, user.id));
    const ttl = s!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 1000);
    expect(pending.stage).toBe("totp_required");
  });
});

