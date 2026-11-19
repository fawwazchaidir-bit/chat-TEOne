import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { currentTotp } from "../../src/modules/auth/totp";
import { FIXTURE_FILE } from "./env";

const fx = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as {
  sa: { email: string; password: string };
  hotline: { email: string; password: string };
  channels: Record<string, string>;
};

async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Kata sandi").fill(u.password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

test.describe("@tahap-1 G1 — Login + 2FA Super Admin; cakupan channel (UI & API langsung)", () => {
  test("Super Admin: 2FA wajib sebelum akses administratif, lalu login berikutnya meminta kode", async ({ page }) => {
    await login(page, fx.sa);
    // Akses administratif DITOLAK sebelum TOTP berhasil — UI mengarahkan ke pendaftaran 2FA...
    await expect(page).toHaveURL(/\/login\/2fa-setup/);
    await page.goto("/pengguna");
    await expect(page).toHaveURL(/\/login\/2fa-setup/);
    // ...dan API langsung (dengan cookie sesi yang sama) menolak 403.
    const direct = await page.request.get("/api/v1/users");
    expect(direct.status()).toBe(403);
    expect((await direct.json()).error.code).toBe("TOTP_SETUP_REQUIRED");

    await page.getByRole("button", { name: "Mulai pendaftaran 2FA" }).click();
    const secret = (await page.locator("code.mono").first().innerText()).trim();
    expect(secret).toMatch(/^[A-Z2-7]{20,}$/);
    await page.getByLabel("Kode 6 digit").fill(currentTotp(secret));
    await page.getByRole("button", { name: "Aktifkan 2FA" }).click();
    await expect(page.getByText("Simpan kode pemulihan ini sekarang")).toBeVisible();
    await expect(page.locator(".codes code")).toHaveCount(10);
    await page.getByLabel("Saya sudah menyimpan kode pemulihan").check();
    await page.getByRole("button", { name: "Selesai" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Halo, Super Admin E2E/ })).toBeVisible();
    expect((await page.request.get("/api/v1/users")).status()).toBe(200);

    // Logout → login ulang → wajib kode TOTP (kode langkah berikutnya, karena langkah sekarang sudah terpakai).
    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/v1/users")).status()).toBe(401);
    await login(page, fx.sa);
    await expect(page).toHaveURL(/\/login\/2fa$/);
    expect((await page.request.get("/api/v1/users")).status()).toBe(403); // sebelum TOTP: tetap ditolak
    await page.getByLabel(/Kode 6 digit/).fill("000000");
    await page.getByRole("button", { name: "Verifikasi" }).click();
    await expect(page.getByText("Kode 2FA tidak valid.")).toBeVisible();
    await page.getByLabel(/Kode 6 digit/).fill(currentTotp(secret, Date.now() + 30_000));
    await page.getByRole("button", { name: "Verifikasi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/channel");
    for (const n of ["Admisi — contoh", "Hotline — contoh", "Kemitraan — contoh"]) await expect(page.getByText(n, { exact: false }).first()).toBeVisible();
    await expect(page.locator(".badge", { hasText: "CONTOH" }).first()).toBeVisible();
    await page.goto("/kill-switch");
    await expect(page.getByRole("heading", { level: 1, name: /Kill switch/ })).toBeVisible();
  });

  test("Pengguna cakupan Hotline: tidak dapat membuka data Admisi lewat UI maupun API langsung", async ({ page }) => {
    await login(page, fx.hotline);
    await expect(page).toHaveURL(/\/dashboard/);
    const admisiId = fx.channels["Admisi — contoh"]!;
    const hotlineId = fx.channels["Hotline — contoh"]!;

    // UI: halaman Channel hanya memuat Hotline.
    await page.goto("/channel");
    await expect(page.getByText("Hotline — contoh").first()).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("Admisi — contoh");
    expect(html).not.toContain(admisiId);
    expect(html).not.toContain("Kemitraan — contoh");

    // API langsung: daftar tersaring; detail channel Admisi → 404; ubah/arsip → 404.
    const list = await page.request.get("/api/v1/channels");
    expect(list.status()).toBe(200);
    expect((await list.json()).items.map((c: { name: string }) => c.name)).toEqual(["Hotline — contoh"]);
    expect((await page.request.get(`/api/v1/channels/${hotlineId}`)).status()).toBe(200);
    expect((await page.request.get(`/api/v1/channels/${admisiId}`)).status()).toBe(404);
    // Mutasi dari browser tanpa token CSRF ditolak, dengan token pun channel Admisi tetap 404.
    expect((await page.request.post(`/api/v1/channels/${admisiId}/archive`, { headers: { origin: "http://localhost:3100" } })).status()).toBe(403);
    const me = await (await page.request.get("/api/v1/auth/me")).json();
    const withCsrf = await page.request.post(`/api/v1/channels/${admisiId}/archive`, { headers: { origin: "http://localhost:3100", "x-csrf-token": me.csrfToken } });
    expect(withCsrf.status()).toBe(404);

    // Halaman & API administratif lain: ditolak.
    for (const p of ["/pengguna", "/audit", "/kill-switch", "/tim"]) {
      await page.goto(p);
      await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
    }
    for (const p of ["/api/v1/users", "/api/v1/audit", "/api/v1/kill-switch", "/api/v1/feature-flags"]) expect((await page.request.get(p)).status(), p).toBe(403);

    // Status channel jujur: tidak pernah "Terhubung"; fitur belum dibuat berpenanda.
    await page.goto("/channel");
    await expect(page.getByText("Belum dikonfigurasi").first()).toBeVisible();
    expect(await page.content()).not.toMatch(/>\s*Terhubung\s*</);
    await page.goto("/belum-tersedia/inbox");
    await expect(page.getByText("Belum tersedia").first()).toBeVisible();

    // Responsif: pada lebar ponsel tidak ada scroll horizontal di halaman utama.
    await page.setViewportSize({ width: 390, height: 800 });
    for (const p of ["/dashboard", "/channel", "/belum-tersedia/inbox"]) {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${p} meluap horizontal`).toBeLessThanOrEqual(1);
    }
  });

  test("Pita lingkungan non-production tampil; health check minimal; header keamanan terpasang", async ({ page, request }) => {
    await page.goto("/login");
    await expect(page.getByRole("status").filter({ hasText: "BUKAN PRODUCTION" })).toBeVisible();
    const res = await request.get("/api/health");
    expect(await res.json()).toEqual({ status: "ok" });
    const h = (await page.request.get("/login")).headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});
