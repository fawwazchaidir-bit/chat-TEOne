/**
 * Tahap 3 — Kill switch empat tingkat (CCP 3.6) dan outbox durable (menutup T2-F15). SIMULASI: job otomatisasi adalah job AI SIMULASI
 * dan Meta adalah mock Graph. Hasil di sini "terbukti simulasi", bukan "terbukti nyata".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { dispatchOutbox, executeSend, onCustomerMessage, resetAccessCacheForTests, runMaintenance } from "@/modules/conversations-messages";
import { SIM_TEXT, runAutomationJob } from "@/modules/automation";
import { checkAutomation } from "@/modules/kill-switch";
import { getConnectionRow } from "@/modules/whatsapp-adapter";
import { MockGraph } from "../helpers/mock-graph";
import { ownerQuery, resetDb } from "../helpers/db";
import { makeSuperAdminSession } from "../helpers/fixtures";
import { CUSTOMER2, PHONE_ADM, PHONE_HOT, convId, drain, enableFlag, inbound, inboxWorld } from "../helpers/inbox";
import { BUSINESS_DISPLAY, CUSTOMER, WABA, echoChange, envelope, historyChange, messagesChange, postWebhook, secAgo, textMsg } from "../helpers/whatsapp";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); resetAccessCacheForTests(); });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const aiSends = () => mock.sends().filter((s) => (s.json as { text?: { body?: string } } | undefined)?.text?.body === SIM_TEXT);
const jobs = () => q("select status, status_reason, updated_at from automation_jobs order by created_at");

describe("@tahap-3 CCP 3.6 kill switch: empat tingkat menghentikan job simulasi (< 1 menit), tidak pernah menyala kembali sendiri", () => {
  it("TINGKAT CHANNEL ('Jeda otomatisasi channel'): menghentikan channel itu saja; channel lain tetap berjalan; hanya pengguna berizin pada channel itu; teraudit", async () => {
    const w = await inboxWorld({ simulation: true });
    const [a, b, v] = [await w.login(w.adminA), await w.login(w.adminB), await w.login(w.viewer)];
    // izin: pelihat & admin channel LAIN tidak boleh menjeda channel Admisi
    expect((await v.put(`/api/v1/channels/${w.chA.id}/automation-pause`, { engaged: true, reason: "uji" })).status).toBe(403);
    expect((await b.put(`/api/v1/channels/${w.chA.id}/automation-pause`, { engaged: true, reason: "uji" })).status).toBe(403);
    expect(await q("select 1 from kill_switches")).toHaveLength(0);
    // alasan wajib
    expect((await a.put(`/api/v1/channels/${w.chA.id}/automation-pause`, { engaged: true, reason: "  " })).body.error.code).toBe("REASON_REQUIRED");
    const t0 = Date.now();
    expect((await a.put(`/api/v1/channels/${w.chA.id}/automation-pause`, { engaged: true, reason: "kampanye bermasalah" })).status).toBe(200);
    await inbound({ phone: PHONE_ADM, text: "halo admisi" });
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "halo hotline" });
    // Admisi dijeda: 0 balasan; Hotline berjalan: 1 balasan
    expect(aiSends()).toHaveLength(1);
    expect(aiSends()[0]!.path).toContain(`/${PHONE_HOT}/messages`);
    const [admJob] = await q("select j.status, j.status_reason, j.updated_at from automation_jobs j join conversations c on c.id = j.conversation_id where c.channel_id = $1", [w.chA.id]);
    expect(admJob).toMatchObject({ status: "dibatalkan", status_reason: `kill_switch:channel:${w.chA.id}` });
    expect((admJob!.updated_at as Date).getTime() - t0).toBeLessThan(60_000); // < 1 menit (CCP 3.6)
    expect((await q("select action, result, actor_label from audit_log where action = 'kill_switch.engaged' and object_id = $1", [`channel:${w.chA.id}`]))).toEqual([{ action: "kill_switch.engaged", result: "success", actor_label: w.adminA.email }]);
    expect((await q("select action from audit_log where action = 'automation.job_cancelled' and metadata->>'reason' like 'kill_switch%'")).length).toBeGreaterThanOrEqual(1);
    // balasan MANUAL tidak terkena jeda otomatisasi (jeda hanya untuk pengiriman otomatis)
    const conv = await convId(w.chA.id);
    const f = new FormData(); f.set("kind", "text"); f.set("text", "manual tetap bisa"); f.set("idempotencyKey", "kunci-manual-jeda-1");
    expect((await a.postForm(`/api/v1/conversations/${conv}/reply`, f)).body.status).toBe("diterima_api");
    // dilepas oleh manusia → pesan BERIKUTNYA diproses (membuktikan jeda adalah penyebab); job lama tidak hidup kembali
    expect((await a.put(`/api/v1/channels/${w.chA.id}/automation-pause`, { engaged: false })).status).toBe(200);
    expect((await q("select status from automation_jobs where status = 'dibatalkan'")).length).toBe(1);
    expect(aiSends()).toHaveLength(1);
  });

  it("TINGKAT FITUR, GLOBAL, dan CHAT (scope kill switch): masing-masing menghentikan job; dilepas manusia; teraudit; hanya Super Admin untuk global/fitur", async () => {
    const w = await inboxWorld({ simulation: true });
    const sa = (await makeSuperAdminSession()).client;
    const a = await w.login(w.adminA);
    // pengguna biasa tidak boleh mengatur kill switch global/fitur/chat
    expect((await a.put("/api/v1/kill-switch", { scope: { type: "global" }, engaged: true, reason: "uji" })).status).toBe(403);
    expect((await a.put("/api/v1/kill-switch", { scope: { type: "feature", ref: "ai_reply" }, engaged: true, reason: "uji" })).status).toBe(403);
    expect(await q("select 1 from kill_switches")).toHaveLength(0);
    const cases: { name: string; scope: Record<string, string>; ref: string }[] = [
      { name: "global", scope: { type: "global" }, ref: "global" },
      { name: "fitur", scope: { type: "feature", ref: "ai_reply" }, ref: "feature:ai_reply" },
    ];
    let expectedSends = 0;
    for (const c of cases) {
      const t0 = Date.now();
      expect((await sa.put("/api/v1/kill-switch", { scope: c.scope, engaged: true, reason: `uji ${c.name}` })).status, c.name).toBe(200);
      await inbound({ text: `pesan saat ${c.name} menyala`, ts: secAgo(2) });
      expect(aiSends(), `${c.name}: tidak ada balasan`).toHaveLength(expectedSends);
      const last = (await jobs()).at(-1)!;
      expect(last, c.name).toMatchObject({ status: "dibatalkan", status_reason: `kill_switch:${c.ref}` });
      expect((last.updated_at as Date).getTime() - t0, c.name).toBeLessThan(60_000);
      // TIDAK menyala kembali sendiri: pemeliharaan + penjadwalan tidak melepasnya
      await runMaintenance();
      expect((await q("select engaged from kill_switches where scope_type = $1", [c.scope.type]))[0].engaged, c.name).toBe(true);
      // dilepas manusia → pesan baru berikutnya diproses
      expect((await sa.put("/api/v1/kill-switch", { scope: c.scope, engaged: false })).status).toBe(200);
      await inbound({ text: `pesan setelah ${c.name} dilepas`, ts: secAgo(1) });
      expectedSends++;
      expect(aiSends(), `${c.name}: setelah dilepas`).toHaveLength(expectedSends);
    }
    // chat: kill switch bercakupan chat pada percakapan ini
    const conv = await convId(w.chA.id);
    expect((await sa.put("/api/v1/kill-switch", { scope: { type: "chat", ref: conv }, engaged: true, reason: "uji chat" })).status).toBe(200);
    await inbound({ text: "pesan saat chat dihentikan", ts: secAgo(0) });
    expect(aiSends()).toHaveLength(expectedSends);
    expect((await jobs()).at(-1)).toMatchObject({ status: "dibatalkan", status_reason: `kill_switch:chat:${conv}` });
    // audit engaged/released lengkap
    const acts = (await q("select action from audit_log where object_type = 'kill_switch' and object_id = any($1) order by id", [["global:", "feature:ai_reply", `chat:${conv}`]])).map((r) => r.action);
    expect(acts.filter((x) => x === "kill_switch.engaged")).toHaveLength(3);
    expect(acts.filter((x) => x === "kill_switch.released")).toHaveLength(2);
  });

  it("TINGKAT CHAT = AI Off ('kill switch chat'): job tertunda dibatalkan, balasan AI berhenti, tidak menyala kembali tanpa tindakan manusia", async () => {
    process.env.AI_SIM_DELAY_MS = "60000"; resetEnvCacheForTests();
    try {
      const w = await inboxWorld({ simulation: true });
      await inbound({ text: "halo" });
      const conv = await convId(w.chA.id);
      const a = await w.login(w.adminA);
      const r = await a.post(`/api/v1/conversations/${conv}/ai`, { action: "kill_switch" });
      expect(r.body.ai).toMatchObject({ status: "off", reason: "kill_switch" });
      expect((await jobs())[0]).toMatchObject({ status: "dibatalkan", status_reason: "ai_off" });
      await ownerQuery("update automation_jobs set run_after = now()");
      await runMaintenance();
      await inbound({ text: "masih ada?" });
      await runMaintenance();
      expect(aiSends()).toHaveLength(0);
      expect((await q("select ai_status, ai_off_reason from conversations"))[0]).toEqual({ ai_status: "off", ai_off_reason: "kill_switch" });
    } finally { delete process.env.AI_SIM_DELAY_MS; resetEnvCacheForTests(); }
  });

  it("pemeriksaan TERAKHIR tepat sebelum kirim: kill switch menyala sesudah titik komit → 0 panggilan Meta, pesan 'gagal' (pasti), tercatat di audit", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const conn = (await getConnectionRow(w.chA.id))!;
    const guard = async () => ((await checkAutomation({ channelId: w.chA.id, feature: "ai_reply", chatId: conv })).blocked ? "kill_switch" : null);
    const run = async (key: string) => {
      const [m] = await q("insert into messages(conversation_id, channel_id, direction, source, type, body, status, idempotency_key) values($1,$2,'keluar','ai','text','uji','diproses',$3) returning id", [conv, w.chA.id, key]);
      const res = await executeSend({ messageId: m!.id as string, channelId: w.chA.id, conversationId: conv, conn, to: CUSTOMER, kind: "text", text: "uji", idempotencyKey: key, actor: { actorLabel: "sistem:uji" }, auditObject: "automation", preSend: guard });
      return { id: m!.id as string, res };
    };
    // kontrol: belum menyala → terkirim satu kali
    const ok = await run("kunci-presend-1");
    expect(ok.res.status).toBe("diterima_api");
    expect(mock.sends()).toHaveLength(1);
    // menyala SESUDAH "komit" (baris pesan sudah dicatat) → pemeriksaan terakhir menangkapnya, tanpa panggilan Meta
    await ownerQuery("insert into kill_switches(scope_type, scope_ref, engaged, reason, engaged_at) values('global','',true,'uji', now()) on conflict (scope_type, scope_ref) do update set engaged = true");
    const blocked = await run("kunci-presend-2");
    expect(blocked.res).toMatchObject({ status: "gagal", errorCategory: "kill_switch" });
    expect(mock.sends()).toHaveLength(1); // tidak bertambah
    expect((await q("select result, metadata from audit_log where action = 'automation.send_blocked' and object_id = $1", [blocked.id]))[0]).toMatchObject({ result: "denied", metadata: { reason: "kill_switch", stage: "sebelum_kirim" } });
  });

  it("kill switch TAMPIL di UI lewat umpan perubahan (tanpa menunggu pesan baru): global/fitur untuk semua; channel HANYA bila terlihat — tidak membocorkan channel lain; hilang saat dilepas", async () => {
    const w = await inboxWorld();
    const [a, b] = [await w.login(w.adminA), await w.login(w.adminB)];
    const feed = async (c: typeof a) => ((await c.get("/api/v1/inbox/changes")).body.killSwitches as { scopeType: string; scopeRef: string; reason: string }[]);
    expect(await feed(a)).toEqual([]);
    await ownerQuery("insert into kill_switches(scope_type, scope_ref, engaged, reason, engaged_at) values ('channel',$1,true,'rahasia hotline',now()), ('global','',true,'global uji',now())", [w.chB.id]);
    const fa = await feed(a);
    expect(fa.map((k) => k.scopeType)).toEqual(["global"]);
    expect(JSON.stringify(fa)).not.toContain("rahasia hotline"); // channel Hotline tidak terlihat oleh admin Admisi
    expect((await feed(b)).map((k) => k.scopeType).sort()).toEqual(["channel", "global"]);
    await ownerQuery("update kill_switches set engaged = false");
    expect(await feed(a)).toEqual([]);
    expect(await feed(b)).toEqual([]);
  });

  it("gagal-tertutup: bila status kill switch tidak dapat dibaca, otomatisasi DIBLOKIR", async () => {
    const broken = { select: () => { throw new Error("db mati"); } } as unknown as Parameters<typeof checkAutomation>[1];
    expect(await checkAutomation({ channelId: "c", feature: "ai_reply", chatId: "x" }, broken)).toEqual({ blocked: true, by: "pemeriksaan_gagal" });
    void getDb;
  });

  it("jaminan STRUKTURAL 'tidak pernah menyala kembali sendiri': hanya satu jalur melepas (applyKillSwitch, tindakan manusia); tak ada timer/penjadwal di modul kill switch", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
    // Jalur SERVER (modul, lib, skrip): hanya applyKillSwitch yang boleh menulis `engaged: false`. Komponen UI yang mengirim { engaged: false } ke API
    // adalah tindakan manusia yang tetap melewati izin + audit di server, sehingga tidak termasuk jalur otomatis.
    const hits = [...walk("src/modules"), ...walk("src/lib"), ...(readdirSync("scripts").map((f) => path.join("scripts", f)).filter((f) => /\.(ts|mjs)$/.test(f)))].filter((f) => /engaged:\s*false/.test(readFileSync(f, "utf8")));
    expect(hits.map((h) => h.replaceAll("\\", "/"))).toEqual(["src/modules/kill-switch/index.ts"]);
    const ks = readFileSync("src/modules/kill-switch/index.ts", "utf8");
    expect(ks).not.toMatch(/setInterval|setTimeout|cron|expires?At|ttl/i);
    expect(readFileSync("src/modules/automation/jobs.ts", "utf8")).not.toMatch(/engaged|setKillSwitch|applyKillSwitch/); // otomatisasi hanya MEMERIKSA, tidak mengubah
  });

  it("flag ai_simulation TIDAK PERNAH menyala di production (server): menyala di DB pun diabaikan; Super Admin tidak dapat menyalakannya; job dibatalkan", async () => {
    const w = await inboxWorld({ simulation: true });
    await inbound({ text: "halo" });
    expect(aiSends()).toHaveLength(1);
    const prev = process.env.APP_ENV;
    process.env.APP_ENV = "production"; resetEnvCacheForTests();
    try {
      const sa = (await makeSuperAdminSession()).client; // sesi dibuat di production (nama cookie berbeda)
      const { isFeatureEnabled } = await import("@/modules/feature-flags");
      expect(await isFeatureEnabled("ai_simulation")).toBe(false); // baris DB menyala, tetapi diabaikan
      const off = await sa.put("/api/v1/feature-flags", { key: "ai_simulation", enabled: true });
      expect(off.status).toBe(400);
      expect(off.body.error.code).toBe("FLAG_FORBIDDEN_IN_PRODUCTION");
      await enableFlag("ai_simulation", true);
      const [msg] = await q("select id from messages where direction = 'masuk' limit 1");
      const conv = await convId(w.chA.id);
      await ownerQuery("insert into automation_jobs(kind, conversation_id, channel_id, trigger_message_id, ai_version, feature, payload) values('ai_sim',$1,$2,$3,0,'ai_reply','{\"text\":\"x\"}'::jsonb)", [conv, w.chA.id, (await q("insert into messages(conversation_id, channel_id, direction, source, type, body, status, provider_ts) values($1,$2,'masuk','pelanggan','text','y','diterima', now()) returning id", [conv, w.chA.id]))[0]!.id]);
      void msg;
      const [job] = await q("select id from automation_jobs where status = 'menunggu'");
      expect(await runAutomationJob(job!.id as string)).toMatchObject({ status: "dibatalkan", reason: "fitur_mati" });
      expect(aiSends()).toHaveLength(1); // tidak bertambah
    } finally { process.env.APP_ENV = prev; resetEnvCacheForTests(); }
  });
});

describe("@tahap-3 outbox durable (menutup T2-F15): event tidak hilang walau proses mati setelah commit; minimal-sekali + idempoten", () => {
  it("event ditulis dalam transaksi yang sama dengan pesan: 1 pesan pelanggan = 1 event; duplikat, history, dan echo TIDAK menulis event", async () => {
    const w = await inboxWorld();
    const id = await inbound({ text: "halo", ts: secAgo(3) });
    expect(await q("select kind, status from domain_outbox")).toEqual([{ kind: "customer_message", status: "delivered" }]);
    await postWebhook(envelope([messagesChange({ phoneId: PHONE_ADM, messages: [textMsg(id, CUSTOMER, "halo", secAgo(3))] })], WABA)); // duplikat
    await postWebhook(envelope([historyChange([{ id: CUSTOMER, messages: [{ from: CUSTOMER, id: "wamid.uji.h9", timestamp: secAgo(20), type: "text", text: { body: "h" }, history_context: { status: "READ" } }] }], { phase: 0, chunk_order: 1, progress: 10 }, PHONE_ADM)], WABA));
    await postWebhook(envelope([echoChange([{ from: BUSINESS_DISPLAY, to: CUSTOMER, id: "wamid.uji.e9", timestamp: secAgo(2), type: "text", text: { body: "e" } }], PHONE_ADM)], WABA));
    await drain();
    expect(await q("select 1 from domain_outbox")).toHaveLength(1);
    // pesan lama (di luar usia otomatisasi) tidak menulis event, walau pesan tersimpan
    await inbound({ from: CUSTOMER2, text: "pesan lama", ts: secAgo(3600) });
    expect(await q("select 1 from domain_outbox")).toHaveLength(1);
    expect((await q("select count(*)::int n from messages where direction = 'masuk'"))[0].n).toBe(3);
    void w;
  });

  it("PROSES MATI setelah commit (event 'processing' dengan lease kedaluwarsa): pemeliharaan memulihkan dan mengirim — tepat satu balasan walau subscriber dipanggil ulang", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" }); // simulasi MATI: flag simulasi belum menyala, subscriber tidak melakukan apa-apa
    expect(aiSends()).toHaveLength(0);
    await enableFlag("ai_simulation");
    await ownerQuery("update domain_outbox set status = 'processing', locked_until = now() - interval '2 minutes', delivered_at = null");
    expect((await runMaintenance()).outbox).toBe(1);
    expect(aiSends()).toHaveLength(1);
    expect(await q("select status from domain_outbox")).toEqual([{ status: "delivered" }]);
    // pengiriman ulang event yang sama (minimal-sekali) → idempoten: tidak ada balasan kedua
    await ownerQuery("update domain_outbox set status = 'pending', run_after = now(), locked_until = null");
    await dispatchOutbox();
    expect(aiSends()).toHaveLength(1);
    expect(await q("select 1 from automation_jobs")).toHaveLength(1);
    void w;
  });

  it("subscriber gagal → event dicoba ulang dengan backoff dan alasan tercatat; setelah batas percobaan → 'failed' (terlihat, tidak hilang diam-diam)", async () => {
    const w = await inboxWorld();
    let boom = true; const calls: string[] = [];
    const off = onCustomerMessage((e) => { calls.push(e.messageId); if (boom) throw new Error("subscriber uji gagal"); });
    try {
      await inbound({ text: "halo" });
      const [row] = await q("select status, attempts, last_error, run_after > now() as backoff from domain_outbox");
      expect(row).toMatchObject({ status: "pending", attempts: 1, backoff: true });
      expect(row!.last_error).toBeTruthy();
      expect(String(row!.last_error)).not.toContain("halo"); // tanpa isi chat di log/kesalahan
      // pulih sebelum batas: terkirim pada percobaan berikutnya
      boom = false;
      await ownerQuery("update domain_outbox set run_after = now()");
      expect((await dispatchOutbox()).delivered).toBe(1);
      expect(await q("select status, attempts from domain_outbox")).toEqual([{ status: "delivered", attempts: 2 }]);
      // gagal terus → 'failed' setelah 5 percobaan
      boom = true;
      await inbound({ from: CUSTOMER2, text: "lain" });
      for (let i = 0; i < 6; i++) { await ownerQuery("update domain_outbox set run_after = now() where status = 'pending'"); await dispatchOutbox(); }
      const failed = await q("select status, attempts, last_error from domain_outbox where status = 'failed'");
      expect(failed).toHaveLength(1);
      expect(failed[0]!.attempts).toBe(5);
      const n = calls.length;
      await dispatchOutbox();
      expect(calls.length).toBe(n); // 'failed' tidak diulang otomatis
    } finally { off(); }
    void w;
  });

  it("subscriber yang melempar pada percobaan pertama tidak menggandakan balasan AI saat dicoba ulang (idempoten per pesan pemicu)", async () => {
    const w = await inboxWorld({ simulation: true });
    let boom = true;
    const off = onCustomerMessage(() => { if (boom) throw new Error("gagal sekali"); });
    try {
      await inbound({ text: "halo" });
      expect(aiSends()).toHaveLength(1); // subscriber otomatisasi sudah berjalan sebelum subscriber uji gagal
      boom = false;
      await ownerQuery("update domain_outbox set run_after = now() where status = 'pending'");
      expect((await dispatchOutbox()).delivered).toBe(1);
      expect(aiSends()).toHaveLength(1);
      expect(await q("select 1 from automation_jobs")).toHaveLength(1);
    } finally { off(); }
    void w;
  });
});
