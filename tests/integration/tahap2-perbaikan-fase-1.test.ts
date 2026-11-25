/**
 * Perbaikan Fase 1 — integrasi (PostgreSQL nyata, Meta SIMULASI). P1 = G2-B03 (pemicu inline).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { kickProcessing, runWorkerLoop, waitForKickIdle } from "@/modules/conversations-messages";
import { normalizePayload, storeEvents } from "@/modules/whatsapp-adapter";
import { ownerQuery, resetDb } from "../helpers/db";
import { CUSTOMER, envelope, messagesChange, postWebhook, secAgo, textMsg, world } from "../helpers/whatsapp";

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const count = async (table: string, where = "true") => (await q(`select count(*)::int n from ${table} where ${where}`))[0].n as number;

let prevInline: string | undefined;
beforeAll(() => { prevInline = process.env.WORKER_INLINE; process.env.WORKER_INLINE = "true"; resetEnvCacheForTests(); });
afterAll(async () => {
  if (prevInline === undefined) delete process.env.WORKER_INLINE; else process.env.WORKER_INLINE = prevInline;
  resetEnvCacheForTests();
  await closeDb();
});
beforeEach(resetDb);

/** Menyimpan event TANPA memicu kick (meniru webhook yang sudah 200 tetapi belum diproses). Pesan lama → tidak layak otomatisasi (lebih cepat). */
async function storeMessages(prefix: string, n: number, from = CUSTOMER) {
  const msgs = Array.from({ length: n }, (_, i) => textMsg(`wamid.uji.${prefix}.${i}`, from, `isi ${prefix} ${i}`, secAgo(7200)));
  for (let i = 0; i < msgs.length; i += 30) await storeEvents(normalizePayload(envelope([messagesChange({ messages: msgs.slice(i, i + 30) })])));
}

describe("@tahap-2 G2-B03 (integrasi) pemrosesan inline tidak menyisakan event pending", () => {
  it("lonjakan 450 event tersimpan → SATU kick memprosesnya semua tanpa menunggu webhook berikutnya (kode lama berhenti di 200)", async () => {
    await world();
    await storeMessages("burst", 450);
    expect(await count("inbound_events", "status = 'pending'")).toBe(450);
    kickProcessing();
    await waitForKickIdle();
    expect(await count("inbound_events", "status = 'pending'")).toBe(0);
    expect(await count("inbound_events", "status = 'processed'")).toBe(450);
    expect(await count("messages")).toBe(450);
  }, 120_000);

  it("event yang disimpan SELAMA kick berjalan tetap diproses tanpa webhook berikutnya", async () => {
    await world();
    await storeMessages("awal", 60);
    kickProcessing(); // putaran berjalan
    await storeMessages("terlambat", 1); // tersimpan sementara putaran berjalan
    kickProcessing(); // kick saat berjalan → harus menandai kerja baru
    await waitForKickIdle();
    expect(await count("inbound_events", "status = 'pending'")).toBe(0);
    expect(await count("messages", "body = 'isi terlambat 0'")).toBe(1);
  }, 60_000);

  it("jalur webhook SEBENARNYA (route → kickProcessing): pesan terproses tanpa pemanggilan pemroses manual", async () => {
    await world();
    const r = await postWebhook(envelope([messagesChange({ messages: [textMsg("wamid.uji.inline.1", CUSTOMER, "lewat route inline", secAgo(7200))] })]));
    expect(r.status).toBe(200);
    await waitForKickIdle();
    expect(await count("inbound_events", "status = 'pending'")).toBe(0);
    expect((await q("select body from messages"))[0].body).toBe("lewat route inline");
  });
});

// ── P2 — S-10/A-4: penjadwal worker (scripts/worker.ts) sebelumnya TIDAK pernah dijalankan oleh tes/E2E/CI ──────────────────────────
const root = path.resolve(import.meta.dirname, "../..");
const seedOldProcessedPayload = () => ownerQuery(
  "insert into inbound_events(event_key, kind, status, payload, received_at, processed_at) values('msg:wamid.uji.lama','message','processed','{\"x\":1}'::jsonb, now() - interval '31 days', now() - interval '31 days')",
);
const runScript = (extraEnv: Record<string, string> = {}) =>
  spawnSync(process.execPath, ["--import", "tsx", "scripts/worker.ts", "--once"], { cwd: root, env: { ...process.env, ...extraEnv }, encoding: "utf8", timeout: 90_000 });

describe("@tahap-2 S-10/A-4 worker terpisah: siklus dijalankan nyata (antrean dikuras + pemeliharaan, lalu keluar bersih)", () => {
  it("runWorkerLoop({ once }): antrean dikuras DAN pemeliharaan berjalan (payload > 30 hari di-NULL-kan, D-18), lalu selesai tanpa galat", async () => {
    await world();
    await storeMessages("siklus", 5);
    await seedOldProcessedPayload();
    const r = await runWorkerLoop({ once: true });
    expect(r).toMatchObject({ claimed: 5, maintenanceRuns: 1, errors: 0 });
    expect(await count("inbound_events", "status = 'pending'")).toBe(0);
    expect(await count("messages")).toBe(5);
    expect((await q("select payload is null as kosong from inbound_events where event_key = 'msg:wamid.uji.lama'"))[0].kosong).toBe(true);
    expect(await count("inbound_events", "event_key like 'msg:wamid.uji.siklus.%' and payload is not null")).toBe(5); // yang baru tidak disentuh
  });

  it("mode loop: pemeliharaan dijadwalkan berkala (tiap interval), berhenti saat shouldStop, dan galat tidak mematikan loop", async () => {
    let t = 0, iter = 0;
    const r = await runWorkerLoop({ maintenanceEveryMs: 1000, now: () => t, shouldStop: () => iter >= 5, sleep: async () => { iter++; t += 600; } });
    expect(r.maintenanceRuns).toBe(3); // t = 0, 1200, 2400
    expect(r.errors).toBe(0);
    expect(iter).toBe(5);
  });

  it("scripts/worker.ts --once sebagai PROSES nyata: kode keluar 0, mencetak mulai/berhenti, antrean terkuras, pemeliharaan berjalan", async () => {
    await world();
    await storeMessages("proses", 3);
    await seedOldProcessedPayload();
    const r = runScript();
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("[worker] mulai (satu siklus)");
    expect(r.stdout).toMatch(/\[worker\] berhenti \(batch=\d+ diklaim=3 pemeliharaan=1 galat=0\)/);
    expect(await count("inbound_events", "status = 'pending'")).toBe(0);
    expect(await count("messages")).toBe(3);
    expect((await q("select payload is null as kosong from inbound_events where event_key = 'msg:wamid.uji.lama'"))[0].kosong).toBe(true);
  }, 120_000);

  it("scripts/worker.ts --once dengan database tak terjangkau: kode keluar ≠ 0 (tidak melaporkan sukses palsu) dan tanpa kata sandi di keluaran", async () => {
    const r = runScript({ DATABASE_URL: "postgres://pengguna_uji:sandi-rahasia-uji@127.0.0.1:1/tidak_ada" });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/\[worker\] (batch|pemeliharaan) gagal/);
    expect(r.stdout + r.stderr).not.toContain("sandi-rahasia-uji");
  }, 120_000);
});
