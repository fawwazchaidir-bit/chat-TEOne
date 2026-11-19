import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getDb, pgErrorCode } from "@/db/client";
import { channels } from "@/db/schema";
import { installClock, removeClock } from "../helpers/clock";
import { ownerQuery, resetDb } from "../helpers/db";
import { loginFull, makeChannel, makeRole, makeSuperAdminSession, makeUser } from "../helpers/fixtures";
import { seedSample } from "../../scripts/seed-sample";

beforeAll(installClock);
afterAll(async () => { removeClock(); await closeDb(); });
beforeEach(resetDb);

const body = (n: string | number) => ({ name: `Channel ${n}`, functionLabel: "Uji", integrationKind: "cloud_api_only" as const });
const activeCount = async () => (await ownerQuery("select count(*)::int n from channels where archived_at is null")).rows[0].n as number;

describe("@tahap-1 channel: data contoh & field", () => {
  it("seed contoh menghasilkan 3 channel bertanda CONTOH, tidak operasional, berstatus 'Belum dikonfigurasi'", async () => {
    await seedSample();
    await seedSample(); // idempoten
    const sa = await makeSuperAdminSession();
    const r = await sa.client.get("/api/v1/channels");
    expect(r.status).toBe(200);
    const items = r.body.items as { name: string; description: string; isSample: boolean; isOperational: boolean; status: string }[];
    expect(items.map((c) => c.name).sort()).toEqual(["Admisi — contoh", "Hotline — contoh", "Kemitraan — contoh"]);
    for (const c of items) {
      expect(c.description).toContain("CONTOH");
      expect(c.isSample).toBe(true);
      expect(c.isOperational).toBe(false);
      expect(c.status).toBe("belum_dikonfigurasi");
    }
  });

  it("seed contoh DITOLAK di production", async () => {
    const prev = process.env.APP_ENV;
    const { resetEnvCacheForTests } = await import("@/lib/env");
    process.env.APP_ENV = "production";
    resetEnvCacheForTests();
    try {
      await expect(seedSample()).rejects.toThrow(/production/);
    } finally {
      process.env.APP_ENV = prev;
      resetEnvCacheForTests();
    }
  });

  it("field lengkap tercatat: fungsi, keterangan, jenis integrasi, lingkungan, status, pembuat/pengubah", async () => {
    const sa = await makeSuperAdminSession();
    const r = await sa.client.post("/api/v1/channels", { name: "Finance", functionLabel: "Finance", description: "Uji", integrationKind: "cloud_api_coexistence" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: "Finance", functionLabel: "Finance", description: "Uji", integrationKind: "cloud_api_coexistence", environment: "development", status: "belum_dikonfigurasi", isOperational: false, createdBy: sa.user.id, updatedBy: sa.user.id });
    expect(r.body.createdAt).toBeTruthy();
  });

  it("jenis integrasi di luar dua nilai yang sah → 400", async () => {
    const sa = await makeSuperAdminSession();
    expect((await sa.client.post("/api/v1/channels", { ...body(1), integrationKind: "waha" })).status).toBe(400);
  });
});

describe("@tahap-1 channel: status jujur (tidak pernah 'terhubung')", () => {
  it("API tidak menerima perubahan status; DB menolak nilai 'terhubung' (CHECK)", async () => {
    const sa = await makeSuperAdminSession();
    const c = (await sa.client.post("/api/v1/channels", body(1))).body;
    const p = await sa.client.patch(`/api/v1/channels/${c.id}`, { status: "terhubung", name: "Channel 1b" });
    expect(p.status).toBe(200);
    expect(p.body.status).toBe("belum_dikonfigurasi");
    for (const bad of ["terhubung", "connected", "aktif", "verified"]) {
      const e = await getDb().execute(sql`update channels set status = ${bad} where id = ${c.id}`).catch((x) => x);
      expect(pgErrorCode(e), bad).toBe("23514");
    }
    expect((await ownerQuery("select status from channels where id=$1", [c.id])).rows[0].status).toBe("belum_dikonfigurasi");
  });
});

describe("@tahap-1 channel: batas aktif sesuai pengaturan organisasi", () => {
  it("channel ke-(batas+1) ditolak dengan 409; batas dapat diubah Super Admin", async () => {
    const sa = await makeSuperAdminSession();
    for (let i = 1; i <= 5; i++) expect((await sa.client.post("/api/v1/channels", body(i))).status).toBe(201);
    const over = await sa.client.post("/api/v1/channels", body(6));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("CHANNEL_LIMIT");
    expect(await activeCount()).toBe(5);

    expect((await sa.client.patch("/api/v1/org-settings", { maxChannels: 6 })).status).toBe(200);
    expect((await sa.client.post("/api/v1/channels", body(6))).status).toBe(201);
    expect((await sa.client.post("/api/v1/channels", body(7))).body.error.code).toBe("CHANNEL_LIMIT");
  });

  it("menurunkan batas di bawah jumlah channel aktif ditolak", async () => {
    const sa = await makeSuperAdminSession();
    for (let i = 1; i <= 4; i++) await sa.client.post("/api/v1/channels", body(i));
    const r = await sa.client.patch("/api/v1/org-settings", { maxChannels: 3 });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("LIMIT_BELOW_ACTIVE");
    expect((await sa.client.patch("/api/v1/org-settings", { maxChannels: 4 })).status).toBe(200);
  });

  it("pengaturan organisasi hanya untuk Super Admin; zona waktu divalidasi", async () => {
    const sa = await makeSuperAdminSession();
    const r = await makeRole("Pengelola", [{ permission: "channel.manage", scopeAll: true }, { permission: "channel.view", scopeAll: true }]);
    const mgr = await loginFull(await makeUser({ roleIds: [r.id] }));
    expect((await mgr.patch("/api/v1/org-settings", { maxChannels: 50 })).status).toBe(403);
    expect((await mgr.get("/api/v1/org-settings")).status).toBe(200);
    expect((await sa.client.patch("/api/v1/org-settings", { timezone: "Bukan/Zona" })).status).toBe(400);
    expect((await sa.client.patch("/api/v1/org-settings", { timezone: "Asia/Makassar" })).body.timezone).toBe("Asia/Makassar");
  });

  it("CCP 1.6: 24 permintaan paralel lewat API tidak pernah melewati batas (tepat 5 berhasil)", async () => {
    const sa = await makeSuperAdminSession();
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => sa.client.post("/api/v1/channels", body(`P${i}`))));
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(5);
    expect(rejected).toHaveLength(19);
    expect(rejected.every((r) => r.body.error.code === "CHANNEL_LIMIT")).toBe(true);
    expect(await activeCount()).toBe(5);
  });

  it("CCP 1.6: 30 INSERT paralel langsung ke database (melewati aplikasi) juga tidak melewati batas", async () => {
    await makeChannel("Awal 1");
    await makeChannel("Awal 2");
    const res = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => makeChannel(`Langsung ${i}`)));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(3); // 5 - 2 sudah ada
    const codes = res.filter((r) => r.status === "rejected").map((r) => pgErrorCode((r as PromiseRejectedResult).reason));
    expect(codes.every((c) => c === "TE001")).toBe(true);
    expect(await activeCount()).toBe(5);
  });

  it("CCP 1.6: pemulihan (unarchive) paralel pada 1 slot kosong → tepat satu berhasil", async () => {
    const sa = await makeSuperAdminSession();
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) ids.push((await sa.client.post("/api/v1/channels", body(i))).body.id);
    for (const id of ids.slice(0, 3)) expect((await sa.client.post(`/api/v1/channels/${id}/archive`)).status).toBe(200); // 2 aktif, 3 arsip
    await sa.client.post("/api/v1/channels", body("Baru A"));
    await sa.client.post("/api/v1/channels", body("Baru B")); // 4 aktif → 1 slot kosong
    const results = await Promise.all(ids.slice(0, 3).map((id) => sa.client.post(`/api/v1/channels/${id}/unarchive`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await activeCount()).toBe(5);
  });
});

describe("@tahap-1 channel: arsip & penggunaan ulang slot", () => {
  it("arsip membebaskan slot segera; jejak audit tetap; pemulihan perlu slot kosong", async () => {
    const sa = await makeSuperAdminSession();
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) ids.push((await sa.client.post("/api/v1/channels", body(i))).body.id);
    expect((await sa.client.post("/api/v1/channels", body(6))).status).toBe(409);

    const arch = await sa.client.post(`/api/v1/channels/${ids[0]}/archive`);
    expect(arch.status).toBe(200);
    expect(arch.body.archivedAt).toBeTruthy();
    expect((await sa.client.post("/api/v1/channels", body(6))).status).toBe(201); // slot terpakai ulang
    // slot penuh lagi → tidak bisa memulihkan
    const back = await sa.client.post(`/api/v1/channels/${ids[0]}/unarchive`);
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe("CHANNEL_LIMIT");

    // jejak audit tetap ada untuk channel yang diarsipkan
    const audit = await sa.client.get("/api/v1/audit?action=channel.");
    const mine = (audit.body.items as { action: string; objectId: string }[]).filter((a) => a.objectId === ids[0]).map((a) => a.action);
    expect(mine).toEqual(expect.arrayContaining(["channel.created", "channel.archived"]));
    // daftar default menyembunyikan arsip; includeArchived menampilkannya
    expect((await sa.client.get("/api/v1/channels")).body.items.some((c: { id: string }) => c.id === ids[0])).toBe(false);
    expect((await sa.client.get("/api/v1/channels?includeArchived=true")).body.items.some((c: { id: string }) => c.id === ids[0])).toBe(true);
    // channel terarsip tidak dapat diubah
    expect((await sa.client.patch(`/api/v1/channels/${ids[0]}`, { name: "x1" })).status).toBe(400);
  });

  it("nama aktif unik (tak peka huruf besar); nama channel terarsip dapat dipakai lagi", async () => {
    const sa = await makeSuperAdminSession();
    const a = (await sa.client.post("/api/v1/channels", { ...body(1), name: "Kemitraan" })).body;
    const dup = await sa.client.post("/api/v1/channels", { ...body(2), name: "KEMITRAAN" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CHANNEL_NAME_TAKEN");
    await sa.client.post(`/api/v1/channels/${a.id}/archive`);
    expect((await sa.client.post("/api/v1/channels", { ...body(3), name: "Kemitraan" })).status).toBe(201);
    expect((await sa.client.post(`/api/v1/channels/${a.id}/unarchive`)).body.error.code).toBe("CHANNEL_NAME_TAKEN");
  });
});

describe("@tahap-1 channel: penanda operasional", () => {
  it("hanya Super Admin; dan tidak sah di lingkungan non-production (CHECK database)", async () => {
    const sa = await makeSuperAdminSession();
    const r = await makeRole("Pengelola", [{ permission: "channel.manage", scopeAll: true }, { permission: "channel.view", scopeAll: true }]);
    const mgr = await loginFull(await makeUser({ roleIds: [r.id] }));
    expect((await mgr.post("/api/v1/channels", { ...body(1), isOperational: true })).status).toBe(403); // guard-operational:allow — uji penolakan
    const viaSa = await sa.client.post("/api/v1/channels", { ...body(2), isOperational: true }); // guard-operational:allow — uji penolakan
    expect(viaSa.status).toBe(400);
    expect(viaSa.body.error.code).toBe("CONSTRAINT_VIOLATION");
    const direct = await getDb().insert(channels).values({ name: "Op", functionLabel: "Op", integrationKind: "cloud_api_only", environment: "development", isOperational: true }).catch((x) => x); // guard-operational:allow — uji penolakan
    expect(pgErrorCode(direct)).toBe("23514");
    const sample = await getDb().insert(channels).values({ name: "Op2", functionLabel: "Op", integrationKind: "cloud_api_only", environment: "production", isSample: true, isOperational: true }).catch((x) => x); // guard-operational:allow — uji penolakan
    expect(pgErrorCode(sample)).toBe("23514");
  });
});
