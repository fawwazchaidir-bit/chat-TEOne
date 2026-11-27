import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { currentTotp } from "../../src/modules/auth/totp";
import { E2E_BASE_URL, E2E_CTL_URL, E2E_CUSTOMER, E2E_ENV, E2E_OWNER_URL, E2E_PHONE_ID, E2E_STRANGER, E2E_SYNC_CHANNEL, E2E_SYNC_CUSTOMER, E2E_SYNC_DISPLAY, E2E_SYNC_PHONE_ID, E2E_SYNC_STRANGER, E2E_SYNC_WABA, E2E_WABA, FIXTURE_FILE } from "./env";

const fx = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as { kemitraan: { email: string; password: string }; hotline: { email: string; password: string }; syncSa: { email: string; password: string } };
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
    await expect(panel.getByText("Belum diperiksa", { exact: true }).first()).toBeVisible();
    await expect(panel.getByText("Belum terbukti siap menerima pesan")).toBeVisible(); // G2-A05: tiga bukti terpisah, "siap" tidak diklaim tanpa bukti
    await expect(panel.getByText("Langganan belum diperiksa")).toBeVisible();
    await panel.getByRole("button", { name: "Periksa koneksi" }).click();
    await expect(panel.getByText("Pemeriksaan gagal").first()).toBeVisible({ timeout: 15_000 }); // Meta tidak terjangkau → TIDAK ada klaim koneksi
    await expect(panel.getByText(/Siap menerima pesan — terbukti/)).toHaveCount(0);
    expect(await page.content()).not.toMatch(/>\s*Terhubung\s*</);
    expect((await page.content()).toLowerCase()).not.toContain("hubungkan whatsapp");
  });
});

// ═════════════ S-12 — sinkronisasi kontak & riwayat (SIMULASI: mock Graph + payload sintetis berbentuk resmi; BUKAN Meta, BUKAN nomor nyata) ═════════════
const ctlJson = async (path: string, method = "GET", body?: unknown) => (await fetch(`${E2E_CTL_URL}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json() as Promise<unknown>;
const smbCalls = async () => (await ctlJson("/smb-calls")) as { syncType: string }[];
const sendsCount = async () => ((await ctlJson("/sends")) as unknown[]).length;
async function dbq<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: E2E_OWNER_URL });
  await c.connect();
  try { return (await c.query(sql, params)).rows as T[]; } finally { await c.end(); }
}
const wibLocal = (msAgo: number) => new Date(Date.now() - msAgo + 7 * 3600_000).toISOString().slice(0, 16); // nilai <input type=datetime-local> dalam WIB
const hook = (changes: unknown[]) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: E2E_SYNC_WABA, changes }] });
const metaBlock = { messaging_product: "whatsapp", metadata: { display_phone_number: E2E_SYNC_DISPLAY, phone_number_id: E2E_SYNC_PHONE_ID } };
const histChange = (threads: unknown[], md: { phase: number; chunk_order: number; progress: number }) => ({ field: "history", value: { ...metaBlock, history: [{ metadata: md, threads }] } });
const hmsg = (id: string, from: string, text: string, agoSec: number) => ({ from, id, timestamp: String(Math.floor(Date.now() / 1000) - agoSec), type: "text", text: { body: text }, history_context: { status: "read" } });

test.describe("@tahap-2 G2-S12 (SIMULASI — mock Graph, BUKAN Meta) sinkronisasi kontak & riwayat: Step 1 → Step 2 → history masuk → 0 otomatisasi/unread; klik ganda → satu permintaan; di luar jendela → ditolak", () => {
  test("alur lengkap Super Admin + 2FA di channel coexistence", async ({ page, request }) => {
    test.setTimeout(240_000);
    const post = async (changes: unknown[]) => { const raw = hook(changes); const r = await request.post("/api/webhooks/whatsapp", { data: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) } }); expect(r.status()).toBe(200); };
    const csrf = async () => (await (await page.request.get("/api/v1/auth/me")).json()).csrfToken as string;
    const call = async (method: "post" | "put", path: string, data: unknown) => page.request[method](path, { data, headers: { origin: E2E_BASE_URL, "x-csrf-token": await csrf() } });
    const [ch] = await dbq<{ id: string }>("select id from channels where name = $1", [E2E_SYNC_CHANNEL]);
    const panelOf = () => page.locator("details", { hasText: `Koneksi WhatsApp — ${E2E_SYNC_CHANNEL}` });
    const openPanel = async () => { await page.goto("/channel"); const p = panelOf(); await p.locator("summary").click(); return p; };

    await test.step("Super Admin khusus uji mendaftarkan 2FA (sesi penuh diperlukan untuk memicu sinkronisasi)", async () => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(fx.syncSa.email);
      await page.getByLabel("Kata sandi").fill(fx.syncSa.password);
      await page.getByRole("button", { name: "Masuk" }).click();
      await expect(page).toHaveURL(/\/login\/2fa-setup/); // Super Admin wajib 2FA: sesi belum penuh sampai terdaftar
      await page.getByRole("button", { name: "Mulai pendaftaran 2FA" }).click();
      const secret = (await page.locator("code.mono").first().innerText()).trim();
      await page.getByLabel("Kode 6 digit").fill(currentTotp(secret));
      await page.getByRole("button", { name: "Aktifkan 2FA" }).click();
      await page.getByLabel("Saya sudah menyimpan kode pemulihan").check();
      await page.getByRole("button", { name: "Selesai" }).click();
      await expect(page).toHaveURL(/\/dashboard/);
    });

    await test.step("flag history_sync MATI → panel jujur 'Belum tersedia'; API menolak 404 dan tidak memanggil Meta", async () => {
      const p = await openPanel();
      await expect(p.getByText("Belum tersedia · Tahap 2")).toBeVisible();
      await expect(p.getByText("history_sync").first()).toBeVisible();
      expect((await call("post", `/api/v1/channels/${ch!.id}/history-sync`, { syncType: "smb_app_state_sync", confirmSubscribed: true, confirmOnce: true })).status()).toBe(404);
      expect(await smbCalls()).toEqual([]);
    });

    await test.step("flag dinyalakan (sementara) + pemetaan terverifikasi hanya pada SIMULASI", async () => {
      expect((await call("put", "/api/v1/feature-flags", { key: "history_sync", enabled: true })).status()).toBe(200);
      await ctlJson("/register", "POST", { phoneId: E2E_SYNC_PHONE_ID, wabaId: E2E_SYNC_WABA, display: E2E_SYNC_DISPLAY });
      const p = await openPanel();
      await p.getByRole("button", { name: "Periksa koneksi" }).click();
      await expect(p.getByText("Pemetaan nomor terverifikasi — SIMULASI (mock, bukan Meta)").first()).toBeVisible({ timeout: 15_000 });
      await expect(p.getByText("Endpoint: MOCK — hasil = SIMULASI")).toBeVisible();
    });

    await test.step("DI LUAR JENDELA: jam onboarding 25 jam lalu → 'habis', tombol terkunci, API 409 (e), tanpa panggilan Meta", async () => {
      let p = await openPanel();
      await expect(p.locator("p", { hasText: "Jam onboarding:" }).first()).toContainText("Tidak diketahui");
      await expect(p.getByRole("button", { name: /Jalankan Step 1/ })).toBeDisabled(); // jam tidak diketahui → terkunci
      await p.getByLabel(/Jam selesai onboarding/).fill(wibLocal(25 * 3600_000));
      await p.getByRole("button", { name: "Nyatakan jam onboarding" }).click();
      await expect(p.getByText(/Jam onboarding disimpan/)).toBeVisible();
      p = await openPanel();
      await expect(p.locator("p", { hasText: "Sisa jendela 24 jam:" }).first()).toContainText("habis");
      await expect(p.getByText("Dinyatakan admin (bukan bukti Meta)").first()).toBeVisible();
      await expect(p.getByRole("button", { name: /Jalankan Step 1/ })).toBeDisabled();
      const denied = await call("post", `/api/v1/channels/${ch!.id}/history-sync`, { syncType: "smb_app_state_sync", confirmSubscribed: true, confirmOnce: true });
      expect(denied.status()).toBe(409);
      expect(((await denied.json()).error.details.failed as { key: string }[]).map((f) => f.key)).toContain("e");
      expect(await smbCalls()).toEqual([]);
    });

    await test.step("jam onboarding 2 jam lalu (belum ada permintaan → boleh dikoreksi) → sisa jendela terhitung dari jam database", async () => {
      let p = await openPanel();
      await p.getByLabel(/Jam selesai onboarding/).fill(wibLocal(2 * 3600_000));
      await p.getByRole("button", { name: "Nyatakan jam onboarding" }).click();
      await expect(p.getByText(/Jam onboarding disimpan/)).toBeVisible();
      p = await openPanel();
      await expect(p.locator("p", { hasText: "Sisa jendela 24 jam:" }).first()).toContainText(/2[12] j/);
      await expect(p.getByRole("button", { name: /Jalankan Step 1/ })).toBeEnabled();
    });

    await test.step("Step 2 terkunci sebelum Step 1; Step 1 dengan konfirmasi ganda + KLIK GANDA → tepat SATU panggilan Meta; status jujur ('diterima Meta', bukan 'berhasil')", async () => {
      const p = await openPanel();
      await expect(p.getByRole("button", { name: /Jalankan Step 2/ })).toBeDisabled();
      await p.getByRole("button", { name: /Jalankan Step 1/ }).click();
      const confirm = p.getByRole("group", { name: "Konfirmasi ganda" });
      const send = confirm.getByRole("button", { name: "Ya, kirim permintaan ke Meta" });
      await expect(send).toBeDisabled();
      await confirm.getByLabel(/SUDAH di-subscribe/).check();
      await expect(send).toBeDisabled(); // satu konfirmasi belum cukup
      await confirm.getByLabel(/hanya sekali/).check();
      await expect(send).toBeDisabled(); // nama channel belum diketik
      await confirm.getByLabel(/Ketik nama channel/).fill(E2E_SYNC_CHANNEL);
      await expect(send).toBeEnabled();
      await send.dblclick();
      await expect(p.getByText(/Permintaan diterima Meta/).first()).toBeVisible({ timeout: 15_000 });
      expect((await p.innerText()).toLowerCase()).not.toContain("berhasil");
      expect((await smbCalls()).map((c) => c.syncType)).toEqual(["smb_app_state_sync"]); // satu, bukan dua
      expect(await dbq("select status, attempts from smb_sync_requests where channel_id=$1", [ch!.id])).toEqual([{ status: "diterima_meta", attempts: 1 }]);
      // permintaan ulang lewat API langsung → ditolak tanpa panggilan Meta (hanya sekali)
      expect((await call("post", `/api/v1/channels/${ch!.id}/history-sync`, { syncType: "smb_app_state_sync", confirmSubscribed: true, confirmOnce: true })).status()).toBe(409);
      expect(await smbCalls()).toHaveLength(1);
    });

    await test.step("webhook kontak (smb_app_state_sync): kontak di daftar uji tersimpan TANPA percakapan; yang di luar daftar dibuang", async () => {
      const item = (full: string, phone: string) => ({ type: "contact", contact: { full_name: full, first_name: full.split(" ")[0], phone_number: phone }, action: "add", metadata: { timestamp: String(Math.floor(Date.now() / 1000)) } });
      await post([{ field: "smb_app_state_sync", value: { ...metaBlock, state_sync: [item("Peserta Sinkron", E2E_SYNC_CUSTOMER), item("Orang Asing", E2E_SYNC_STRANGER)] } }]);
      await expect.poll(async () => (await dbq("select 1 from contact_identities where identity_value=$1", [E2E_SYNC_CUSTOMER])).length, { timeout: 20_000 }).toBe(1);
      expect((await dbq<{ display_name: string }>("select c.display_name from contacts c join contact_identities i on i.contact_id=c.id where i.identity_value=$1", [E2E_SYNC_CUSTOMER]))[0]?.display_name).toBe("Peserta Sinkron");
      expect(await dbq("select 1 from contact_identities where identity_value=$1", [E2E_SYNC_STRANGER])).toHaveLength(0);
      expect(await dbq("select 1 from conversations where channel_id=$1", [ch!.id])).toHaveLength(0); // kontak ≠ percakapan
      await expect.poll(async () => (await dbq("select 1 from inbound_events where channel_id=$1 and kind='contact_sync' and status='quarantined' and payload is null", [ch!.id])).length, { timeout: 20_000 }).toBe(1); // orang asing: dibuang tanpa payload
    });

    const sendsBefore = await sendsCount();
    const outboxBefore = (await dbq<{ n: number }>("select count(*)::int n from domain_outbox"))[0]!.n;

    await test.step("Step 2: dua permintaan SERENTAK (klik ganda) → satu 200 + satu 409; total panggilan Meta = Step 1 + Step 2", async () => {
      const body = { syncType: "history", confirmSubscribed: true, confirmOnce: true };
      const rs = await Promise.all([call("post", `/api/v1/channels/${ch!.id}/history-sync`, body), call("post", `/api/v1/channels/${ch!.id}/history-sync`, body)]);
      expect(rs.map((r) => r.status()).sort()).toEqual([200, 409]);
      expect((await smbCalls()).map((c) => c.syncType)).toEqual(["smb_app_state_sync", "history"]);
    });

    await test.step("history fase 2 → 0 → 1 (tidak berurutan; pelanggan uji + orang asing): tersimpan sebagai history; 0 otomatisasi, 0 unread, jendela tidak terbuka", async () => {
      const mine = (...m: unknown[]) => ({ id: E2E_SYNC_CUSTOMER, messages: m });
      const theirs = { id: E2E_SYNC_STRANGER, messages: [hmsg("wamid.e2e.s12.asing", E2E_SYNC_STRANGER, "RAHASIA ORANG ASING S12", 3600)] };
      await post([histChange([mine(hmsg("wamid.e2e.s12.h2", E2E_SYNC_CUSTOMER, "riwayat lama fase 2", 100 * 86400))], { phase: 2, chunk_order: 1, progress: 90 })]);
      await post([histChange([mine(hmsg("wamid.e2e.s12.h0", E2E_SYNC_DISPLAY, "balasan bisnis fase 0", 1800), hmsg("wamid.e2e.s12.h0b", E2E_SYNC_CUSTOMER, "halo fase 0", 3600)), theirs], { phase: 0, chunk_order: 1, progress: 20 })]);
      await post([histChange([mine(hmsg("wamid.e2e.s12.h1", E2E_SYNC_CUSTOMER, "riwayat fase 1", 5 * 86400))], { phase: 1, chunk_order: 1, progress: 100 })]);
      await expect.poll(async () => (await dbq("select 1 from messages where channel_id=$1 and is_history", [ch!.id])).length, { timeout: 30_000 }).toBe(4);
      expect(await dbq("select source, is_history, unread_eligible from messages where channel_id=$1 group by 1,2,3", [ch!.id])).toEqual([{ source: "history", is_history: true, unread_eligible: false }]);
      expect(await dbq("select 1 from conversations where channel_id=$1 and last_customer_message_at is not null", [ch!.id])).toHaveLength(0);
      expect(await dbq("select 1 from contact_identities where identity_value=$1", [E2E_SYNC_STRANGER])).toHaveLength(0);
      expect((await dbq<{ n: number }>("select count(*)::int n from domain_outbox"))[0]!.n).toBe(outboxBefore);
      expect(await sendsCount()).toBe(sendsBefore); // 0 otomatisasi: tidak ada pesan keluar
    });

    await test.step("panel jujur: progres 100% dilaporkan Meta, jumlah data yang benar-benar diterima; tidak ada data orang asing di halaman", async () => {
      const p = await openPanel();
      await expect(p.getByText(/Pesan riwayat tersimpan:/)).toContainText("4");
      await expect(p.getByText(/Event kontak diproses:/)).toContainText("1");
      await expect(p.getByText(/100% — selesai \(progres 100 dilaporkan Meta\)/)).toBeVisible();
      await expect(p.getByText("Permintaan diterima Meta — hasil menyusul lewat webhook")).toHaveCount(2);
      const html = await page.content();
      for (const secretText of ["RAHASIA ORANG ASING S12", E2E_SYNC_STRANGER, E2E_SYNC_CUSTOMER, "mock.req"]) expect(html).not.toContain(secretText);
    });

    await test.step("pembersihan: flag history_sync dimatikan kembali", async () => {
      expect((await call("put", "/api/v1/feature-flags", { key: "history_sync", enabled: false })).status()).toBe(200);
    });
  });
});
