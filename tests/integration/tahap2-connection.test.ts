import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { MockGraph } from "../helpers/mock-graph";
import { ownerQuery, resetDb } from "../helpers/db";
import { loginFull, makeChannel, makeRole, makeSuperAdminSession, makeUser } from "../helpers/fixtures";
import { PHONE_ID, WABA, enableConnector } from "../helpers/whatsapp";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
async function setup() {
  await enableConnector();
  const ch = await makeChannel("Kemitraan — contoh", "Kemitraan");
  const role = await makeRole("Pengelola Koneksi", [{ permission: "channel.view", channelIds: [ch.id] }, { permission: "channel.manage", channelIds: [ch.id] }]);
  const ui = await loginFull(await makeUser({ roleIds: [role.id] }));
  return { ch, ui };
}
const meta = () => { mock.phones.set(PHONE_ID, { display: "15550000001", name: "Contoh Bisnis" }); mock.wabas.set(WABA, [PHONE_ID]); mock.subscribed.add(WABA); };
const put = (ui: Awaited<ReturnType<typeof setup>>["ui"], id: string, b: Record<string, string> = { wabaId: WABA, phoneNumberId: PHONE_ID }) => ui.put(`/api/v1/channels/${id}/connection`, b);

describe("@tahap-2 koneksi channel: pemetaan WABA ↔ phone_number_id ↔ channel", () => {
  it("belum dikonfigurasi → configured:false; setelah disimpan: 'belum diperiksa' (BUKAN terhubung)", async () => {
    const { ch, ui } = await setup();
    expect((await ui.get(`/api/v1/channels/${ch.id}/connection`)).body).toEqual({ configured: false });
    const r = await put(ui, ch.id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ configured: true, wabaId: WABA, phoneNumberId: PHONE_ID, verificationStatus: "belum_diperiksa", verificationMode: null, testMode: true });
    expect(JSON.stringify(r.body).toLowerCase()).not.toContain("terhubung");
    expect((await q("select status from channels"))[0].status).toBe("belum_dikonfigurasi"); // status channel Tahap 1 tak berubah
  });

  it("validasi: ID harus angka; satu phone_number_id hanya untuk satu channel (409); channel diarsipkan ditolak", async () => {
    const { ch, ui } = await setup();
    expect((await put(ui, ch.id, { wabaId: "abc", phoneNumberId: PHONE_ID })).status).toBe(400);
    expect((await put(ui, ch.id)).status).toBe(200);
    const other = await makeChannel("Hotline — contoh", "Hotline");
    const role = await makeRole("Pengelola 2", [{ permission: "channel.view", channelIds: [other.id] }, { permission: "channel.manage", channelIds: [other.id] }]);
    const ui2 = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await put(ui2, other.id)).body.error.code).toBe("PHONE_NUMBER_ID_TAKEN");
    await ownerQuery("update channels set archived_at = now() where id = $1", [ch.id]);
    const archived = await put(ui, ch.id, { wabaId: WABA, phoneNumberId: "200000000000077" });
    expect([archived.status, archived.body.error.code]).toEqual([400, "CHANNEL_ARCHIVED"]); // terarsip: tetap terlihat, tidak dapat dikonfigurasi
  });

  it("izin: lihat saja → tidak boleh ubah (403); di luar cakupan → 404; tanpa izin apa pun → 403; flag mati → FEATURE_DISABLED", async () => {
    const { ch, ui } = await setup();
    const viewRole = await makeRole("Pelihat", [{ permission: "channel.view", channelIds: [ch.id] }]);
    const viewer = await loginFull(await makeUser({ roleIds: [viewRole.id] }));
    expect((await viewer.get(`/api/v1/channels/${ch.id}/connection`)).status).toBe(200);
    expect((await put(viewer, ch.id)).status).toBe(403);
    expect((await viewer.post(`/api/v1/channels/${ch.id}/connection/verify`)).status).toBe(403);
    const other = await makeChannel("Hotline — contoh", "Hotline");
    expect((await viewer.get(`/api/v1/channels/${other.id}/connection`)).status).toBe(404);
    expect((await (await loginFull(await makeUser())).get(`/api/v1/channels/${ch.id}/connection`)).status).toBe(403);
    await enableConnector(false);
    expect((await ui.get(`/api/v1/channels/${ch.id}/connection`)).body.error.code).toBe("FEATURE_DISABLED");
  });
});

describe("@tahap-2 verifikasi koneksi: 'terverifikasi' HANYA dari pemeriksaan nyata ke Graph API", () => {
  it("pemeriksaan berhasil terhadap MOCK → terverifikasi dengan mode 'simulasi' (bukan 'nyata'); nomor disamarkan; tanpa rahasia", async () => {
    const { ch, ui } = await setup();
    meta();
    await put(ui, ch.id);
    const r = await ui.post(`/api/v1/channels/${ch.id}/connection/verify`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ verified: true, mode: "simulasi" });
    expect(r.body.detail).toMatchObject({ endpoint: "mock", phone: { ok: true, display: "••••0001", verifiedName: "Contoh Bisnis" }, waba: { ok: true, memberOfWaba: true }, webhookSubscribed: true, problems: [] });
    const [c] = await q("select verification_status, verification_mode, verified_at from channel_connections");
    expect(c).toMatchObject({ verification_status: "terverifikasi", verification_mode: "simulasi" });
    expect(c.verified_at).not.toBeNull();
    expect(JSON.stringify(await q("select * from channel_connections")) + JSON.stringify(r.body)).not.toContain("uji-access-token-sintetis");
    expect((await q("select result from audit_log where action = 'integration.connection_verified'"))[0].result).toBe("success");
    expect(mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("aplikasi belum berlangganan WABA → tetap terverifikasi tetapi MELAPORKAN masalah webhook", async () => {
    const { ch, ui } = await setup();
    meta();
    mock.subscribed.clear();
    await put(ui, ch.id);
    const r = await ui.post(`/api/v1/channels/${ch.id}/connection/verify`);
    expect(r.body.verified).toBe(true);
    expect(r.body.detail.webhookSubscribed).toBe(false);
    expect(r.body.detail.problems.join(" ")).toContain("belum berlangganan");
  });

  it("pemetaan salah (phone_number_id bukan milik WABA) → GAGAL dengan alasan; tidak ada status terverifikasi", async () => {
    const { ch, ui } = await setup();
    meta();
    mock.wabas.set(WABA, ["299999999999999"]);
    await put(ui, ch.id);
    const r = await ui.post(`/api/v1/channels/${ch.id}/connection/verify`);
    expect(r.body.verified).toBe(false);
    expect(r.body.detail.problems.join(" ")).toContain("tidak ditemukan di WABA");
    expect((await q("select verification_status, verified_at from channel_connections"))[0]).toEqual({ verification_status: "gagal", verified_at: null });
  });

  it("token ditolak Meta → gagal (autentikasi); tidak terjangkau → gagal (jaringan); token env kosong → gagal (konfigurasi)", async () => {
    const { ch, ui } = await setup();
    meta();
    await put(ui, ch.id);
    mock.token = "bukan-token-yang-benar";
    let r = await ui.post(`/api/v1/channels/${ch.id}/connection/verify`);
    expect(r.body.verified).toBe(false);
    expect(r.body.detail.problems.join(" ")).toContain("Token akses Meta ditolak");
    mock.token = "uji-access-token-sintetis-0001";
    process.env.META_GRAPH_BASE_URL = "http://127.0.0.1:1";
    resetEnvCacheForTests();
    try {
      r = await ui.post(`/api/v1/channels/${ch.id}/connection/verify`);
      expect(r.body.verified).toBe(false);
      expect(r.body.detail.problems.join(" ")).toMatch(/jaringan/i);
    } finally {
      process.env.META_GRAPH_BASE_URL = mock.url;
      resetEnvCacheForTests();
    }
    const prev = process.env.META_ACCESS_TOKEN;
    delete process.env.META_ACCESS_TOKEN;
    resetEnvCacheForTests();
    try {
      r = await ui.post(`/api/v1/channels/${ch.id}/connection/verify`);
      expect(r.body.verified).toBe(false);
      expect(r.body.detail.problems.join(" ")).toContain("Konfigurasi Meta belum lengkap");
    } finally {
      process.env.META_ACCESS_TOKEN = prev;
      resetEnvCacheForTests();
    }
  });

  it("mengubah pemetaan MEMBATALKAN verifikasi lama", async () => {
    const { ch, ui } = await setup();
    meta();
    await put(ui, ch.id);
    await ui.post(`/api/v1/channels/${ch.id}/connection/verify`);
    expect((await q("select verification_status from channel_connections"))[0].verification_status).toBe("terverifikasi");
    await put(ui, ch.id, { wabaId: WABA, phoneNumberId: "200000000000055" });
    expect((await q("select verification_status, verification_mode, verified_at from channel_connections"))[0]).toEqual({ verification_status: "belum_diperiksa", verification_mode: null, verified_at: null });
  });

  it("database MENOLAK status 'terverifikasi' tanpa mode & waktu bukti (CHECK) — tidak dapat dipalsukan lewat kode lain", async () => {
    const { ch, ui } = await setup();
    await put(ui, ch.id);
    const e1 = await ownerQuery("update channel_connections set verification_status = 'terverifikasi'").catch((x) => x);
    expect(e1.code).toBe("23514");
    const e2 = await ownerQuery("update channel_connections set verification_status = 'terhubung'").catch((x) => x);
    expect(e2.code).toBe("23514");
    const e3 = await ownerQuery("update channel_connections set verification_status = 'terverifikasi', verification_mode = 'nyata'").catch((x) => x); // tanpa verified_at
    expect(e3.code).toBe("23514");
  });
});

describe("@tahap-2 mode uji channel", () => {
  it("hanya Super Admin yang dapat mengubahnya; mematikan mode uji tidak diizinkan di luar production", async () => {
    const { ch, ui } = await setup();
    await put(ui, ch.id);
    expect((await ui.patch(`/api/v1/channels/${ch.id}/connection`, { testMode: false })).status).toBe(403);
    const sa = await makeSuperAdminSession();
    expect((await sa.client.patch(`/api/v1/channels/${ch.id}/connection`, { testMode: false })).body.error.code).toBe("TEST_MODE_REQUIRED");
    expect((await q("select test_mode from channel_connections"))[0].test_mode).toBe(true);
  });
});
