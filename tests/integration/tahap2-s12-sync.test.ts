/**
 * S-12: pemicu sinkronisasi kontak & riwayat (SMB App Data API). SIMULASI — mock Graph, BUKAN Meta; tidak ada nomor/akun nyata.
 * Membuktikan: sekali saja (database), jendela 24 jam (jam database), tanpa retry pada hasil tidak pasti, kill switch, izin + 2FA, nomor operasional, audit tanpa payload.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { syncTestHooks } from "@/modules/whatsapp-adapter";
import { MockGraph } from "../helpers/mock-graph";
import { ownerQuery, resetDb } from "../helpers/db";
import { loginFull, makeChannel, makeRole, makeSuperAdminSession, makeUser } from "../helpers/fixtures";
import { PHONE_ID, WABA, enableConnector, mapChannel } from "../helpers/whatsapp";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); });
afterEach(() => { syncTestHooks.afterReserve = undefined; });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const flag = (key: string, on = true) => ownerQuery("insert into feature_flag_overrides(key, enabled) values($1,$2) on conflict (key) do update set enabled = excluded.enabled", [key, on]);

type World = Awaited<ReturnType<typeof world>>;
/** Dunia standar: kedua flag nyala, channel coexistence terpetakan + "terverifikasi" (SIMULASI), onboarding 2 jam lalu, Super Admin 2FA penuh. */
async function world(o: { onboardedAgo?: string | null; tag?: string } = {}) {
  await enableConnector();
  await flag("history_sync");
  const tag = o.tag ?? "";
  const channel = await makeChannel(`Kemitraan — uji${tag}`, "Kemitraan", { integrationKind: "cloud_api_coexistence" });
  await mapChannel(channel.id, { phoneId: tag ? `2000000000001${tag}` : PHONE_ID });
  await ownerQuery("update channel_connections set verification_status='terverifikasi', verification_mode='simulasi', verified_at=now() where channel_id=$1", [channel.id]);
  const ago = o.onboardedAgo === undefined ? "2 hours" : o.onboardedAgo;
  if (ago) await ownerQuery("update channel_connections set coexistence_onboarded_at = now() - $2::interval, coexistence_onboarded_source='dinyatakan_admin' where channel_id=$1", [channel.id, ago]);
  const sa = await makeSuperAdminSession();
  return { channel, sa: sa.client };
}
const url = (w: World, p = "") => `/api/v1/channels/${w.channel.id}/history-sync${p}`;
const body = (syncType: string, over: Record<string, unknown> = {}) => ({ syncType, confirmSubscribed: true, confirmOnce: true, ...over });
const step = (w: World, t: string, over: Record<string, unknown> = {}) => w.sa.post(url(w), body(t, over));
const S1 = "smb_app_state_sync";
const S2 = "history";
const rows = (w: World) => q("select * from smb_sync_requests where channel_id=$1 order by requested_at", [w.channel.id]);
const failedKeys = (r: { body: { error?: { details?: { failed?: { key: string }[] } } } }) => (r.body.error?.details?.failed ?? []).map((f) => f.key).sort();
/** Jam DATABASE (jam aplikasi pada tes ini dimajukan 31 dtk per kode TOTP oleh helper uji; jendela sinkronisasi memang dihitung dari jam database). */
const dbMs = async () => new Date((await q("select clock_timestamp() as t"))[0].t).getTime();
const audits = (w: World, result?: string) => q("select action, result, metadata from audit_log where object_id=$1 and (action like 'integration.history_sync%' or action = 'integration.onboarding_declared') and ($2::text is null or result=$2) order by id", [w.channel.id, result ?? null]);

describe("@tahap-2 S-12 P1 klien SMB App Data: bentuk resmi dan tanpa percobaan ulang", () => {
  it("Step 1 → tepat SATU panggilan POST /<phone_number_id>/smb_app_data berbadan resmi; request_id disimpan; status 'diterima Meta' hanya dari respons sah", async () => {
    const w = await world();
    const r = await step(w, S1);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ syncType: S1, status: "diterima_meta" });
    expect(mock.smbCalls()).toHaveLength(1);
    const call = mock.smbCalls()[0]!;
    expect(call.path).toMatch(new RegExp(`/${PHONE_ID}/smb_app_data$`));
    expect(call.json).toEqual({ messaging_product: "whatsapp", sync_type: S1 }); // bentuk persis dokumentasi resmi
    expect(call.auth).toBe(`Bearer ${mock.token}`);
    const [row] = await rows(w);
    expect(row).toMatchObject({ sync_type: S1, status: "diterima_meta", meta_request_id: "mock.req.1", attempts: 1, failure_kind: null });
    expect(JSON.stringify(r.body)).not.toContain("mock.req.1"); // request_id tidak dikembalikan ke browser
  });

  it("respons 200 TANPA request_id / bukan JSON → 'belum pasti' (tidak pernah dinyatakan diterima); tidak ada percobaan ulang", async () => {
    for (const mode of ["noid", "badjson"] as const) {
      await resetDb(); mock.reset();
      const w = await world();
      mock.smbMode = mode;
      const r = await step(w, S1);
      expect([r.status, r.body.status], mode).toEqual([200, "belum_pasti"]);
      expect(mock.smbCalls(), mode).toHaveLength(1);
      expect((await rows(w))[0], mode).toMatchObject({ status: "belum_pasti", failure_kind: "respons_tak_dikenal", meta_request_id: null });
    }
  });

  it("galat Meta dipetakan eksplisit: rate limit (429/kode 4) → gagal kategori batas; token ditolak (190) → gagal; 400 → gagal; 500 → belum pasti — masing-masing SATU panggilan", async () => {
    const cases = [["http429", "gagal"], ["http190", "gagal"], ["http400", "gagal"], ["http500", "belum_pasti"]] as const;
    for (const [mode, expected] of cases) {
      await resetDb(); mock.reset();
      const w = await world();
      mock.smbMode = mode;
      const r = await step(w, S1);
      expect([mode, r.status, r.body.status], mode).toEqual([mode, 200, expected]);
      expect(mock.smbCalls(), mode).toHaveLength(1);
      const [row] = await rows(w);
      expect(row, mode).toMatchObject({ status: expected, failure_kind: "http", meta_request_id: null });
      expect(row.meta_code, mode).not.toBeNull();
      const again = await step(w, S1); // TIDAK ada retry otomatis maupun manual-tanpa-penyelesaian
      expect([again.status, failedKeys(again)], mode).toEqual([409, ["f"]]);
      expect(mock.smbCalls(), mode).toHaveLength(1);
    }
    await resetDb(); mock.reset();
    const w = await world();
    mock.smbMode = "http429";
    expect((await step(w, S1)).body.label).toBe("Batas kecepatan/kuota Meta tercapai");
  });
});

describe("@tahap-2 S-12 P2 'sekali saja' ditegakkan di server/database", () => {
  it("klik ganda: dua permintaan BERSAMAAN → tepat satu panggilan Meta, satu baris; yang kedua ditolak 409 (f) — sementara yang pertama masih menunggu Meta", async () => {
    const w = await world();
    const release = mock.hold("smb");
    const first = step(w, S1);
    await mock.waitFor(() => mock.smbCalls().length === 1); // pertama sudah di Meta (baris 'diminta' sudah komit)
    const second = await step(w, S1);
    expect([second.status, failedKeys(second)]).toEqual([409, ["f"]]);
    expect((await rows(w))[0]).toMatchObject({ status: "diminta" });
    release();
    expect((await first).body.status).toBe("diterima_meta");
    expect(mock.smbCalls()).toHaveLength(1);
    expect(await rows(w)).toHaveLength(1);
  });

  it("tanpa penahan: 6 permintaan serentak → tepat SATU panggilan Meta dan satu 200; sisanya 409", async () => {
    const w = await world();
    const rs = await Promise.all(Array.from({ length: 6 }, () => step(w, S1)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(5);
    expect(mock.smbCalls()).toHaveLength(1);
    expect(await rows(w)).toHaveLength(1);
  });

  it("UNIQUE di database: baris kedua untuk (channel, jenis, versi pemetaan) ditolak walau aplikasi dilewati", async () => {
    const w = await world();
    await step(w, S1);
    await expect(ownerQuery("insert into smb_sync_requests(channel_id, sync_type, mapping_version) values($1,$2,0)", [w.channel.id, S1])).rejects.toThrow(/smb_sync_requests_once/);
  });

  it("urutan resmi: Step 2 ditolak sebelum Step 1 diterima Meta (tanpa panggilan); setelah Step 1 diterima → Step 2 jalan; Step 2 dua kali → ditolak", async () => {
    const w = await world();
    const early = await step(w, S2);
    expect([early.status, failedKeys(early)]).toEqual([409, ["g"]]);
    expect(mock.smbCalls()).toHaveLength(0);
    expect((await step(w, S1)).body.status).toBe("diterima_meta");
    expect((await step(w, S2)).body).toMatchObject({ syncType: S2, status: "diterima_meta" });
    expect(mock.smbCalls().map((c) => (c.json as { sync_type: string }).sync_type)).toEqual([S1, S2]);
    expect(failedKeys(await step(w, S2))).toEqual(["f"]);
    expect(mock.smbCalls()).toHaveLength(2);
  });

  it("Step 1 yang 'belum pasti'/'gagal' TIDAK membuka Step 2 (urutan hanya setelah 'diterima Meta')", async () => {
    const w = await world();
    mock.smbMode = "timeout";
    expect((await step(w, S1)).body.status).toBe("belum_pasti");
    expect(failedKeys(await step(w, S2))).toEqual(["g"]);
    expect(mock.smbCalls()).toHaveLength(1);
  });

  it("timeout → 'belum pasti' tanpa retry; permintaan sama ditolak; penyelesaian manual teraudit membuka kunci SESUAI pernyataan admin", async () => {
    const w = await world();
    mock.smbMode = "timeout";
    const r = await step(w, S1);
    expect(r.body).toMatchObject({ status: "belum_pasti" });
    expect(r.body.label).toMatch(/belum pasti/i);
    expect(mock.smbCalls()).toHaveLength(1);
    expect((await rows(w))[0]).toMatchObject({ status: "belum_pasti", failure_kind: "timeout" });
    expect(failedKeys(await step(w, S1))).toEqual(["f"]);
    expect(mock.smbCalls()).toHaveLength(1); // tidak ada retry
    // Penyelesaian: catatan wajib; hasil harus dikenal.
    expect((await w.sa.post(url(w, "/resolve"), { syncType: S1, outcome: "diterima", note: "pendek" })).status).toBe(400);
    expect((await w.sa.post(url(w, "/resolve"), { syncType: S1, outcome: "ngawur", note: "catatan yang cukup panjang" })).status).toBe(400);
    // "tidak_diproses" → boleh diulang SEKALI (percobaan ke-2), bukan otomatis.
    expect((await w.sa.post(url(w, "/resolve"), { syncType: S1, outcome: "tidak_diproses", note: "Dukungan Meta menyatakan tidak ada permintaan masuk" })).status).toBe(200);
    expect((await rows(w))[0]).toMatchObject({ status: "gagal", resolution: "tidak_diproses" });
    mock.smbMode = "ok";
    expect((await step(w, S1)).body.status).toBe("diterima_meta");
    expect(mock.smbCalls()).toHaveLength(2);
    expect((await rows(w))[0]).toMatchObject({ status: "diterima_meta", attempts: 2 });
    const resolved = await q("select result, metadata from audit_log where object_id=$1 and action='integration.history_sync_resolved'", [w.channel.id]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].metadata).toMatchObject({ dari: "belum_pasti", hasil: "tidak_diproses" });
  });

  it("penyelesaian 'diterima' (bukti webhook tiba) → status diterima Meta (tanda penyelesaian manual); yang sudah diterima / masih berjalan tidak dapat diselesaikan", async () => {
    const w = await world();
    mock.smbMode = "http500";
    await step(w, S1);
    expect((await w.sa.post(url(w, "/resolve"), { syncType: S1, outcome: "diterima", note: "Webhook kontak sudah tiba di staging" })).status).toBe(200);
    expect((await rows(w))[0]).toMatchObject({ status: "diterima_meta", resolution: "diterima" });
    const again = await w.sa.post(url(w, "/resolve"), { syncType: S1, outcome: "diterima", note: "Webhook kontak sudah tiba di staging" });
    expect([again.status, again.body.error.code]).toEqual([409, "SYNC_NOT_RESOLVABLE"]);
    // Baris 'diminta' yang masih baru (proses berjalan) tidak boleh diselesaikan; yang macet > 5 menit boleh.
    const w2 = await world({ tag: "2" });
    await ownerQuery("insert into smb_sync_requests(channel_id, sync_type, mapping_version, status) values($1,$2,0,'diminta')", [w2.channel.id, S1]);
    expect((await w2.sa.post(url(w2, "/resolve"), { syncType: S1, outcome: "diterima", note: "Webhook kontak sudah tiba di staging" })).body.error.code).toBe("SYNC_NOT_RESOLVABLE");
    await ownerQuery("update smb_sync_requests set requested_at = now() - interval '10 minutes' where channel_id=$1", [w2.channel.id]);
    expect((await w2.sa.post(url(w2, "/resolve"), { syncType: S1, outcome: "tidak_diproses", note: "Proses macet, tidak ada jawaban Meta" })).status).toBe(200);
  });
});

describe("@tahap-2 S-12 P2 jendela 24 jam (jam DATABASE)", () => {
  it("batas: 23 j 29 m → boleh; 23 j 31 m → ditolak; tepat 24 j+ → ditolak; jam onboarding kosong → ditolak — tanpa panggilan Meta saat ditolak", async () => {
    const cases: [string | null, number, string[]][] = [["23 hours 29 minutes", 200, []], ["23 hours 31 minutes", 409, ["e"]], ["24 hours 5 minutes", 409, ["e"]], ["2 days", 409, ["e"]], [null, 409, ["e"]]];
    for (const [ago, status, keys] of cases) {
      await resetDb(); mock.reset();
      const w = await world({ onboardedAgo: ago });
      const r = await step(w, S1);
      expect([ago, r.status, failedKeys(r)], String(ago)).toEqual([ago, status, keys]);
      expect(mock.smbCalls(), String(ago)).toHaveLength(status === 200 ? 1 : 0);
    }
  });

  it("jendela dihitung dari jam DATABASE, bukan jam aplikasi (menggeser jam aplikasi tidak mengubah hasil)", async () => {
    const w = await world({ onboardedAgo: "23 hours 40 minutes" });
    const realNow = Date.now;
    Date.now = () => realNow() - 3 * 3600_000; // jam aplikasi "mundur" 3 jam: bila dipakai, jendela tampak longgar
    try {
      expect(failedKeys(await step(w, S1))).toEqual(["e"]);
    } finally { Date.now = realNow; }
    expect(mock.smbCalls()).toHaveLength(0);
  });
});

describe("@tahap-2 S-12 P2 kill switch, nomor operasional, pemetaan, flag, konfirmasi", () => {
  it("kill switch global ATAU channel menyala → ditolak (c), tanpa panggilan; dilepas manual → boleh", async () => {
    const w = await world();
    await ownerQuery("insert into kill_switches(scope_type, scope_ref, engaged, reason) values('global','',true,'uji')");
    expect(failedKeys(await step(w, S1))).toEqual(["c"]);
    await ownerQuery("update kill_switches set engaged=false where scope_type='global'");
    await ownerQuery("insert into kill_switches(scope_type, scope_ref, engaged, reason) values('channel',$1,true,'uji')", [w.channel.id]);
    expect(failedKeys(await step(w, S1))).toEqual(["c"]);
    expect(mock.smbCalls()).toHaveLength(0);
    await ownerQuery("update kill_switches set engaged=false");
    expect((await step(w, S1)).body.status).toBe("diterima_meta");
  });

  it("kill switch menyala SESUDAH baris dipesan tetapi SEBELUM panggilan → dibatalkan tanpa memanggil Meta; baris 'tidak dikirim' boleh dipakai ulang", async () => {
    const w = await world();
    syncTestHooks.afterReserve = async () => { await ownerQuery("insert into kill_switches(scope_type, scope_ref, engaged, reason) values('global','',true,'uji')"); };
    const r = await step(w, S1);
    expect([r.status, failedKeys(r)]).toEqual([409, ["c"]]);
    expect(mock.smbCalls()).toHaveLength(0);
    expect((await rows(w))[0]).toMatchObject({ status: "gagal", failure_kind: "tidak_dikirim" });
    syncTestHooks.afterReserve = undefined;
    await ownerQuery("update kill_switches set engaged=false");
    expect((await step(w, S1)).body.status).toBe("diterima_meta"); // satu-satunya panggilan nyata ke Meta
    expect(mock.smbCalls()).toHaveLength(1);
    expect((await rows(w))[0]).toMatchObject({ attempts: 2, status: "diterima_meta" });
  });

  it("channel bertanda OPERASIONAL (Admisi/Hotline) → ditolak (i) sebelum Tahap 9; mode uji mati di non-production → ditolak (i)", async () => {
    const w = await world();
    await ownerQuery("update channels set is_operational=true, environment='production', is_sample=false where id=$1", [w.channel.id]); // guard-operational:allow — uji penolakan
    expect(failedKeys(await step(w, S1))).toEqual(["i"]);
    await ownerQuery("update channels set is_operational=false where id=$1", [w.channel.id]);
    await ownerQuery("update channel_connections set test_mode=false where channel_id=$1", [w.channel.id]);
    expect(failedKeys(await step(w, S1))).toEqual(["i"]);
    expect(mock.smbCalls()).toHaveLength(0);
  });

  it("pemetaan belum terverifikasi / terverifikasi di mode yang tidak sama dengan endpoint / bukan coexistence → ditolak (d, j)", async () => {
    const w = await world();
    await ownerQuery("update channel_connections set verification_status='belum_diperiksa', verification_mode=null, verified_at=null where channel_id=$1", [w.channel.id]);
    expect(failedKeys(await step(w, S1))).toEqual(["d"]);
    await ownerQuery("update channel_connections set verification_status='terverifikasi', verification_mode='nyata', verified_at=now() where channel_id=$1", [w.channel.id]);
    expect(failedKeys(await step(w, S1))).toEqual(["d"]); // 'nyata' tetapi endpoint = mock
    await ownerQuery("update channel_connections set verification_mode='simulasi' where channel_id=$1", [w.channel.id]);
    await ownerQuery("update channels set integration_kind='cloud_api_only' where id=$1", [w.channel.id]);
    expect(failedKeys(await step(w, S1))).toEqual(["j"]);
    expect(mock.smbCalls()).toHaveLength(0);
  });

  it("flag history_sync ATAU whatsapp_connector mati → 404 FEATURE_DISABLED (a), tanpa panggilan; keduanya default mati", async () => {
    const w = await world();
    await flag("history_sync", false);
    const r = await step(w, S1);
    expect([r.status, r.body.error.code]).toEqual([404, "FEATURE_DISABLED"]);
    await flag("history_sync", true);
    await enableConnector(false);
    expect((await step(w, S1)).status).toBe(404);
    expect(mock.smbCalls()).toHaveLength(0);
    const { FEATURE_FLAGS } = await import("@/modules/feature-flags");
    expect(FEATURE_FLAGS.find((f) => f.key === "history_sync")).toMatchObject({ stage: 2 });
    await ownerQuery("delete from feature_flag_overrides");
    expect(await (await import("@/modules/feature-flags")).isFeatureEnabled("history_sync")).toBe(false);
  });

  it("konfirmasi admin teraudit WAJIB lengkap (h): tanpa/sebagian → ditolak; jenis tak dikenal → 400 — tanpa panggilan", async () => {
    const w = await world();
    expect(failedKeys(await step(w, S1, { confirmSubscribed: false }))).toEqual(["h"]);
    expect(failedKeys(await step(w, S1, { confirmOnce: false }))).toEqual(["h"]);
    expect((await w.sa.post(url(w), { syncType: S1 })).status).toBe(400); // badan tanpa konfirmasi
    expect((await step(w, "messages")).status).toBe(400);
    expect(mock.smbCalls()).toHaveLength(0);
    expect(await rows(w)).toHaveLength(0);
  });

  it("token Meta tidak ada → ditolak SEBELUM baris dibuat (kesempatan sekali tidak terbakar oleh konfigurasi)", async () => {
    const w = await world();
    const prev = process.env.META_ACCESS_TOKEN;
    delete process.env.META_ACCESS_TOKEN; resetEnvCacheForTests();
    try {
      expect(failedKeys(await step(w, S1))).toEqual(["j"]);
    } finally { process.env.META_ACCESS_TOKEN = prev; resetEnvCacheForTests(); }
    expect(await rows(w)).toHaveLength(0);
    expect(mock.smbCalls()).toHaveLength(0);
    expect((await step(w, S1)).body.status).toBe("diterima_meta");
  });
});

describe("@tahap-2 S-12 P2 izin: Super Admin + 2FA penuh + izin bercakupan channel — di API langsung", () => {
  it("pengguna biasa dengan izin channel.manage → 403 (b) dan TIDAK ADA panggilan; ditolak teraudit", async () => {
    const w = await world();
    const role = await makeRole("Pengelola", [{ permission: "channel.view", channelIds: [w.channel.id] }, { permission: "channel.manage", channelIds: [w.channel.id] }]);
    const ui = await loginFull(await makeUser({ roleIds: [role.id] }));
    const r = await ui.post(url(w), body(S1));
    expect([r.status, failedKeys(r)]).toEqual([403, ["b"]]);
    expect((await ui.put(url(w, "/onboarding"), { onboardedAt: new Date(Date.now() - 3600_000).toISOString() })).status).toBe(403); // ditolak karena izin (b), sebelum waktu diperiksa
    expect((await ui.post(url(w, "/resolve"), { syncType: S1, outcome: "diterima", note: "catatan yang cukup panjang" })).status).toBe(403);
    expect(mock.smbCalls()).toHaveLength(0);
    expect((await audits(w, "denied")).length).toBeGreaterThanOrEqual(3);
  });

  it("bahkan pengguna biasa yang (secara paksa) memegang izin integration.history_sync ditolak: hanya Super Admin; izin hanya dapat diberikan oleh Super Admin", async () => {
    const w = await world();
    const role = await makeRole("Penyusup", [{ permission: "channel.view", channelIds: [w.channel.id] }, { permission: "integration.history_sync", channelIds: [w.channel.id] }]);
    const ui = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await ui.post(url(w), body(S1))).status).toBe(403);
    expect(mock.smbCalls()).toHaveLength(0);
    const { PERMISSION_META } = await import("@/modules/roles-permissions/registry");
    expect(PERMISSION_META["integration.history_sync"]).toMatchObject({ channelScoped: true, superAdminOnlyGrant: true, available: true });
  });

  it("Super Admin tanpa 2FA/sesi belum penuh → 403 di API langsung; tanpa sesi → 401; di luar cakupan channel → 404 (pengguna dengan cakupan lain)", async () => {
    const w = await world();
    const u = await makeUser({ superAdmin: true });
    const { loginRaw } = await import("../helpers/api");
    const { client } = await loginRaw(u.email, u.password); // belum menyiapkan 2FA → sesi tidak penuh
    expect(client.stage).toBe("totp_setup_required");
    expect((await client.post(url(w), body(S1))).status).toBe(403);
    const { Client } = await import("../helpers/api");
    expect((await new Client().post(url(w), body(S1))).status).toBe(401);
    const other = await makeChannel("Hotline — uji", "Hotline");
    const role = await makeRole("Lain", [{ permission: "channel.view", channelIds: [other.id] }]);
    const ui = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await ui.post(url(w), body(S1))).status).toBe(404);
    expect(mock.smbCalls()).toHaveLength(0);
  });
});

describe("@tahap-2 S-12 P2 jam onboarding = isian admin (bukan bukti Meta)", () => {
  it("dinyatakan Super Admin → tersimpan dengan sumber 'dinyatakan_admin' + audit; di masa depan ditolak; setelah ada permintaan TIDAK dapat diubah", async () => {
    const w = await world({ onboardedAgo: null });
    expect(failedKeys(await step(w, S1))).toEqual(["e"]); // belum dinyatakan → ditolak
    const future = await w.sa.put(url(w, "/onboarding"), { onboardedAt: new Date(await dbMs() + 3600_000).toISOString() });
    expect(future.status).toBe(400);
    expect((await w.sa.put(url(w, "/onboarding"), { onboardedAt: "bukan-tanggal" })).status).toBe(400);
    const when = new Date(await dbMs() - 3600_000).toISOString();
    expect((await w.sa.put(url(w, "/onboarding"), { onboardedAt: when })).status).toBe(200);
    const [c] = await q("select coexistence_onboarded_at, coexistence_onboarded_source, coexistence_onboarded_by from channel_connections where channel_id=$1", [w.channel.id]);
    expect(c.coexistence_onboarded_source).toBe("dinyatakan_admin");
    expect(new Date(c.coexistence_onboarded_at).toISOString()).toBe(when);
    expect((await w.sa.get(url(w))).body.onboarding).toMatchObject({ source: "dinyatakan_admin", label: "Dinyatakan admin (bukan bukti Meta)" });
    expect((await step(w, S1)).body.status).toBe("diterima_meta");
    const late = await w.sa.put(url(w, "/onboarding"), { onboardedAt: new Date(await dbMs() - 1000).toISOString() }); // memperpanjang jendela setelah dipakai = ditolak
    expect([late.status, late.body.error.code]).toEqual([409, "SYNC_ALREADY_REQUESTED"]);
    expect((await q("select action from audit_log where object_id=$1 and action='integration.onboarding_declared' and result='success'", [w.channel.id]))).toHaveLength(1);
  });

  it("pemetaan berubah (WABA/phone_number_id) → jam onboarding direset (tidak diketahui) dan versi pemetaan naik", async () => {
    const w = await world();
    await enableConnector();
    const role = await makeRole("Pengelola", [{ permission: "channel.view", scopeAll: true }, { permission: "channel.manage", scopeAll: true }]);
    const ui = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await ui.put(`/api/v1/channels/${w.channel.id}/connection`, { wabaId: WABA, phoneNumberId: "200000000000055" })).status).toBe(200);
    const [c] = await q("select coexistence_onboarded_at, coexistence_onboarded_source, mapping_version from channel_connections where channel_id=$1", [w.channel.id]);
    expect([c.coexistence_onboarded_at, c.coexistence_onboarded_source, c.mapping_version]).toEqual([null, null, 1]);
    expect(failedKeys(await step(w, S1))).toEqual(["d", "e"]);
  });

  it("onboarding ULANG (offboarding + Embedded Signup lagi): harus SESUDAH permintaan terakhir; menaikkan versi pemetaan; satu siklus baru dibuka setelah verifikasi ulang", async () => {
    const w = await world();
    await step(w, S1);
    await ownerQuery("update smb_sync_requests set requested_at = now() - interval '2 hours' where channel_id=$1", [w.channel.id]); // siklus lama: 2 jam lalu
    const tooEarly = await w.sa.put(url(w, "/onboarding"), { onboardedAt: new Date(await dbMs() - 3 * 3600_000).toISOString(), reonboarded: true });
    expect(tooEarly.status).toBe(400); // sebelum permintaan terakhir
    expect((await w.sa.put(url(w, "/onboarding"), { onboardedAt: new Date(await dbMs() - 60_000).toISOString() })).status).toBe(409); // tanpa pernyataan onboarding ulang
    expect((await w.sa.put(url(w, "/onboarding"), { onboardedAt: new Date(await dbMs() - 60_000).toISOString(), reonboarded: true })).status).toBe(200);
    const [c] = await q("select mapping_version, verification_status from channel_connections where channel_id=$1", [w.channel.id]);
    expect([c.mapping_version, c.verification_status]).toEqual([1, "belum_diperiksa"]);
    expect(failedKeys(await step(w, S1))).toEqual(["d"]); // wajib verifikasi ulang
    await ownerQuery("update channel_connections set verification_status='terverifikasi', verification_mode='simulasi', verified_at=now() where channel_id=$1", [w.channel.id]);
    expect((await step(w, S1)).body.status).toBe("diterima_meta");
    expect(mock.smbCalls()).toHaveLength(2);
    expect((await rows(w)).map((r) => r.mapping_version)).toEqual([0, 1]);
  });
});

describe("@tahap-2 S-12 audit: setiap percobaan dicatat, TANPA payload/rahasia", () => {
  it("diterima/gagal/ditolak masing-masing menghasilkan audit; request_id, token, nomor, dan isi tidak ada di audit maupun respons", async () => {
    const w = await world();
    await step(w, S1, { confirmOnce: false }); // ditolak (h)
    mock.smbMode = "http429";
    await step(w, S1); // gagal (rate limit)
    mock.smbMode = "ok";
    const w2 = await world({ tag: "2" });
    await step(w2, S1); // diterima
    const a1 = await audits(w);
    expect(a1.map((a) => a.result)).toEqual(["denied", "failure"]);
    expect(a1[0].metadata).toMatchObject({ syncType: S1, gagal: ["h"] });
    expect(a1[1].metadata).toMatchObject({ syncType: S1, hasil: "gagal", jenisGalat: "http", kodeMeta: 4, konfirmasiSubscribe: true });
    const a2 = await audits(w2);
    expect(a2).toHaveLength(1);
    expect(a2[0]).toMatchObject({ result: "success" });
    const all = JSON.stringify([...a1, ...a2]);
    expect(all).not.toContain("mock.req"); // request_id
    expect(all).not.toContain(mock.token);
    expect(all).not.toContain(PHONE_ID);
    expect(all).not.toContain(WABA);
  });

  it("channel di luar cakupan/tak ada tetap diaudit sebagai ditolak (tanpa membocorkan keberadaannya)", async () => {
    const w = await world();
    const ghost = randomUUID();
    const r = await w.sa.post(`/api/v1/channels/${ghost}/history-sync`, body(S1));
    expect(r.status).toBe(404);
    expect((await q("select result from audit_log where object_id=$1 and action='integration.history_sync_requested'", [ghost]))).toEqual([{ result: "denied" }]);
  });
});

describe("@tahap-2 S-12 tampilan data (GET): jujur, tanpa klaim berhasil tanpa respons Meta", () => {
  it("flag mati → available:false; flag nyala → prasyarat a–j per jenis; sebelum permintaan tidak ada status 'diterima'", async () => {
    const w = await world();
    await flag("history_sync", false);
    expect((await w.sa.get(url(w))).body).toEqual({ available: false });
    await flag("history_sync", true);
    const v = (await w.sa.get(url(w))).body;
    expect(v).toMatchObject({ available: true, configured: true, realEndpoint: false, canAct: true, requests: [] });
    const keys = (c: { key: string }[]) => c.map((x) => x.key).join("");
    expect(keys(v.checks.smb_app_state_sync)).toBe("abcdefghij");
    expect(keys(v.checks.history)).toBe("abcdefghij");
    const h = (t: string) => Object.fromEntries(v.checks[t].map((c: { key: string; ok: boolean | null }) => [c.key, c.ok]));
    expect(h("smb_app_state_sync")).toMatchObject({ a: true, b: true, c: true, d: true, e: true, f: true, g: true, h: null, i: true, j: true });
    expect(h("history")).toMatchObject({ g: false }); // Step 2 menunggu Step 1
    expect(v.onboarding.remainingSec).toBeGreaterThan(21 * 3600);
    expect(JSON.stringify(v)).not.toMatch(/berhasil/i);
  });

  it("setelah 'belum pasti': tampil sebagai belum pasti (bukan sukses); pengguna tanpa izin aksi melihat canAct:false", async () => {
    const w = await world();
    mock.smbMode = "timeout";
    await step(w, S1);
    const v = (await w.sa.get(url(w))).body;
    expect(v.requests[0]).toMatchObject({ syncType: S1, status: "belum_pasti", hasRequestId: false });
    expect(v.requests[0].label).toMatch(/BELUM PASTI/);
    const role = await makeRole("Pelihat", [{ permission: "channel.view", channelIds: [w.channel.id] }]);
    const viewer = await loginFull(await makeUser({ roleIds: [role.id] }));
    const vv = (await viewer.get(url(w))).body;
    expect(vv.canAct).toBe(false);
    expect(vv.checks.smb_app_state_sync.find((c: { key: string }) => c.key === "b")).toMatchObject({ ok: false });
  });
});
