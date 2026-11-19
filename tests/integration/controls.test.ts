import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { FEATURE_FLAGS, isFeatureEnabled, requireFeature } from "@/modules/feature-flags";
import { checkAutomation, guardedAutomation } from "@/modules/kill-switch";
import { runMigrations } from "../../scripts/migrate";
import { installClock, removeClock } from "../helpers/clock";
import { ownerQuery, resetDb } from "../helpers/db";
import { loginFull, makeChannel, makeRole, makeSuperAdminSession, makeUser } from "../helpers/fixtures";
import { TEST_OWNER_URL } from "../test-env";

beforeAll(installClock);
afterAll(async () => { removeClock(); await closeDb(); });
beforeEach(resetDb);

describe("@tahap-1 feature flag: default mati per lingkungan", () => {
  it("semua flag default MATI; kunci tak dikenal dianggap mati", async () => {
    for (const f of FEATURE_FLAGS) expect(await isFeatureEnabled(f.key), f.key).toBe(false);
    expect(await isFeatureEnabled("tidak_ada")).toBe(false);
  });

  it("flag mati → fitur tidak aktif (requireFeature menolak 404 FEATURE_DISABLED); flag menyala → aktif; dimatikan lagi → tidak aktif", async () => {
    const sa = await makeSuperAdminSession();
    await expect(requireFeature("sample_feature")).rejects.toMatchObject({ status: 404, code: "FEATURE_DISABLED" });
    expect((await sa.client.put("/api/v1/feature-flags", { key: "sample_feature", enabled: true })).status).toBe(200);
    await expect(requireFeature("sample_feature")).resolves.toBeUndefined();
    expect((await sa.client.put("/api/v1/feature-flags", { key: "sample_feature", enabled: false })).status).toBe(200);
    await expect(requireFeature("sample_feature")).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("hanya Super Admin yang dapat mengubah/melihat flag; kunci tak dikenal ditolak", async () => {
    const sa = await makeSuperAdminSession();
    const r = await makeRole("Pengelola", [{ permission: "user.manage", scopeAll: true }, { permission: "role.manage", scopeAll: true }]);
    const mgr = await loginFull(await makeUser({ roleIds: [r.id] }));
    expect((await mgr.put("/api/v1/feature-flags", { key: "inbox", enabled: true })).status).toBe(403);
    expect((await mgr.get("/api/v1/feature-flags")).status).toBe(403);
    expect((await sa.client.put("/api/v1/feature-flags", { key: "bukan_flag", enabled: true })).status).toBe(400);
    expect((await sa.client.get("/api/v1/feature-flags")).body.items.every((f: { enabled: boolean }) => f.enabled === false)).toBe(true);
  });

  it("fail-closed: jika tabel flag tidak terbaca, hasilnya MATI", async () => {
    await ownerQuery("insert into feature_flag_overrides(key, enabled) values('inbox', true)");
    expect(await isFeatureEnabled("inbox")).toBe(true);
    await ownerQuery("revoke select on feature_flag_overrides from teone_app");
    try {
      expect(await isFeatureEnabled("inbox")).toBe(false);
    } finally {
      await ownerQuery("grant select on feature_flag_overrides to teone_app");
    }
  });
});

describe("@tahap-1 kill switch: per chat, channel, fitur, dan global", () => {
  const put = (c: Awaited<ReturnType<typeof makeSuperAdminSession>>["client"], scope: object, engaged: boolean, reason = "uji") =>
    c.put("/api/v1/kill-switch", { scope, engaged, reason });

  it("tanpa kill switch menyala → tidak diblokir; contoh otomatisasi berjalan", async () => {
    const ch = await makeChannel("Ch");
    expect(await checkAutomation({ channelId: ch.id, feature: "sample_automation", chatId: "chat-1" })).toEqual({ blocked: false });
    const r = await guardedAutomation({ channelId: ch.id, feature: "sample_automation" }, async () => "terkirim");
    expect(r).toEqual({ executed: true, result: "terkirim" });
  });

  it("GLOBAL menghentikan semua target", async () => {
    const sa = await makeSuperAdminSession();
    const ch = await makeChannel("Ch");
    expect((await put(sa.client, { type: "global" }, true)).status).toBe(200);
    for (const t of [{}, { channelId: ch.id }, { feature: "follow_up" }, { chatId: "x" }, { channelId: ch.id, feature: "ai_reply", chatId: "y" }]) {
      expect(await checkAutomation(t), JSON.stringify(t)).toEqual({ blocked: true, by: "global" });
    }
    let ran = false;
    const r = await guardedAutomation({ feature: "sample_automation" }, async () => { ran = true; });
    expect(r).toEqual({ executed: false, blockedBy: "global" });
    expect(ran).toBe(false);
  });

  it("per CHANNEL hanya menghentikan channel itu", async () => {
    const sa = await makeSuperAdminSession();
    const a = await makeChannel("A");
    const b = await makeChannel("B");
    await put(sa.client, { type: "channel", ref: a.id }, true);
    expect(await checkAutomation({ channelId: a.id })).toEqual({ blocked: true, by: `channel:${a.id}` });
    expect(await checkAutomation({ channelId: b.id })).toEqual({ blocked: false });
    expect(await checkAutomation({})).toEqual({ blocked: false });
  });

  it("per FITUR hanya menghentikan fitur itu; fitur tak dikenal ditolak", async () => {
    const sa = await makeSuperAdminSession();
    await put(sa.client, { type: "feature", ref: "ai_reply" }, true);
    expect((await checkAutomation({ feature: "ai_reply" })).blocked).toBe(true);
    expect((await checkAutomation({ feature: "follow_up" })).blocked).toBe(false);
    expect((await put(sa.client, { type: "feature", ref: "fitur_palsu" }, true)).status).toBe(400);
  });

  it("per CHAT hanya menghentikan chat itu", async () => {
    const sa = await makeSuperAdminSession();
    await put(sa.client, { type: "chat", ref: "chat-123" }, true);
    expect((await checkAutomation({ chatId: "chat-123" })).blocked).toBe(true);
    expect((await checkAutomation({ chatId: "chat-456" })).blocked).toBe(false);
  });

  it("alasan wajib saat mengaktifkan; pelepasan hanya oleh tindakan manusia berizin dan tercatat", async () => {
    const sa = await makeSuperAdminSession();
    expect((await put(sa.client, { type: "global" }, true, "  ")).status).toBe(400);
    await put(sa.client, { type: "global" }, true, "insiden uji");
    expect((await checkAutomation({})).blocked).toBe(true);
    expect((await put(sa.client, { type: "global" }, false)).status).toBe(200);
    expect((await checkAutomation({})).blocked).toBe(false);
    const audit = (await ownerQuery("select action, metadata from audit_log where action like 'kill_switch.%' order by id desc limit 2")).rows;
    expect(audit.map((a) => a.action)).toEqual(["kill_switch.released", "kill_switch.engaged"]);
  });

  it("Berlaku < 1 menit: antara aktivasi dan pemeriksaan berikutnya tidak ada cache/penundaan", async () => {
    const sa = await makeSuperAdminSession();
    const t0 = Date.now();
    await put(sa.client, { type: "global" }, true);
    const real0 = performance.now();
    expect((await checkAutomation({ feature: "sample_automation" })).blocked).toBe(true);
    expect(performance.now() - real0).toBeLessThan(1000);
    expect(Date.now() - t0).toBeLessThan(60_000);
  });

  it("TIDAK menyala kembali sendiri: tetap aktif setelah migrasi ulang (simulasi restart) dan pembersihan sesi", async () => {
    const sa = await makeSuperAdminSession();
    await put(sa.client, { type: "global" }, true, "uji");
    await runMigrations(TEST_OWNER_URL, { quiet: true }); // idempoten, seperti deploy ulang
    await ownerQuery("delete from sessions where expires_at < now()");
    expect((await checkAutomation({})).blocked).toBe(true);
    const row = (await ownerQuery("select engaged, released_at from kill_switches")).rows[0];
    expect(row.engaged).toBe(true);
    expect(row.released_at).toBeNull();
  });

  it("fail-closed: jika status kill switch tidak terbaca → otomatisasi DIBLOKIR", async () => {
    await ownerQuery("revoke select on kill_switches from teone_app");
    try {
      expect(await checkAutomation({ feature: "sample_automation" })).toEqual({ blocked: true, by: "pemeriksaan_gagal" });
      let ran = false;
      expect((await guardedAutomation({}, async () => { ran = true; })).executed).toBe(false);
      expect(ran).toBe(false);
    } finally {
      await ownerQuery("grant select on kill_switches to teone_app");
    }
  });

  it("hanya pemegang killswitch.manage (hanya dapat diberikan Super Admin)", async () => {
    const r = await makeRole("Pengelola", [{ permission: "user.manage", scopeAll: true }, { permission: "role.manage", scopeAll: true }]);
    const mgr = await loginFull(await makeUser({ roleIds: [r.id] }));
    expect((await mgr.get("/api/v1/kill-switch")).status).toBe(403);
    expect((await mgr.put("/api/v1/kill-switch", { scope: { type: "global" }, engaged: true, reason: "x" })).status).toBe(403);
    expect((await checkAutomation({})).blocked).toBe(false);
  });
});
