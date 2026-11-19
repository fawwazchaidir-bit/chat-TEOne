import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_CUSTOMER, E2E_ENV, E2E_PHONE_ID, E2E_STRANGER, E2E_WABA, FIXTURE_FILE } from "./env";

const fx = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as { kemitraan: { email: string; password: string }; hotline: { email: string; password: string } };
const sign = (raw: string, secret = E2E_ENV.META_APP_SECRET) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
const payload = (id: string, from: string, text: string) => JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: E2E_WABA, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "15550000009", phone_number_id: E2E_PHONE_ID }, contacts: [{ profile: { name: "Peserta Uji" }, wa_id: from }], messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }],
});
const post = (request: APIRequestContext, raw: string, signature: string | null) =>
  request.post("/api/webhooks/whatsapp", { data: raw, headers: { "content-type": "application/json", ...(signature ? { "x-hub-signature-256": signature } : {}) } });

async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Kata sandi").fill(u.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// SIMULASI: server produksi sungguhan + webhook bertanda tangan sungguhan, tetapi BUKAN Meta dan BUKAN nomor uji nyata.
test.describe("@tahap-2 G2 (SIMULASI — bukan Meta/nomor uji nyata) pesan masuk tercatat di channel yang benar, kirim ulang tidak menggandakan", () => {
  test("webhook bertanda tangan → pesan tampil SEKALI di alat uji; kirim ulang tidak menggandakan; pengirim di luar daftar uji tidak tampil", async ({ page, request }) => {
    await login(page, fx.kemitraan);
    await page.goto("/integrasi");
    await expect(page.getByRole("heading", { level: 1, name: "Alat uji integrasi WhatsApp" })).toBeVisible();
    await expect(page.getByText("MOCK — hasil = SIMULASI")).toBeVisible(); // kejujuran: endpoint bukan Meta
    await expect(page.getByLabel("Channel uji")).toContainText("Kemitraan — contoh");
    await expect(page.getByLabel("Channel uji").locator("option")).toHaveCount(1); // hanya channel yang berizin

    const text = `Halo dari peserta uji E2E ${Date.now()}`;
    const raw = payload(`wamid.e2e.${Date.now()}`, E2E_CUSTOMER, text);
    const first = await post(request, raw, sign(raw));
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ received: 1, stored: 1, duplicates: 0 });
    for (let i = 0; i < 3; i++) {
      const again = await post(request, raw, sign(raw)); // Meta mengirim ulang webhook yang sama
      expect(again.status()).toBe(200);
      expect(await again.json()).toMatchObject({ stored: 0, duplicates: 1 });
    }

    await expect.poll(async () => { await page.getByRole("button", { name: "Muat ulang" }).click(); return page.getByRole("cell", { name: text }).count(); }, { timeout: 15_000 }).toBe(1);
    await expect(page.getByRole("cell", { name: text })).toHaveCount(1); // tepat satu, walau dikirim 4×
    await expect(page.locator(".badge", { hasText: "Pelanggan" }).first()).toBeVisible();

    // Tanda tangan salah / tidak ada → ditolak; tidak menambah apa pun.
    const raw2 = payload(`wamid.e2e.bad.${Date.now()}`, E2E_CUSTOMER, "TIDAK BOLEH MUNCUL");
    expect((await post(request, raw2, sign(raw2, "rahasia-lain-sintetis"))).status()).toBe(401);
    expect((await post(request, raw2, null)).status()).toBe(401);

    // Pengirim di luar daftar uji → tidak diproses, hanya dihitung; nomor tidak tampil.
    const raw3 = payload(`wamid.e2e.stranger.${Date.now()}`, E2E_STRANGER, "RAHASIA ORANG ASING");
    expect((await post(request, raw3, sign(raw3))).status()).toBe(200);
    await expect.poll(async () => { await page.getByRole("button", { name: "Muat ulang" }).click(); return (await page.locator(".stat").allInnerTexts()).join("|"); }, { timeout: 15_000 }).toMatch(/\|?1\|?/);
    const html = await page.content();
    expect(html).not.toContain("RAHASIA ORANG ASING");
    expect(html).not.toContain("TIDAK BOLEH MUNCUL");
    expect(html).not.toContain(E2E_STRANGER);
    expect(html).not.toContain(E2E_CUSTOMER); // nomor lengkap tidak pernah sampai ke browser
    await expect(page.getByText("Pengirim di luar daftar uji (24 jam)")).toBeVisible();
  });

  test("webhook: challenge valid/tidak valid; flag nyala; secret salah ditolak", async ({ request }) => {
    const ok = await request.get(`/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${E2E_ENV.META_VERIFY_TOKEN}&hub.challenge=777`);
    expect([ok.status(), await ok.text()]).toEqual([200, "777"]);
    expect((await request.get("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=salah&hub.challenge=777")).status()).toBe(403);
  });

  test("izin & kejujuran status: pengguna tanpa izin ditolak (UI & API); panel koneksi gagal dengan jujur saat Meta tidak terjangkau", async ({ page }) => {
    await login(page, fx.hotline);
    await page.goto("/integrasi");
    await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
    expect((await page.request.get("/api/v1/integration/recipients")).status()).toBe(403);
    expect((await page.request.get("/api/webhooks/whatsapp")).status()).toBe(403); // GET tanpa parameter challenge
    await page.context().clearCookies();

    await login(page, fx.kemitraan);
    await page.goto("/channel");
    const panel = page.locator("details", { hasText: "Koneksi WhatsApp — Kemitraan — contoh" });
    await panel.locator("summary").click();
    await expect(panel.getByText("Belum diperiksa")).toBeVisible();
    await panel.getByRole("button", { name: "Periksa koneksi" }).click();
    await expect(panel.getByText("Pemeriksaan gagal")).toBeVisible({ timeout: 15_000 }); // Meta tidak terjangkau → TIDAK ada klaim koneksi
    expect(await page.content()).not.toMatch(/>\s*Terhubung\s*</);
    expect((await page.content()).toLowerCase()).not.toContain("hubungkan whatsapp");
  });
});
