/**
 * Perbaikan Fase 1 — integrasi (PostgreSQL nyata, Meta SIMULASI). P1 = G2-B03 (pemicu inline); P2 = S-10/A-4 (worker); P3 = G2-B04/S-11 (echo `to_user_id`).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { kickProcessing, processInboundBatch, runWorkerLoop, waitForKickIdle } from "@/modules/conversations-messages";
import { normalizePayload, storeEvents } from "@/modules/whatsapp-adapter";
import { ownerQuery, resetDb } from "../helpers/db";
import { BUSINESS_DISPLAY, CUSTOMER, STRANGER, echoChange, envelope, messagesChange, postWebhook, secAgo, textMsg, world } from "../helpers/whatsapp";

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

// ── P3 — G2-B04/S-11: echo dengan `to_user_id` ────────────────────────────────────────────────────────────────────────────────────
const drain = async () => { for (;;) { const r = await processInboundBatch({ limit: 50 }); if (!r.claimed) return; } };
const ingest = async (body: unknown) => { await storeEvents(normalizePayload(body)); await drain(); };
type Obj = Record<string, unknown>;
const echoBody = (id: string, fields: Obj, contacts?: Obj[]) =>
  envelope([echoChange([{ from: BUSINESS_DISPLAY, id, timestamp: secAgo(30), type: "text", text: { body: "dibalas dari HP" }, ...fields }], undefined, contacts)]);
const identitiesOf = async () => (await q("select identity_type t, identity_value v from contact_identities order by 1, 2")).map((r) => `${r.t}:${r.v}`);
/** Pesan masuk dari peserta uji dengan BSUID (membuat kontak dengan wa_id + user_id). */
const inboundWithBsuid = (id: string, from: string, userId: string) =>
  envelope([messagesChange({ messages: [{ ...textMsg(id, from, "halo", secAgo(7200)), user_id: userId }], contacts: [{ profile: { name: "Peserta Uji" }, wa_id: from, user_id: userId }] })]);

describe("@tahap-2 G2-B04/S-11 echo: `to`, `to_user_id`, keduanya, atau tidak ada — dikarantina hanya bila penerima benar-benar tak dapat ditentukan", () => {
  it("`to` saja (perilaku lama tetap): pesan KELUAR bersumber WhatsApp Business App; bukan pesan pelanggan; jendela layanan tidak berubah", async () => {
    await world();
    await ingest(echoBody("wamid.uji.e1", { to: CUSTOMER }));
    expect((await q("select direction, source, type, is_history, unread_eligible from messages"))[0]).toEqual({ direction: "keluar", source: "whatsapp_business_app", type: "text", is_history: false, unread_eligible: false });
    expect(await identitiesOf()).toEqual([`wa_id:${CUSTOMER}`]);
    expect((await q("select last_customer_message_at from conversations"))[0].last_customer_message_at).toBeNull();
  });

  it("`to_user_id` saja, channel di luar mode uji: DICATAT (kontak dengan identitas user_id), tanpa menebak nomor maupun identitas admin pengirim", async () => {
    await world({ testMode: false });
    await ingest(echoBody("wamid.uji.e2", { to_user_id: "BSUID.UJI.E2" }));
    expect(await identitiesOf()).toEqual(["user_id:BSUID.UJI.E2"]);
    const [m] = await q("select direction, source, created_by from messages");
    expect(m).toEqual({ direction: "keluar", source: "whatsapp_business_app", created_by: null }); // admin pengirim TIDAK ditebak
    expect((await q("select last_customer_message_at from conversations"))[0].last_customer_message_at).toBeNull();
    expect(await count("inbound_events", "status = 'quarantined'")).toBe(0);
  });

  it("`to_user_id` saja, mode uji, BSUID TAK dikenal: karantina `pengirim_di_luar_daftar_uji`, payload dibuang, tidak ada kontak/pesan", async () => {
    await world();
    await ingest(echoBody("wamid.uji.e3", { to_user_id: "BSUID.ASING" }));
    expect((await q("select status, quarantine_reason, payload from inbound_events"))[0]).toEqual({ status: "quarantined", quarantine_reason: "pengirim_di_luar_daftar_uji", payload: null });
    expect(await count("contacts")).toBe(0);
    expect(await count("messages")).toBe(0);
  });

  it("`to_user_id` saja, mode uji, BSUID milik kontak yang SUDAH dikenal dan bernomor terdaftar: masuk ke kontak/percakapan yang SAMA (tidak membuat kontak baru)", async () => {
    await world();
    await ingest(inboundWithBsuid("wamid.uji.in4", CUSTOMER, "BSUID.UJI.E4"));
    await ingest(echoBody("wamid.uji.e4", { to_user_id: "BSUID.UJI.E4" }));
    expect(await count("contacts")).toBe(1);
    expect(await count("conversations")).toBe(1);
    expect(await q("select direction, source from messages order by direction")).toEqual([{ direction: "keluar", source: "whatsapp_business_app" }, { direction: "masuk", source: "pelanggan" }]);
  });

  it("keduanya (`to` terdaftar + `to_user_id` baru): satu kontak; BSUID dipelajari sebagai identitas tambahan", async () => {
    await world();
    await ingest(echoBody("wamid.uji.e5", { to: CUSTOMER, to_user_id: "BSUID.UJI.E5" }));
    expect(await count("contacts")).toBe(1);
    expect(await identitiesOf()).toEqual(["user_id:BSUID.UJI.E5", `wa_id:${CUSTOMER}`]);
    expect(await count("messages", "source = 'whatsapp_business_app'")).toBe(1);
  });

  it("keduanya menunjuk dua kontak BERBEDA: karantina `identitas_bentrok` (payload dipertahankan untuk ditinjau); tidak ada penggabungan otomatis, tidak ada pesan", async () => {
    await world({ testMode: false });
    await ingest(inboundWithBsuid("wamid.uji.in6a", CUSTOMER, "BSUID.UJI.A6"));
    await ingest(inboundWithBsuid("wamid.uji.in6b", STRANGER, "BSUID.UJI.B6"));
    expect(await count("contacts")).toBe(2);
    await ingest(echoBody("wamid.uji.e6", { to: CUSTOMER, to_user_id: "BSUID.UJI.B6" })); // nomor milik A, BSUID milik B
    expect((await q("select status, quarantine_reason, payload is not null as ada from inbound_events where event_key = 'echo:wamid.uji.e6'"))[0]).toEqual({ status: "quarantined", quarantine_reason: "identitas_bentrok", ada: true });
    expect(await count("contacts")).toBe(2);
    expect(await count("messages", "source = 'whatsapp_business_app'")).toBe(0);
  });

  it("tidak ada `to` maupun `to_user_id` (contacts[] sendirian bukan bukti): karantina `echo_tanpa_penerima`, payload dibuang, tidak ada kontak", async () => {
    await world({ testMode: false });
    await ingest(echoBody("wamid.uji.e7", {}, [{ wa_id: CUSTOMER, user_id: "BSUID.UJI.E7" }]));
    expect((await q("select status, quarantine_reason, payload from inbound_events"))[0]).toEqual({ status: "quarantined", quarantine_reason: "echo_tanpa_penerima", payload: null });
    expect(await count("contacts")).toBe(0);
  });

  it("contacts[] TERBUKTI (user_id sama) melengkapi nomor penerima sehingga lolos daftar uji; yang BERTENTANGAN diabaikan (tanpa fallback ke entri pertama)", async () => {
    await world();
    await ingest(echoBody("wamid.uji.e8", { to_user_id: "BSUID.UJI.E8" }, [{ wa_id: CUSTOMER, user_id: "BSUID.UJI.E8", profile: { username: "peserta.uji" } }]));
    expect(await identitiesOf()).toEqual(["user_id:BSUID.UJI.E8", `wa_id:${CUSTOMER}`]);
    expect(await count("messages", "source = 'whatsapp_business_app'")).toBe(1);
    await ingest(echoBody("wamid.uji.e8b", { to_user_id: "BSUID.UJI.E8B" }, [{ wa_id: CUSTOMER, user_id: "BSUID.LAIN" }])); // entri bertentangan → tidak dipakai
    expect((await q("select status, quarantine_reason from inbound_events where event_key = 'echo:wamid.uji.e8b'"))[0]).toEqual({ status: "quarantined", quarantine_reason: "pengirim_di_luar_daftar_uji" });
    expect(await count("messages", "source = 'whatsapp_business_app'")).toBe(1);
  });

  it("ingest memvalidasi ULANG contacts[] pada event di antrean (pertahanan berlapis): entri yang tidak terbukti milik penerima tidak dipakai walau tersimpan di payload", async () => {
    await world();
    const evs = normalizePayload(echoBody("wamid.uji.e10", { to_user_id: "BSUID.UJI.E10" }));
    for (const e of evs) if (e.kind === "echo") e.contact = { waId: CUSTOMER, userId: "BSUID.LAIN", name: null }; // disuntikkan: bertentangan dengan to_user_id
    await storeEvents(evs);
    await drain();
    expect((await q("select status, quarantine_reason from inbound_events where event_key = 'echo:wamid.uji.e10'"))[0]).toEqual({ status: "quarantined", quarantine_reason: "pengirim_di_luar_daftar_uji" });
    expect(await count("contacts")).toBe(0);
  });

  it("event echo LAMA di antrean (dinormalisasi sebelum perbaikan: tanpa toUserId/contact) tetap diproses; duplikat tidak menggandakan", async () => {
    await world();
    const evs = normalizePayload(echoBody("wamid.uji.e9", { to: CUSTOMER }));
    for (const e of evs) { delete (e as { toUserId?: unknown }).toUserId; delete (e as { contact?: unknown }).contact; }
    await storeEvents(evs); await storeEvents(evs);
    await drain();
    expect(await count("messages", "source = 'whatsapp_business_app'")).toBe(1);
  });
});
