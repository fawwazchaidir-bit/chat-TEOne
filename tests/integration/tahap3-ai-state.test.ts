/**
 * Tahap 3 — Status AI per percakapan, pengambilalihan, kelayakan pesan, benturan AI–admin, echo HP (D-05), kerja bersama.
 * SELURUH job otomatisasi di sini adalah SIMULASI (tidak ada AI nyata; Tahap 4). Hasil: "terbukti simulasi" (mock Graph).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { processInboundBatch, resetAccessCacheForTests, runMaintenance } from "@/modules/conversations-messages";
import { SIM_TEXT, runAutomationJob, runDueAutomationJobs } from "@/modules/automation";
import { MockGraph } from "../helpers/mock-graph";
import { ownerQuery, resetDb } from "../helpers/db";
import { addUserGrant, setRoles } from "../helpers/fixtures";
import { CUSTOMER2, PHONE_ADM, PHONE_HOT, convId, drain, enableFlag, inbound, inboxWorld, reply } from "../helpers/inbox";
import { BUSINESS_DISPLAY, CUSTOMER, WABA, echoChange, envelope, historyChange, messagesChange, postWebhook, secAgo, textMsg } from "../helpers/whatsapp";

const mock = new MockGraph();
let prevBase: string | undefined;
const setDelay = (ms: number) => { process.env.AI_SIM_DELAY_MS = String(ms); resetEnvCacheForTests(); };
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; delete process.env.AI_SIM_DELAY_MS; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); resetAccessCacheForTests(); setDelay(0); });
afterEach(() => setDelay(0));

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Pengiriman milik AI SIMULASI (dibedakan dari balasan admin lewat teks simulasi yang tetap). */
const aiSends = () => mock.sends().filter((s) => (s.json as { text?: { body?: string } } | undefined)?.text?.body === SIM_TEXT);
const aiState = async (conv: string) => (await q("select ai_status, ai_off_reason, ai_version, review_flag from conversations where id = $1", [conv]))[0];
const ai = (c: { post: (p: string, b?: unknown) => Promise<{ status: number; body: any }> }, conv: string, action: string, expectedVersion?: number) => // eslint-disable-line @typescript-eslint/no-explicit-any
  c.post(`/api/v1/conversations/${conv}/ai`, { action, ...(expectedVersion === undefined ? {} : { expectedVersion }) });

describe("@tahap-3 CCP 3.3 status AI: default, pengambilalihan, manual, versi, audit", () => {
  it("AI simulasi menjawab pesan pelanggan baru HANYA bila flag menyala dan AI Aktif; balasan AI tidak mengubah status; UI jujur 'agent belum terhubung'", async () => {
    const w = await inboxWorld({ simulation: true });
    await inbound({ text: "halo, tanya pelatihan" });
    expect(aiSends()).toHaveLength(1);
    expect(aiSends()[0]!.json).toMatchObject({ to: CUSTOMER });
    const conv = await convId(w.chA.id);
    expect((await q("select source, direction, status from messages where direction = 'keluar'"))).toEqual([{ source: "ai", direction: "keluar", status: "diterima_api" }]);
    expect((await q("select kind, status from automation_jobs"))).toEqual([{ kind: "ai_sim", status: "selesai" }]);
    expect(await aiState(conv)).toMatchObject({ ai_status: "aktif", ai_version: 0 });
    const a = await w.login(w.adminA);
    const d = (await a.get(`/api/v1/conversations/${conv}`)).body;
    expect(d.ai).toMatchObject({ status: "aktif", connected: false, label: "AI disiapkan — agent belum terhubung" }); // tidak mengaku AI nyata
    // flag dimatikan → tak ada job baru
    await enableFlag("ai_simulation", false);
    await inbound({ from: CUSTOMER2, text: "halo juga" });
    expect(aiSends()).toHaveLength(1);
    expect((await q("select count(*)::int n from automation_jobs"))[0].n).toBe(1);
  });

  it("pengambilalihan TANPA membalas → AI Off (versi+1, aktor, alasan); idempoten; matikan manual; aktifkan kembali manual; tiap perubahan teraudit", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    const t = await ai(a, conv, "ambil_alih", 0);
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({ changed: true, ai: { status: "off", reason: "admin_mengambil_alih", version: 1 } });
    // idempoten: tidak menaikkan versi dan tidak menimpa alasan pertama
    const again = await ai(a, conv, "matikan");
    expect(again.body).toMatchObject({ changed: false, ai: { status: "off", reason: "admin_mengambil_alih", version: 1 } });
    // aktifkan kembali: manual, mencatat BATAS
    const on = await ai(a, conv, "aktifkan", 1);
    expect(on.body.ai).toMatchObject({ status: "aktif", reason: null, version: 2 });
    expect(on.body.ai.boundaryAt).toBeTruthy();
    // matikan manual → alasan "manual"
    expect((await ai(a, conv, "matikan", 2)).body.ai).toMatchObject({ status: "off", reason: "manual", version: 3 });
    // eskalasi
    await ai(a, conv, "aktifkan");
    const esc = await ai(a, conv, "eskalasi");
    expect(esc.body.ai).toMatchObject({ status: "off", reason: "eskalasi" });
    expect((await q("select escalated_at is not null as e from conversations where id = $1", [conv]))[0].e).toBe(true);
    const ev = await q("select from_status, to_status, reason, version, actor_id from conversation_ai_events where conversation_id = $1 order by id", [conv]);
    expect(ev.map((e) => `${e.from_status}>${e.to_status}:${e.reason ?? "-"}:v${e.version}`)).toEqual(["aktif>off:admin_mengambil_alih:v1", "off>aktif:-:v2", "aktif>off:manual:v3", "off>aktif:-:v4", "aktif>off:eskalasi:v5"]);
    expect(ev.every((e) => e.actor_id === w.adminA.id)).toBe(true);
    const au = await q("select metadata from audit_log where action = 'conversation.ai_changed' and object_id = $1 order by id", [conv]);
    expect(au).toHaveLength(5);
    expect(au[0]!.metadata).toMatchObject({ from: "aktif", to: "off", reason: "admin_mengambil_alih", version: 1 });
    // riwayat di panel
    expect((await a.get(`/api/v1/conversations/${conv}`)).body.aiEvents).toHaveLength(5);
    // event AI append-only di database
    expect((await ownerQuery("update conversation_ai_events set reason = 'x'").catch((e) => e)).code).toBeTruthy();
    expect((await ownerQuery("delete from conversation_ai_events").catch((e) => e)).code).toBeTruthy();
  });

  it("izin ubah AI (ai.toggle) per channel; benturan dua admin → 409 AI_VERSION_CONFLICT + teraudit; tidak ada perubahan diam-diam", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    expect((await ai(await w.login(w.viewer), conv, "ambil_alih")).status).toBe(403);
    expect((await ai(await w.login(w.adminB), conv, "ambil_alih")).status).toBe(404);
    expect(await aiState(conv)).toMatchObject({ ai_status: "aktif", ai_version: 0 });
    const [a1, a2] = [await w.login(w.adminA), await w.login(w.adminA2)];
    const res = await Promise.all([ai(a1, conv, "ambil_alih", 0), ai(a2, conv, "matikan", 0)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(res.find((r) => r.status === 409)!.body.error.code).toBe("AI_VERSION_CONFLICT");
    expect((await aiState(conv)).ai_version).toBe(1);
    expect(await q("select 1 from audit_log where action = 'conversation.ai_conflict' and object_id = $1", [conv])).toHaveLength(1);
    // versi basi setelahnya juga ditolak, status tidak berubah
    expect((await ai(a2, conv, "aktifkan", 0)).status).toBe(409);
    expect((await aiState(conv)).ai_status).toBe("off");
  });

  it("AI TIDAK PERNAH menyala kembali sendiri: pesan baru, pemeliharaan, kill switch dilepas — status tetap Off dan tak ada balasan AI", async () => {
    const w = await inboxWorld({ simulation: true });
    await inbound({ text: "satu" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    await ai(a, conv, "ambil_alih");
    expect(aiSends()).toHaveLength(1); // balasan sebelum diambil alih
    await inbound({ text: "dua" });
    await inbound({ text: "tiga" });
    await runMaintenance();
    await runDueAutomationJobs();
    expect(aiSends()).toHaveLength(1); // tak ada balasan AI baru
    expect(await aiState(conv)).toMatchObject({ ai_status: "off", ai_off_reason: "admin_mengambil_alih", ai_version: 1 });
    expect(await q("select 1 from conversation_ai_events where to_status = 'aktif'")).toHaveLength(0);
    // memasang lalu melepas kill switch tidak mengaktifkan AI
    await ownerQuery("insert into kill_switches(scope_type, scope_ref, engaged, reason) values('global','',true,'uji') on conflict (scope_type, scope_ref) do update set engaged = true");
    await ownerQuery("update kill_switches set engaged = false");
    await inbound({ text: "empat" });
    expect(aiSends()).toHaveLength(1);
    expect((await aiState(conv)).ai_status).toBe("off");
  });
});

describe("@tahap-3 CCP 3.3/3.4 aktivasi ulang: batas, pesan lama/terlambat/duplikat/history TIDAK layak; pesan baru layak", () => {
  it("setelah diaktifkan manual: pesan lama, webhook terlambat, duplikat, dan history tidak diproses; pesan baru SETELAH batas diproses", async () => {
    const w = await inboxWorld({ simulation: true });
    await inbound({ text: "m1 sebelum ambil alih", ts: secAgo(40) });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    expect(aiSends()).toHaveLength(1);
    await ai(a, conv, "ambil_alih");
    const m2 = await inbound({ text: "m2 saat AI off", ts: secAgo(30) });
    expect(aiSends()).toHaveLength(1);
    await ai(a, conv, "aktifkan"); // batas dicatat = sekarang
    const boundary = (await q("select ai_boundary_at from conversations where id = $1", [conv]))[0].ai_boundary_at as Date;
    expect(boundary).toBeTruthy();
    // 1) duplikat pesan lama (m2) dikirim ulang oleh Meta → tidak ada efek
    await postWebhook(envelope([messagesChange({ phoneId: PHONE_ADM, messages: [textMsg(m2, CUSTOMER, "m2 saat AI off", secAgo(30))] })], WABA));
    await drain();
    // 2) event TERLAMBAT: pesan baru bagi sistem, tetapi waktunya sebelum batas
    await inbound({ text: "m3 terlambat", ts: secAgo(20) });
    // 3) history tiba setelah aktivasi
    await postWebhook(envelope([historyChange([{ id: CUSTOMER, messages: [{ from: CUSTOMER, id: "wamid.uji.hist1", timestamp: secAgo(86400), type: "text", text: { body: "riwayat" }, history_context: { status: "READ" } }] }], { phase: 0, chunk_order: 1, progress: 10 }, PHONE_ADM)], WABA));
    await drain();
    expect(aiSends()).toHaveLength(1); // belum ada balasan AI baru sama sekali
    expect(await q("select 1 from automation_jobs")).toHaveLength(1); // job m1 saja; tidak ada job baru dibuat
    // 4) pesan BARU setelah batas → layak
    await sleep(1100);
    await inbound({ text: "m4 setelah aktivasi", ts: secAgo(0) });
    expect(aiSends()).toHaveLength(2);
    expect((await q("select status from automation_jobs order by created_at")).map((j) => j.status)).toEqual(["selesai", "selesai"]);
    expect((await q("select count(*)::int n from messages where source = 'ai'"))[0].n).toBe(2);
  });

  it("job simulasi yang BELUM terkirim dibatalkan saat pengambilalihan (versi diperiksa ulang) dan tidak hidup kembali setelah diaktifkan lagi", async () => {
    setDelay(60_000);
    const w = await inboxWorld({ simulation: true });
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    expect((await q("select status from automation_jobs"))[0].status).toBe("menunggu");
    expect(aiSends()).toHaveLength(0);
    const a = await w.login(w.adminA);
    await ai(a, conv, "ambil_alih");
    expect((await q("select status, status_reason from automation_jobs"))[0]).toEqual({ status: "dibatalkan", status_reason: "ai_off" });
    await ai(a, conv, "aktifkan");
    await ownerQuery("update automation_jobs set run_after = now()");
    expect((await runDueAutomationJobs()).ran).toBe(0);
    expect(aiSends()).toHaveLength(0);
    // lapis kedua: seandainya pembatalan massal terlewat (mis. balapan), pemeriksaan ulang TEPAT sebelum kirim menangkapnya
    await sleep(1100);
    await inbound({ text: "pesan baru", ts: secAgo(0) });
    const [job] = await q("select id, ai_version from automation_jobs where status = 'menunggu'");
    expect(job!.ai_version).toBe(2);
    await ownerQuery("update conversations set ai_version = 9 where id = $1", [conv]); // versi berubah TANPA membatalkan job (simulasi celah)
    await ownerQuery("update automation_jobs set run_after = now() where id = $1", [job!.id]);
    expect(await runAutomationJob(job!.id as string)).toMatchObject({ status: "dibatalkan", reason: "versi_berubah" });
    expect(aiSends()).toHaveLength(0);
    await ownerQuery("update conversations set ai_version = 2, ai_status = 'off', ai_off_reason = 'manual' where id = $1", [conv]); // status Off tanpa membatalkan job
    await ownerQuery("update automation_jobs set status = 'menunggu', run_after = now() where id = $1", [job!.id]);
    expect(await runAutomationJob(job!.id as string)).toMatchObject({ status: "dibatalkan", reason: "ai_off" });
    expect(aiSends()).toHaveLength(0);
    expect((await q("select action, result from audit_log where action = 'automation.job_cancelled' and object_id = $1 order by id", [job!.id]))).toHaveLength(2);
  });

  it("titik komit memeriksa ulang KELAYAKAN pesan pemicu (lapis kedua): pesan yang berubah jadi history / tanpa waktu / sebelum batas setelah job dibuat → dibatalkan, 0 balasan", async () => {
    setDelay(60_000);
    const w = await inboxWorld({ simulation: true });
    const ids = [await inbound({ text: "a", ts: secAgo(9) }), await inbound({ text: "b", ts: secAgo(8) }), await inbound({ text: "c", ts: secAgo(7) })];
    const conv = await convId(w.chA.id);
    const jobs = await q("select j.id, m.provider_message_id as wamid from automation_jobs j join messages m on m.id = j.trigger_message_id");
    expect(jobs).toHaveLength(3);
    const jobOf = (wamid: string) => jobs.find((j) => j.wamid === wamid)!.id as string;
    // status AI & versi TIDAK berubah (jadi pemeriksaan status/versi lolos); hanya kelayakan pesan yang berubah
    await ownerQuery("update messages set is_history = true, source = 'history' where provider_message_id = $1", [ids[0]]); // penggolongan ulang menjadi history
    await ownerQuery("update messages set provider_ts = null where provider_message_id = $1", [ids[1]]); // waktu tak lagi terbukti
    await ownerQuery("update conversations set ai_boundary_at = now() + interval '5 seconds' where id = $1", [conv]); // batas jatuh SESUDAH pesan ketiga
    await ownerQuery("update automation_jobs set run_after = now()");
    expect(await runAutomationJob(jobOf(ids[0]!))).toMatchObject({ status: "dibatalkan", reason: "tidak_layak:history" });
    expect(await runAutomationJob(jobOf(ids[1]!))).toMatchObject({ status: "dibatalkan", reason: "tidak_layak:waktu_tidak_terbukti" });
    expect(await runAutomationJob(jobOf(ids[2]!))).toMatchObject({ status: "dibatalkan", reason: "tidak_layak:sebelum_batas" });
    expect(aiSends()).toHaveLength(0);
    expect(await aiState(conv)).toMatchObject({ ai_status: "aktif", ai_version: 0 }); // status tidak berubah oleh pembatalan job
  });

  it("waktu pesan TAK TERBUKTI saat AI Aktif → ditandai 'perlu ditinjau', TIDAK diproses; tinjauan dibersihkan manual (teraudit); pengambilalihan juga membersihkan", async () => {
    const w = await inboxWorld({ simulation: true });
    const r = await postWebhook(envelope([messagesChange({ phoneId: PHONE_ADM, messages: [{ from: CUSTOMER, id: "wamid.uji.tanpawaktu", type: "text", text: { body: "tanpa cap waktu" } }] })], WABA));
    expect(r.status).toBe(200);
    await drain();
    const conv = await convId(w.chA.id);
    expect(aiSends()).toHaveLength(0);
    expect(await q("select 1 from automation_jobs")).toHaveLength(0);
    expect((await aiState(conv)).review_flag).toBe("urutan_tidak_pasti");
    const a = await w.login(w.adminA);
    expect((await a.get("/api/v1/inbox/conversations")).body.items[0].reviewFlag).toBe("urutan_tidak_pasti");
    expect((await a.post(`/api/v1/conversations/${conv}/review`)).status).toBe(200);
    expect((await aiState(conv)).review_flag).toBeNull();
    expect((await q("select 1 from audit_log where action = 'conversation.review_cleared' and object_id = $1", [conv]))).toHaveLength(1);
    // tanda kembali muncul untuk pesan tak terbukti berikutnya, lalu hilang saat AI diambil alih
    await postWebhook(envelope([messagesChange({ phoneId: PHONE_ADM, messages: [{ from: CUSTOMER, id: "wamid.uji.tanpawaktu2", type: "text", text: { body: "lagi" } }] })], WABA));
    await drain();
    expect((await aiState(conv)).review_flag).toBe("urutan_tidak_pasti");
    await ai(a, conv, "ambil_alih");
    expect((await aiState(conv)).review_flag).toBeNull();
    expect((await a.post(`/api/v1/conversations/${conv}/review`).then(() => 0)).valueOf()).toBe(0);
  });
});

describe("@tahap-3 CCP 3.4 benturan AI–admin: job yang sudah dikirim tampil JUJUR; balapan tidak pernah menghasilkan balasan AI setelah pengambilalihan", () => {
  it("job sudah dikirim ke Meta lalu admin mengambil alih: tampil 'sedang dikirim' (diproses), TIDAK dijanjikan dapat dibatalkan; setelah Meta menjawab → hasil nyata; status Off tidak berubah", async () => {
    const w = await inboxWorld({ simulation: true });
    const a = await w.login(w.adminA);
    const release = mock.hold("send");
    await postWebhook(envelope([messagesChange({ phoneId: PHONE_ADM, messages: [textMsg("wamid.uji.balap1", CUSTOMER, "halo", secAgo(3))], contacts: [{ wa_id: CUSTOMER, profile: { name: "Uji" } }] })], WABA));
    const running = processInboundBatch({ limit: 50 }); // ingest → outbox → job → panggilan Meta (tertahan di mock)
    await mock.waitFor(() => mock.calls.some((c) => c.method === "POST" && c.path.endsWith("/messages")));
    const conv = await convId(w.chA.id);
    // job sudah mencatat pesan 'diproses' → komit sudah terjadi
    expect((await q("select status from automation_jobs"))[0].status).toBe("dikirim");
    const take = await ai(a, conv, "ambil_alih");
    expect(take.status).toBe(200); // pengambilalihan TIDAK menunggu/ditolak oleh job yang sedang terbang
    const d = (await a.get(`/api/v1/conversations/${conv}`)).body;
    expect(d.jobs[0]).toMatchObject({ status: "dikirim" });
    const outMsg = (await a.get(`/api/v1/conversations/${conv}/messages`)).body.messages.find((m: { source: string }) => m.source === "ai");
    expect(outMsg).toMatchObject({ direction: "keluar", status: "diproses" }); // UI: "sedang dikirim / belum pasti" — bukan "dibatalkan"
    release();
    await running;
    expect((await q("select status from messages where source = 'ai'"))[0].status).toBe("diterima_api");
    expect((await q("select status from automation_jobs"))[0].status).toBe("selesai");
    expect(await aiState(conv)).toMatchObject({ ai_status: "off", ai_off_reason: "admin_mengambil_alih", ai_version: 1 });
    expect(aiSends()).toHaveLength(1);
  });

  it("hasil Meta tidak pasti pada job AI → status job 'belum_pasti' dan pesan 'belum_pasti' (jujur, tanpa retry buta)", async () => {
    const w = await inboxWorld({ simulation: true });
    mock.sendMode = "noid";
    await inbound({ text: "halo" });
    expect(mock.sends()).toHaveLength(1);
    expect((await q("select status from automation_jobs"))[0].status).toBe("belum_pasti");
    expect((await q("select status from messages where source = 'ai'"))[0].status).toBe("belum_pasti");
    await runDueAutomationJobs();
    await runMaintenance();
    expect(mock.sends()).toHaveLength(1); // tidak ada pengiriman ulang
    const a = await w.login(w.adminA);
    const conv = await convId(w.chA.id);
    expect((await a.get(`/api/v1/conversations/${conv}`)).body.jobs[0].status).toBe("belum_pasti");
  });

  it("BALAPAN (6 putaran): job jatuh tempo vs pengambilalihan serentak → atau (pesan AI tercatat+terkirim) atau (job dibatalkan, 0 pesan AI); tidak pernah keduanya, tidak pernah Meta tanpa catatan", async () => {
    setDelay(60_000);
    const w = await inboxWorld({ simulation: true });
    const a = await w.login(w.adminA);
    await inbound({ text: "pembuka", ts: secAgo(5) });
    const conv = await convId(w.chA.id);
    await q("update automation_jobs set status = 'dibatalkan', status_reason = 'uji_awal'");
    let sent = 0, cancelled = 0;
    for (let i = 0; i < 6; i++) {
      await sleep(1100);
      await inbound({ text: `pesan ${i}`, ts: secAgo(0) });
      const [job] = await q("select id from automation_jobs where status = 'menunggu'");
      expect(job, `putaran ${i}: job menunggu`).toBeTruthy();
      await ownerQuery("update automation_jobs set run_after = now() where id = $1", [job!.id]);
      const before = aiSends().length;
      const [, take] = await Promise.all([runAutomationJob(job!.id as string), ai(a, conv, "ambil_alih")]);
      expect(take.status).toBe(200);
      const j = (await q("select status from automation_jobs where id = $1", [job!.id]))[0].status as string;
      const msgs = (await q("select count(*)::int n from messages where source = 'ai' and idempotency_key = $1", [`job-${job!.id}`]))[0].n as number;
      const calls = aiSends().length - before;
      if (msgs === 1) { expect(["selesai", "dikirim"], `putaran ${i}`).toContain(j); expect(calls).toBe(1); sent++; }
      else { expect(j, `putaran ${i}`).toBe("dibatalkan"); expect(calls).toBe(0); cancelled++; }
      expect((await aiState(conv)).ai_status).toBe("off");
      await ai(a, conv, "aktifkan");
    }
    expect(sent + cancelled).toBe(6);
    expect((await q("select count(*)::int n from messages where source = 'ai'"))[0].n).toBe(aiSends().length); // setiap panggilan Meta punya catatan, dan sebaliknya
  });
});

describe("@tahap-3 echo dari HP (D-05, ASUMSI): pesan keluar BARU → AI Off; lama/duplikat/tanpa waktu tidak membalik status", () => {
  const echo = (id: string, o: { ts?: string | null; to?: string } = {}) =>
    postWebhook(envelope([echoChange([{ from: BUSINESS_DISPLAY, to: o.to ?? CUSTOMER, id, ...(o.ts === null ? {} : { timestamp: o.ts ?? secAgo(2) }), type: "text", text: { body: "dari HP" } }], PHONE_ADM)], WABA)).then(() => drain());

  it("echo baru → AI Off 'balasan dari HP' (aktor sistem, tanpa admin); duplikat tidak mengubah apa pun", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    await echo("wamid.uji.echo1");
    expect(await aiState(conv)).toMatchObject({ ai_status: "off", ai_off_reason: "balasan_dari_hp", ai_version: 1 });
    expect((await q("select source, direction from messages where provider_message_id = 'wamid.uji.echo1'"))[0]).toEqual({ source: "whatsapp_business_app", direction: "keluar" });
    expect((await q("select actor_id, actor_label from conversation_ai_events"))[0]).toMatchObject({ actor_id: null });
    await echo("wamid.uji.echo1"); // duplikat
    expect((await aiState(conv)).ai_version).toBe(1);
    expect(await q("select 1 from conversation_ai_events")).toHaveLength(1);
  });

  it("setelah admin mengaktifkan kembali: echo LAMA (sebelum batas) dan echo TANPA waktu tidak membalik status (teraudit); echo baru setelah batas → Off", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    await ai(a, conv, "ambil_alih");
    await ai(a, conv, "aktifkan"); // v2, batas = sekarang
    await echo("wamid.uji.echoLama", { ts: secAgo(120) });
    await echo("wamid.uji.echoTanpaWaktu", { ts: null });
    expect(await aiState(conv)).toMatchObject({ ai_status: "aktif", ai_version: 2 });
    expect((await q("select metadata from audit_log where action = 'conversation.echo_ai_ignored' and object_id = $1 order by id", [conv])).map((r) => r.metadata.reason)).toEqual(["sebelum_batas", "waktu_tidak_terbukti"]);
    await sleep(1100);
    await echo("wamid.uji.echoBaru", { ts: secAgo(0) });
    expect(await aiState(conv)).toMatchObject({ ai_status: "off", ai_off_reason: "balasan_dari_hp", ai_version: 3 });
  });

  it("echo TIDAK membuka/memperpanjang jendela layanan dan TIDAK menambah belum dibaca (kontrak inti #3 & §7)", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo", ts: secAgo(100) });
    const conv = await convId(w.chA.id);
    const before = (await q("select last_customer_message_at from conversations where id = $1", [conv]))[0].last_customer_message_at;
    await echo("wamid.uji.echoJendela", { ts: secAgo(1) });
    expect((await q("select last_customer_message_at from conversations where id = $1", [conv]))[0].last_customer_message_at).toEqual(before);
    const a = await w.login(w.adminA);
    expect((await a.get("/api/v1/inbox/conversations")).body.items[0].unread).toBe(1);
  });
});

describe("@tahap-3 kerja bersama: perubahan terlihat tanpa refresh, izin dicabut berlaku seketika, tidak ada kebocoran", () => {
  it("pengambilalihan satu admin terlihat oleh admin lain lewat umpan perubahan (tanpa refresh manual)", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const [a1, a2] = [await w.login(w.adminA), await w.login(w.adminA2)];
    const base = (await a2.get("/api/v1/inbox/changes")).body.serverTime as string;
    const since = encodeURIComponent(base); // kursor tepat pada serverTime: hanya perubahan SESUDAH pembacaan terakhir
    expect((await a2.get(`/api/v1/inbox/changes?since=${since}`)).body.items).toEqual([]);
    await ai(a1, conv, "ambil_alih");
    await a1.post(`/api/v1/conversations/${conv}/assign`, { teamId: w.teamA, assigneeId: w.adminA.id, expectedVersion: 0 });
    const ch = (await a2.get(`/api/v1/inbox/changes?since=${since}`)).body;
    expect(ch.items).toHaveLength(1); // satu item (digabung per id), bukan dua
    expect(ch.items[0]).toMatchObject({ id: conv, aiStatus: "off", aiOffReason: "admin_mengambil_alih", assigneeId: w.adminA.id });
    // admin pengirim pesan keluar → perubahan juga terlihat
    await reply(a1, conv, { text: "halo kak" });
    const ch2 = (await a2.get(`/api/v1/inbox/changes?since=${since}`)).body;
    expect(ch2.items[0].preview).toMatchObject({ direction: "keluar", text: "halo kak" });
  });

  it("izin dicabut berlaku pada permintaan BERIKUTNYA: balas/AI/penugasan ditolak, umpan perubahan kosong; deny spesifik mengalahkan peran", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    const since = encodeURIComponent(new Date(Date.now() - 60_000).toISOString());
    expect((await a.get(`/api/v1/inbox/changes?since=${since}`)).body.items).toHaveLength(1);
    // deny khusus chat.reply: tetap boleh melihat, tidak boleh membalas
    await addUserGrant(w.adminA.id, { permission: "chat.reply", effect: "deny", channelIds: [w.chA.id] });
    expect((await a.get(`/api/v1/conversations/${conv}`)).status).toBe(200);
    expect((await reply(a, conv)).status).toBe(403);
    expect(mock.calls).toHaveLength(0);
    // peran dicabut seluruhnya → semua tertutup di permintaan berikutnya (sesi lama tetap sah tetapi tanpa hak)
    await setRoles(w.adminA.id, []);
    expect((await a.get(`/api/v1/inbox/changes?since=${since}`)).body.items).toEqual([]);
    expect((await a.get(`/api/v1/conversations/${conv}`)).status).toBe(404);
    expect((await ai(a, conv, "ambil_alih")).status).toBe(404);
    expect((await a.post(`/api/v1/conversations/${conv}/assign`, { assigneeId: null, expectedVersion: 0 })).status).toBe(404);
    expect((await a.get("/api/v1/inbox/conversations")).body.total).toBe(0);
  });

  it("umpan perubahan tidak membocorkan percakapan yang aksesnya DICABUT (pengalihan ditarik kembali) dan tidak pernah memuat channel lain", async () => {
    const w = await inboxWorld();
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "rahasia hotline" });
    const conv = await convId(w.chB.id, CUSTOMER2);
    const [a, b] = [await w.login(w.adminA), await w.login(w.adminB)];
    const since = encodeURIComponent(new Date(Date.now() - 60_000).toISOString());
    expect((await a.get(`/api/v1/inbox/changes?since=${since}`)).body.items).toEqual([]);
    await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamA, expectedVersion: 0 });
    expect((await a.get(`/api/v1/inbox/changes?since=${since}`)).body.items.map((i: { id: string }) => i.id)).toEqual([conv]);
    await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamB, expectedVersion: 1 });
    const after = (await a.get(`/api/v1/inbox/changes?since=${since}`)).body;
    expect(after.items).toEqual([]);
    expect(JSON.stringify(after)).not.toContain("rahasia hotline");
  });

  it("pengguna dinonaktifkan: sesi lama ditolak (401) pada permintaan berikutnya, termasuk untuk balasan", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    expect((await a.get("/api/v1/inbox/conversations")).status).toBe(200);
    await ownerQuery("update users set status = 'disabled' where id = $1", [w.adminA.id]);
    expect((await a.get("/api/v1/inbox/conversations")).status).toBe(401);
    expect((await reply(a, conv)).status).toBe(401);
    expect(mock.calls).toHaveLength(0);
  });

  it("history terlambat tidak memicu apa pun di inbox AI: tidak ada job, tidak ada tanda tinjau (kontrak inti #3)", async () => {
    const w = await inboxWorld({ simulation: true });
    await postWebhook(envelope([historyChange([{ id: CUSTOMER, messages: [{ from: CUSTOMER, id: "wamid.uji.hx", timestamp: secAgo(30), type: "text", text: { body: "riwayat baru-baru ini" }, history_context: { status: "READ" } }] }], { phase: 0, chunk_order: 1, progress: 10 }, PHONE_ADM)], WABA));
    await drain();
    const conv = await convId(w.chA.id);
    expect(aiSends()).toHaveLength(0);
    expect(await q("select 1 from automation_jobs")).toHaveLength(0);
    expect(await q("select 1 from domain_outbox")).toHaveLength(0);
    expect((await aiState(conv)).review_flag).toBeNull();
  });
});
