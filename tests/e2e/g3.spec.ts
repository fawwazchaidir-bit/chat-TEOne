/**
 * Golden E2E Tahap 3 — G3, G5 (bagian AKTIVASI), G8. SIMULASI: server produksi sungguhan + browser sungguhan + webhook bertanda tangan sungguhan,
 * tetapi Meta diganti MOCK (tests/e2e/mock-graph-server.ts) dan "AI" adalah job SIMULASI. Hasil di sini TIDAK membuktikan integrasi Meta nyata
 * ("belum lulus integrasi langsung") dan TIDAK membuktikan AI sungguhan (Tahap 4).
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { E2E_BASE_URL, E2E_CTL_URL, E2E_CUSTOMER, E2E_ENV, E2E_OWNER_URL, E2E_PHONE_ID, E2E_WABA, FIXTURE_FILE } from "./env";

type Cred = { email: string; password: string };
const fx = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as { inbox1: Cred; inbox2: Cred; killer: Cred; hotline: Cred };
type Send = { wamid: string; to: string | null; type: string | null; text: string | null };
const SIM = "[SIMULASI]";

const sends = async (): Promise<Send[]> => (await fetch(`${E2E_CTL_URL}/sends`)).json() as Promise<Send[]>;
const aiSends = async () => (await sends()).filter((s) => s.text?.startsWith(SIM));
const adminSends = async () => (await sends()).filter((s) => !s.text?.startsWith(SIM));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sign = (raw: string) => `sha256=${createHmac("sha256", E2E_ENV.META_APP_SECRET).update(raw).digest("hex")}`;
const meta = { display_phone_number: "15550000009", phone_number_id: E2E_PHONE_ID };
const wrap = (value: Record<string, unknown>) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: E2E_WABA, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: meta, ...value } }] }] });
const nowSec = () => Math.floor(Date.now() / 1000);
async function customerSays(request: APIRequestContext, text: string, o: { id?: string; ts?: number } = {}) {
  const id = o.id ?? `wamid.e2e.g3.${Date.now()}.${Math.floor(Math.random() * 1e6)}`;
  const raw = wrap({ contacts: [{ profile: { name: "Peserta Uji" }, wa_id: E2E_CUSTOMER }], messages: [{ from: E2E_CUSTOMER, id, timestamp: String(o.ts ?? nowSec()), type: "text", text: { body: text } }] });
  const r = await request.post("/api/webhooks/whatsapp", { data: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) } });
  expect(r.status()).toBe(200);
  return { id, raw };
}
async function providerStatus(request: APIRequestContext, wamid: string, status: "delivered" | "read") {
  const raw = wrap({ statuses: [{ id: wamid, status, timestamp: String(nowSec()), recipient_id: E2E_CUSTOMER }] });
  expect((await request.post("/api/webhooks/whatsapp", { data: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) } })).status()).toBe(200);
}

async function login(page: Page, u: Cred) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Kata sandi").fill(u.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
async function openAs(browser: Browser, u: Cred, path = "/inbox"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, u);
  await page.goto(path);
  return { ctx, page };
}

/** Flag Tahap 3 dinyalakan hanya selama spec ini (lewat koneksi pemilik ke database E2E), lalu dimatikan lagi agar G1/G2 tetap memeriksa "fitur mati". */
async function setFlags(on: boolean) {
  const c = new Client({ connectionString: E2E_OWNER_URL });
  await c.connect();
  try { for (const key of ["inbox", "ai_simulation"]) await c.query("insert into feature_flag_overrides(key, enabled) values($1,$2) on conflict (key) do update set enabled = excluded.enabled", [key, on]); } finally { await c.end(); }
}
test.beforeAll(async () => { await setFlags(true); await fetch(`${E2E_CTL_URL}/reset`, { method: "POST" }); });
test.afterAll(async () => { await setFlags(false); });
test.describe.configure({ mode: "serial" });

test.describe("@tahap-3 G3 (SIMULASI) admin membalas dari inbox; status sesuai bukti provider; AI Off; kerja bersama tanpa refresh", () => {
  test("pesan masuk tampil di inbox TANPA refresh; admin membalas (klik ganda → satu pesan); status mengikuti bukti provider; AI Off; admin lain melihat perubahan tanpa refresh; izin & XSS", async ({ browser }) => {
    const a1 = await openAs(browser, fx.inbox1), a2 = await openAs(browser, fx.inbox2);
    const p1 = a1.page, p2 = a2.page;
    await expect(p1.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    await expect(p1.getByText("AI SIMULASI menyala — bukan AI sungguhan")).toBeVisible(); // kejujuran: bukan AI sungguhan

    // 1) pesan masuk → muncul sendiri (polling) pada KEDUA admin tanpa refresh; nomor tidak tampil lengkap di daftar
    const xss = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;
    await customerSays(p1.request, `Halo, mau tanya pelatihan ${xss}`);
    for (const p of [p1, p2]) await expect(p.locator(".conv").first()).toBeVisible({ timeout: 25_000 });
    await expect(p1.locator(".conv").first()).toContainText("Peserta Uji");
    expect(await p2.locator(".inbox-list").innerHTML()).not.toContain(E2E_CUSTOMER);
    await expect(p1.locator(".conv .badge", { hasText: "baru" }).first()).toBeVisible();

    // 2) buka percakapan: XSS tampil sebagai TEKS; AI simulasi sudah membalas (sumber "AI (simulasi)"); AI Aktif + label jujur
    await p1.locator(".conv").first().click();
    const log = p1.getByRole("log", { name: "Pesan" });
    await expect(log).toContainText("Halo, mau tanya pelatihan", { timeout: 15_000 });
    await expect(log).toContainText('<img src=x onerror="window.__xss=1">'); // teks literal
    expect(await p1.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(log.locator(".badge", { hasText: "AI (simulasi)" }).first()).toBeVisible({ timeout: 15_000 });
    await expect(p1.getByText("AI disiapkan — agent belum terhubung").first()).toBeVisible();
    await expect(p1.getByText(/AI sungguhan belum tersedia \(Tahap 4\)/)).toBeVisible();
    await expect(p1.getByRole("button", { name: "Ambil alih" })).toBeVisible();

    // 3) admin membalas — KLIK GANDA tidak menggandakan pesan (satu panggilan ke Meta)
    const before = (await adminSends()).length;
    const reply = `Halo Kak, kami bantu ya ${Date.now()}`;
    await p1.getByLabel("Isi balasan").fill(reply);
    await p1.getByRole("button", { name: "Kirim", exact: true }).dblclick();
    await expect(log.getByText(reply)).toHaveCount(1, { timeout: 15_000 });
    await expect(log.locator(".msg.out", { hasText: reply }).locator(".badge", { hasText: "Diterima Meta" })).toBeVisible({ timeout: 15_000 }); // status = bukti API Meta (mock)
    const after = await adminSends();
    expect(after.length - before).toBe(1);
    expect(after.at(-1)).toMatchObject({ to: E2E_CUSTOMER, type: "text", text: reply });

    // 4) AI Off "admin membalas" pada percakapan ini
    await expect(p1.locator(".inbox-info").getByText("AI Off — Admin membalas")).toBeVisible({ timeout: 15_000 });
    await expect(p1.getByRole("button", { name: "Aktifkan kembali AI" })).toBeVisible();

    // 5) admin LAIN melihat perubahan (preview + AI Off) TANPA refresh manual
    await expect(p2.locator(".conv").first()).toContainText(reply, { timeout: 25_000 });
    await expect(p2.locator(".conv").first()).toContainText("AI Off");

    // 6) status mengikuti BUKTI provider: delivered → Diterima, read → Dibaca (webhook status bertanda tangan)
    const wamid = after.at(-1)!.wamid;
    await providerStatus(p1.request, wamid, "delivered");
    await expect(log.locator(".msg.out", { hasText: reply }).locator(".badge", { hasText: /^Diterima$/ })).toBeVisible({ timeout: 25_000 });
    await providerStatus(p1.request, wamid, "read");
    await expect(log.locator(".msg.out", { hasText: reply }).locator(".badge", { hasText: /^Dibaca$/ })).toBeVisible({ timeout: 25_000 });

    // 7) izin: admin Hotline tidak dapat membuka percakapan Kemitraan (UI/API langsung) dan inbox-nya kosong
    const convId = ((await (await p1.request.get("/api/v1/inbox/conversations")).json()) as { items: { id: string }[] }).items[0]!.id;
    const h = await openAs(browser, fx.hotline);
    expect((await h.page.request.get(`/api/v1/conversations/${convId}`)).status()).toBe(404);
    expect((await h.page.request.get(`/api/v1/conversations/${convId}/messages`)).status()).toBe(404);
    const csrf = ((await (await h.page.request.get("/api/v1/auth/me")).json()) as { csrfToken: string }).csrfToken;
    const denied = await h.page.request.post(`/api/v1/conversations/${convId}/reply`, { multipart: { kind: "text", text: "tidak boleh", idempotencyKey: "kunci-hotline-uji-1" }, headers: { origin: new URL(E2E_BASE_URL).origin, "x-csrf-token": csrf } });
    expect(denied.status()).toBe(404); // lolos Origin+CSRF, tetap 404: percakapan di luar akses tidak dibocorkan
    expect(((await (await h.page.request.get("/api/v1/inbox/conversations")).json()) as { total: number }).total).toBe(0);
    expect((await adminSends()).length - before).toBe(1); // tidak ada pengiriman tambahan dari upaya yang ditolak
    await h.page.goto("/inbox");
    await expect(h.page.locator(".conv")).toHaveCount(0);
    await Promise.all([a1.ctx.close(), a2.ctx.close(), h.ctx.close()]);
  });
});

test.describe("@tahap-3 G5 (SIMULASI — bagian AKTIVASI; jawaban AI nyata = Tahap 4) aktivasi ulang: pesan lama tidak dijawab, pesan baru dijawab", () => {
  test("AI Off → pesan pelanggan tidak dijawab; diaktifkan manual → pesan lama/terlambat/duplikat tidak dijawab; pesan baru setelah batas dijawab", async ({ browser }) => {
    const a = await openAs(browser, fx.inbox1);
    const p = a.page;
    await p.locator(".conv").first().click();
    const log = p.getByRole("log", { name: "Pesan" });
    await expect(p.getByText("AI Off — Admin membalas")).toBeVisible({ timeout: 15_000 }); // kondisi akhir G3

    // pesan saat AI Off → tidak dijawab
    const base = (await aiSends()).length;
    const m2 = await customerSays(p.request, "m2 saat AI sedang Off");
    await expect(log).toContainText("m2 saat AI sedang Off", { timeout: 20_000 });
    await sleep(2500);
    expect((await aiSends()).length).toBe(base);

    // aktifkan kembali — manual, dengan konfirmasi; batas dicatat
    await p.getByRole("button", { name: "Aktifkan kembali AI" }).click();
    await expect(p.getByText(/AI tidak menyala sendiri/)).toBeVisible();
    await p.getByRole("button", { name: "Ya, aktifkan kembali AI" }).click();
    await expect(p.locator(".inbox-info").getByText("AI disiapkan — agent belum terhubung")).toBeVisible({ timeout: 15_000 });
    await expect(p.getByText(/Batas aktivasi ulang/)).toBeVisible();

    // lama/terlambat/duplikat → TIDAK dijawab
    await customerSays(p.request, "m3 terlambat (waktunya sebelum aktivasi)", { ts: nowSec() - 120 });
    await p.request.post("/api/webhooks/whatsapp", { data: m2.raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(m2.raw) } }); // duplikat m2
    await expect(log).toContainText("m3 terlambat", { timeout: 20_000 });
    await sleep(2500);
    expect((await aiSends()).length).toBe(base);

    // pesan BARU setelah batas → dijawab (tepat satu)
    await sleep(1300);
    await customerSays(p.request, "m4 pesan baru setelah aktivasi");
    await expect.poll(async () => (await aiSends()).length, { timeout: 20_000 }).toBe(base + 1);
    await expect(log.locator(".msg", { hasText: SIM }).last()).toBeVisible({ timeout: 20_000 });
    await sleep(1500);
    expect((await aiSends()).length).toBe(base + 1);
    await a.ctx.close();
  });
});

test.describe("@tahap-3 G8 (SIMULASI) kill switch global menghentikan pengiriman otomatis < 1 menit, tampil jelas, dan tidak menyala/lepas sendiri", () => {
  test("pengguna berizin menghentikan global → banner di inbox < 60 dtk; pesan baru tidak dijawab; tetap menyala; dilepas manusia → dijawab lagi", async ({ browser }) => {
    const a = await openAs(browser, fx.inbox1);
    const p = a.page;
    await p.locator(".conv").first().click();
    const k = await openAs(browser, fx.killer, "/kill-switch");
    const base = (await aiSends()).length;

    // pengguna biasa (admin inbox) TIDAK dapat membuka halaman kill switch global
    await p.goto("/kill-switch");
    await expect(p.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
    await p.goto("/inbox");
    await p.locator(".conv").first().click();

    // hentikan global
    await k.page.getByLabel(/Alasan \(wajib/).fill("uji G8: hentikan semua otomatisasi");
    const t0 = Date.now();
    await k.page.getByRole("row", { name: /GLOBAL/ }).getByRole("button", { name: "Hentikan" }).click();
    await expect(k.page.getByRole("row", { name: /GLOBAL/ }).getByText("MENYALA — otomatisasi berhenti")).toBeVisible({ timeout: 15_000 });
    await expect(p.getByRole("alert", { name: "Kill switch aktif" })).toBeVisible({ timeout: 60_000 }); // tampil jelas di inbox
    const shown = Date.now() - t0;
    expect(shown).toBeLessThan(60_000);

    // pesan baru → tidak dijawab; job dibatalkan oleh kill switch (jujur di panel)
    await customerSays(p.request, "g8 pesan saat kill switch global menyala");
    await expect(p.getByRole("log", { name: "Pesan" })).toContainText("g8 pesan saat kill switch", { timeout: 20_000 });
    await sleep(2500);
    expect((await aiSends()).length).toBe(base);
    await p.getByText("Pengiriman otomatis (simulasi)").click();
    await expect(p.getByText(/Dibatalkan \(tidak ada pesan terkirim\) · kill_switch:global/).first()).toBeVisible({ timeout: 20_000 });

    // tidak melepas sendiri: tetap menyala setelah menunggu dan memuat ulang
    await sleep(6000);
    await k.page.reload();
    await expect(k.page.getByRole("row", { name: /GLOBAL/ }).getByText("MENYALA — otomatisasi berhenti")).toBeVisible();
    await expect(p.getByRole("alert", { name: "Kill switch aktif" })).toBeVisible();

    // dilepas oleh MANUSIA → pesan berikutnya dijawab lagi (membuktikan kill switch adalah penyebabnya); pesan yang dibatalkan tidak hidup lagi
    await k.page.getByRole("row", { name: /GLOBAL/ }).getByRole("button", { name: "Lepas" }).click();
    await expect(p.getByRole("alert", { name: "Kill switch aktif" })).toHaveCount(0, { timeout: 60_000 });
    await customerSays(p.request, "g8 pesan setelah kill switch dilepas");
    await expect.poll(async () => (await aiSends()).length, { timeout: 20_000 }).toBe(base + 1);
    await Promise.all([a.ctx.close(), k.ctx.close()]);
  });
});
