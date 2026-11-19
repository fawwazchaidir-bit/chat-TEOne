import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { claimBatch, requeueEvent } from "@/modules/whatsapp-adapter";
import { processInboundBatch } from "@/modules/conversations-messages";
import { ownerQuery, resetDb } from "../helpers/db";
import { loginFull, makeChannel, makeRole, makeUser } from "../helpers/fixtures";
import { CUSTOMER, PHONE_ID, WABA, envelope, listRecipient, mapChannel, messagesChange, postWebhook, textMsg, world, enableConnector } from "../helpers/whatsapp";

afterAll(closeDb);
beforeEach(resetDb);

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const count = async (table: string, where = "true") => (await q(`select count(*)::int n from ${table} where ${where}`))[0].n as number;
const drain = async () => { for (;;) { const r = await processInboundBatch({ limit: 50 }); if (!r.claimed) return; } };
const msg = (phoneId: string, waba: string, id: string, from = CUSTOMER, text = "halo") => envelope([messagesChange({ phoneId, messages: [textMsg(id, from, text)] })], waba);

describe("@tahap-2 CCP 2.4: pemetaan channel", () => {
  it("phone_number_id tak dikenal → KARANTINA (tidak masuk channel mana pun), payload dipertahankan untuk dipetakan ulang", async () => {
    const { channel } = await world();
    await postWebhook(msg("299999999999999", WABA, "wamid.uji.asing"));
    await drain();
    const [ev] = await q("select status, quarantine_reason, channel_id, payload is not null as has from inbound_events");
    expect(ev).toMatchObject({ status: "quarantined", quarantine_reason: "channel_tidak_dikenal", channel_id: null, has: true });
    expect(await count("messages")).toBe(0);
    expect(await count("conversations", `channel_id = '${channel.id}'`)).toBe(0);
  });

  it("WABA tidak cocok dengan pemetaan → karantina (tidak ditebak)", async () => {
    await world();
    await postWebhook(msg(PHONE_ID, "100000000009999", "wamid.uji.waba"));
    const [ev] = await q("select status, quarantine_reason from inbound_events");
    expect(ev).toEqual({ status: "quarantined", quarantine_reason: "waba_tidak_cocok" });
    await drain();
    expect(await count("messages")).toBe(0);
  });

  it("karantina channel-tak-dikenal dapat diproses ulang SETELAH pemetaan dibuat — masuk ke channel yang benar", async () => {
    await world();
    const hot = await makeChannel("Hotline — contoh", "Hotline");
    await postWebhook(msg("200000000000002", "100000000000002", "wamid.uji.nanti", CUSTOMER, "menunggu pemetaan"));
    const [{ id }] = await q("select id from inbound_events");
    expect(await requeueEvent(id)).toEqual({ ok: false, reason: "channel_belum_dipetakan" });
    await mapChannel(hot.id, { phoneId: "200000000000002", waba: "100000000000002" });
    expect(await requeueEvent(id)).toEqual({ ok: true });
    await drain();
    const [m] = await q("select channel_id, body from messages");
    expect(m).toEqual({ channel_id: hot.id, body: "menunggu pemetaan" });
  });

  it("simulasi 5 channel: tiap pesan mendarat di channelnya; kontak yang SAMA di dua channel = 1 kontak, 2 percakapan, tidak tertukar", async () => {
    const w = await world();
    const names = ["Admisi — contoh", "Hotline — contoh", "Finance — contoh", "Operator — contoh"];
    const chans = [w.channel];
    for (const [i, n] of names.entries()) {
      const c = await makeChannel(n, n.split(" ")[0]!);
      await mapChannel(c.id, { phoneId: `20000000000010${i}`, waba: `10000000000010${i}` });
      chans.push(c);
    }
    expect(chans).toHaveLength(5);
    const phones = [[PHONE_ID, WABA], ...names.map((_, i) => [`20000000000010${i}`, `10000000000010${i}`])] as [string, string][];
    for (const [i, [p, wb]] of phones.entries()) await postWebhook(msg(p, wb, `wamid.uji.ch${i}`, CUSTOMER, `untuk channel ${i}`));
    await drain();
    for (const [i, c] of chans.entries()) {
      const rows = await q("select body from messages where channel_id = $1", [c.id]);
      expect(rows, `channel ${i}`).toEqual([{ body: `untuk channel ${i}` }]);
    }
    expect(await count("contacts")).toBe(1); // satu pelanggan di semua channel
    expect(await count("conversations")).toBe(5);
    expect((await q("select count(distinct channel_id)::int n from conversations"))[0].n).toBe(5);
    // pemetaan yang SALAH (nomor channel A dengan WABA channel B) ditolak
    await postWebhook(msg(phones[0]![0], phones[1]![1], "wamid.uji.silang"));
    const [sil] = await q("select status, quarantine_reason from inbound_events where event_key = 'msg:wamid.uji.silang'");
    expect(sil).toEqual({ status: "quarantined", quarantine_reason: "waba_tidak_cocok" });
  });

  it("satu phone_number_id hanya boleh dipetakan ke SATU channel (UNIQUE di database)", async () => {
    const w = await world();
    const other = await makeChannel("Hotline — contoh", "Hotline");
    await expect(mapChannel(other.id)).rejects.toThrow(); // PHONE_ID sama dengan channel pertama
    expect((await q("select count(*)::int n from channel_connections"))[0].n).toBe(1);
    expect(w.channel.id).toBeTruthy();
  });
});

describe("@tahap-2 worker: restart, paralel, kegagalan", () => {
  it("restart worker: event yang diklaim lalu 'crash' diambil ulang setelah lease habis dan diproses TEPAT sekali", async () => {
    await world();
    await postWebhook(msg(PHONE_ID, WABA, "wamid.uji.crash", CUSTOMER, "tahan restart"));
    const claimed = await claimBatch(10, 1); // lease 1 ms lalu worker "mati" (tidak memproses/menandai)
    expect(claimed).toHaveLength(1);
    expect((await q("select status from inbound_events"))[0].status).toBe("processing");
    expect((await processInboundBatch({ now: new Date(Date.now() - 60_000) })).claimed).toBe(0); // lease belum dianggap habis pada waktu itu
    await new Promise((r) => setTimeout(r, 20));
    const r = await processInboundBatch();
    expect(r).toMatchObject({ claimed: 1, processed: 1 });
    expect(await count("messages")).toBe(1);
    expect((await q("select attempts, status from inbound_events"))[0]).toEqual({ attempts: 2, status: "processed" });
    expect((await processInboundBatch()).claimed).toBe(0); // tidak diproses ketiga kali
  });

  it("dua worker paralel pada 80 event → setiap event diklaim & diproses sekali (SKIP LOCKED), tanpa duplikat pesan", async () => {
    await world();
    for (let i = 0; i < 80; i++) await postWebhook(msg(PHONE_ID, WABA, `wamid.uji.w${i}`, CUSTOMER, `p${i}`));
    const loops = async () => { let n = 0; for (;;) { const r = await processInboundBatch({ limit: 7 }); if (!r.claimed) return n; n += r.processed; } };
    const [a, b] = await Promise.all([loops(), loops()]);
    expect(a + b).toBe(80);
    expect(await count("messages")).toBe(80);
    expect((await q("select count(*)::int n from inbound_events where attempts <> 1"))[0].n).toBe(0);
  });

  it("kegagalan pemrosesan: backoff → status 'failed' setelah batas percobaan; error tersimpan sebagai KODE (tanpa isi chat); dapat diproses ulang manual", async () => {
    const w = await world();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await postWebhook(msg(PHONE_ID, WABA, "wamid.uji.gagal", CUSTOMER, "RAHASIA-ISI-CHAT-123"));
    await ownerQuery("revoke insert on messages from teone_app");
    try {
      for (let i = 0; i < 5; i++) {
        const r = await processInboundBatch();
        expect(r).toMatchObject({ claimed: 1, failed: 1 });
        const [e] = await q("select status, attempts, last_error, run_after > now() as ditunda from inbound_events");
        if (i < 4) expect(e).toMatchObject({ status: "pending", attempts: i + 1, ditunda: true });
        await ownerQuery("update inbound_events set run_after = now() - interval '1 second' where status = 'pending'"); // lewati backoff
      }
    } finally {
      await ownerQuery("grant insert on messages to teone_app");
    }
    const [f] = await q("select status, attempts, last_error from inbound_events");
    expect(f).toMatchObject({ status: "failed", attempts: 5 });
    expect(f.last_error).toMatch(/^pg:/);
    expect(JSON.stringify(f) + JSON.stringify(err.mock.calls)).not.toContain("RAHASIA-ISI-CHAT-123");
    // tidak ada percobaan otomatis lagi:
    expect((await processInboundBatch()).claimed).toBe(0);
    // pemrosesan ulang manual lewat alat uji (izin + audit)
    const ui = await loginFull(w.user);
    const [{ id }] = await q("select id from inbound_events");
    expect((await ui.post(`/api/v1/integration/events/${id}/retry`)).body).toEqual({ ok: true });
    await drain();
    expect(await count("messages")).toBe(1);
    expect((await q("select action from audit_log where action = 'integration.event_requeued'")).length).toBeGreaterThan(0);
  });

  it("alat uji: daftar event bermasalah hanya untuk yang berizin pada channel itu; pengguna channel lain mendapat 404", async () => {
    const w = await world();
    const other = await makeChannel("Hotline — contoh", "Hotline");
    const role = await makeRole("Penguji Hotline", [{ permission: "channel.view", channelIds: [other.id] }, { permission: "integration.test", channelIds: [other.id] }]);
    const stranger = await loginFull(await makeUser({ roleIds: [role.id] }));
    const ui = await loginFull(w.user);
    expect((await ui.get(`/api/v1/integration/events?channelId=${w.channel.id}`)).status).toBe(200);
    expect((await stranger.get(`/api/v1/integration/events?channelId=${w.channel.id}`)).status).toBe(404);
    expect((await stranger.get(`/api/v1/integration/overview?channelId=${w.channel.id}`)).status).toBe(404);
    const noPerm = await loginFull(await makeUser());
    expect((await noPerm.get(`/api/v1/integration/events?channelId=${w.channel.id}`)).status).toBe(403);
  });

  it("flag dimatikan: antrean berhenti menerima & alat uji menolak (fitur 'tidak ada')", async () => {
    const w = await world();
    await enableConnector(false);
    expect((await postWebhook(msg(PHONE_ID, WABA, "wamid.uji.off"))).status).toBe(404);
    const ui = await loginFull(w.user);
    expect((await ui.get(`/api/v1/integration/overview?channelId=${w.channel.id}`)).body.error.code).toBe("FEATURE_DISABLED");
    expect(listRecipient).toBeDefined();
  });
});
