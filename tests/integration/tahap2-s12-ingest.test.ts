/**
 * S-12 P3 (ingest): webhook `smb_app_state_sync` (kontak) dan `history` pada Step 1/2. SIMULASI — payload sintetis berbentuk resmi; bukan Meta.
 * Kontrak inti #3: sinkronisasi menambah JALUR MASUK, bukan mengubah aturannya — tidak ada otomatisasi, unread, label, atau follow-up dari kontak/history.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { onCustomerMessage, processInboundBatch } from "@/modules/conversations-messages";
import { MockGraph } from "../helpers/mock-graph";
import { ownerQuery, resetDb } from "../helpers/db";
import { CUSTOMER, STRANGER, envelope, messagesChange, postWebhook, secAgo, textMsg, world } from "../helpers/whatsapp";
import { contactSyncChange, histMsg, histThread, historyDeclined, historyFull, historyMediaAsset, syncContact } from "../helpers/s12";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const drain = async () => { for (;;) { const r = await processInboundBatch({ limit: 50 }); if (!r.claimed) return; } };
const spy = () => { const seen: string[] = []; const off = onCustomerMessage((e) => { seen.push(e.messageId); }); return { seen, off }; };
const sync = (items: unknown[]) => postWebhook(envelope([contactSyncChange(items)]));
const hist = (threads: Record<string, unknown>[], md = { phase: 0, chunk_order: 1, progress: 10 }) => postWebhook(envelope([historyFull(threads, md)]));
const counts = async () => (await q(`select (select count(*)::int from contacts) c, (select count(*)::int from conversations) v, (select count(*)::int from messages) m,
  (select count(*)::int from domain_outbox) o, (select count(*)::int from automation_jobs) a`))[0];
const BSUID = "BSUID.UJI.S12.A";

describe("@tahap-2 S-12 P3 smb_app_state_sync: kontak tersimpan TANPA percakapan dan TANPA efek samping", () => {
  it("kontak di daftar uji → kontak + identitas dibuat dengan nama dari buku kontak; TIDAK ada percakapan/pesan/outbox/job; hook pelanggan tidak terpicu; payload dibuang setelah diproses", async () => {
    await world();
    const s = spy();
    try {
      const r = await sync([syncContact({ full: "Budi Santoso", first: "Budi", phone: CUSTOMER, userId: BSUID, ts: secAgo(60) })]);
      expect(r.status).toBe(200);
      await drain();
      expect(await q("select display_name from contacts")).toEqual([{ display_name: "Budi Santoso" }]);
      expect((await q("select identity_type, identity_value from contact_identities order by identity_type")).map((x) => `${x.identity_type}:${x.identity_value}`)).toEqual([`user_id:${BSUID}`, `wa_id:${CUSTOMER}`]);
      expect(await counts()).toMatchObject({ c: 1, v: 0, m: 0, o: 0, a: 0 });
      expect(s.seen).toEqual([]);
      expect(await q("select status, payload from inbound_events")).toEqual([{ status: "processed", payload: null }]); // data pribadi tidak disimpan di antrean
    } finally { s.off(); }
  });

  it("MODE UJI: kontak di luar daftar → tidak disimpan sama sekali (tanpa kontak/identitas), payload dibuang, audit hanya 'jenis'; yang di daftar tetap disimpan dalam webhook yang sama", async () => {
    await world();
    await sync([syncContact({ full: "Orang Asing", phone: STRANGER }), syncContact({ full: "Peserta Uji", phone: CUSTOMER }), syncContact({ full: "Hanya BSUID", userId: "BSUID.TAK.DIKENAL" })]);
    await drain();
    expect((await q("select display_name from contacts")).map((x) => x.display_name)).toEqual(["Peserta Uji"]);
    expect(await q("select identity_value from contact_identities")).toEqual([{ identity_value: CUSTOMER }]);
    const ev = await q("select status, quarantine_reason, payload from inbound_events order by id");
    expect(ev.filter((e) => e.status === "quarantined").map((e) => [e.quarantine_reason, e.payload])).toEqual([["pengirim_di_luar_daftar_uji", null], ["pengirim_di_luar_daftar_uji", null]]);
    const au = await q("select metadata from audit_log where action='integration.unlisted_sender' and metadata->>'kind'='contact_sync'");
    expect(au.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(au)).not.toContain(STRANGER);
  });

  it("kontak yang SUDAH ada (dari pesan) → nama diperbarui oleh buku kontak; 'remove' TIDAK menghapus kontak/percakapan; tanpa nama tidak menimpa", async () => {
    await world();
    await postWebhook(envelope([messagesChange({ messages: [textMsg("wamid.uji.s12.1", CUSTOMER, "halo", secAgo(3600))] })]));
    await drain();
    expect((await q("select display_name from contacts"))[0].display_name).toBe("Peserta Uji"); // dari profil WhatsApp
    const before = await counts();
    await sync([syncContact({ full: "Pak Budi — Peserta ToT", phone: CUSTOMER, ts: secAgo(50) })]);
    await drain();
    expect((await q("select display_name from contacts"))[0].display_name).toBe("Pak Budi — Peserta ToT");
    await sync([syncContact({ action: "remove", phone: CUSTOMER, ts: secAgo(40) })]);
    await sync([syncContact({ phone: CUSTOMER, ts: secAgo(30) })]); // tanpa nama
    await drain();
    expect((await q("select display_name from contacts"))[0].display_name).toBe("Pak Budi — Peserta ToT");
    expect(await counts()).toEqual(before); // tidak ada kontak/percakapan/pesan baru atau terhapus
  });

  it("'remove' untuk kontak yang BELUM ada tidak membuat apa pun (kontak/identitas/percakapan); 'remove' bernama pun tidak menimpa nama", async () => {
    await world();
    await sync([syncContact({ action: "remove", phone: CUSTOMER, ts: secAgo(30) })]);
    await drain();
    expect(await counts()).toMatchObject({ c: 0, v: 0, m: 0 });
    expect((await q("select count(*)::int n from contact_identities"))[0].n).toBe(0);
    expect((await q("select status from inbound_events")).map((x) => x.status)).toEqual(["processed"]); // dikenali, tidak berefek
    await sync([syncContact({ full: "Nama Awal", phone: CUSTOMER, ts: secAgo(20) })]);
    await sync([syncContact({ action: "remove", full: "Nama Setelah Hapus", phone: CUSTOMER, ts: secAgo(10) })]);
    await drain();
    expect((await q("select display_name from contacts")).map((x) => x.display_name)).toEqual(["Nama Awal"]);
  });

  it("idempoten: webhook yang sama dikirim ulang → satu event; suntingan berikutnya (cap waktu baru) diproses", async () => {
    await world();
    const item = syncContact({ full: "Nama Satu", phone: CUSTOMER, ts: "1738346006" });
    expect(((await sync([item])).text)).toContain('"stored":1');
    expect(((await sync([item])).text)).toContain('"duplicates":1');
    await drain();
    await sync([syncContact({ full: "Nama Dua", phone: CUSTOMER, ts: "1738346999" })]);
    await drain();
    expect((await q("select count(*)::int n from inbound_events"))[0].n).toBe(2);
    expect((await q("select display_name from contacts"))[0].display_name).toBe("Nama Dua"); // ... dan kontak tetap SATU
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(1);
  });

  it("channel BUKAN mode uji (go-live; mis. production) → kontak di luar daftar tetap disimpan; BSUID-saja tanpa nomor → kontak dengan identitas user_id", async () => {
    await world({ testMode: false });
    await sync([syncContact({ full: "Tamu", phone: STRANGER }), syncContact({ full: "Pengguna BSUID", userId: BSUID })]);
    await drain();
    expect((await q("select display_name from contacts order by display_name")).map((x) => x.display_name)).toEqual(["Pengguna BSUID", "Tamu"]);
    expect((await q("select identity_type from contact_identities order by identity_type")).map((x) => x.identity_type)).toEqual(["user_id", "wa_id"]);
    expect(await counts()).toMatchObject({ v: 0, m: 0, o: 0, a: 0 });
  });

  it("identitas menunjuk DUA kontak berbeda → karantina 'identitas_bentrok' (payload dipertahankan untuk pemulihan terkontrol); tidak ada penggabungan otomatis", async () => {
    await world();
    await ownerQuery("insert into contacts(display_name) values('Kontak A'), ('Kontak B')");
    const [a, b] = (await q("select id from contacts order by display_name")).map((x) => x.id);
    await ownerQuery("insert into contact_identities(contact_id, provider, identity_type, identity_value) values($1,'whatsapp','wa_id',$2), ($3,'whatsapp','user_id',$4)", [a, CUSTOMER, b, BSUID]);
    await sync([syncContact({ full: "Bentrok", phone: CUSTOMER, userId: BSUID })]);
    await drain();
    expect(await q("select status, quarantine_reason from inbound_events")).toEqual([{ status: "quarantined", quarantine_reason: "identitas_bentrok" }]);
    expect((await q("select display_name from contacts order by display_name")).map((x) => x.display_name)).toEqual(["Kontak A", "Kontak B"]);
    expect((await q("select count(*)::int n from contact_identities"))[0].n).toBe(2);
  });
});

describe("@tahap-2 S-12 P3 history Step 2: fase 0/1/2, chunk tidak berurutan, tanpa otomatisasi", () => {
  it("tiga fase dengan potongan TIDAK berurutan: pesan tersimpan sebagai history; progres tidak turun; fase terjauh; 0 hook/unread/outbox/job/jendela; media_placeholder tanpa media", async () => {
    await world();
    const s = spy();
    try {
      const t = (id: string, ts: string, o: Record<string, string> = {}) => histThread({ id: CUSTOMER, messages: [histMsg(id, { from: CUSTOMER, ts, text: `riwayat ${id}`, ...o })] });
      await hist([t("wamid.uji.h2", secAgo(100 * 86400))], { phase: 2, chunk_order: 1, progress: 90 }); // fase 2 tiba LEBIH DULU
      await hist([histThread({ id: CUSTOMER, messages: [histMsg("wamid.uji.h2b", { from: "15550000001", ts: secAgo(99 * 86400), type: "media_placeholder" })] })], { phase: 2, chunk_order: 2, progress: 95 });
      await hist([t("wamid.uji.h0", secAgo(3600))], { phase: 0, chunk_order: 2, progress: 20 }); // progres lebih kecil datang terlambat
      await hist([t("wamid.uji.h1", secAgo(5 * 86400))], { phase: 1, chunk_order: 1, progress: 100 });
      await drain();
      const rows = await q("select provider_message_id id, source, is_history, unread_eligible, direction, type from messages order by provider_message_id");
      expect(rows.map((r) => r.id)).toEqual(["wamid.uji.h0", "wamid.uji.h1", "wamid.uji.h2", "wamid.uji.h2b"]);
      expect(rows.every((r) => r.source === "history" && r.is_history === true && r.unread_eligible === false)).toBe(true);
      expect(rows.find((r) => r.id === "wamid.uji.h2b")).toMatchObject({ type: "unsupported", direction: "keluar" });
      expect(await q("select count(*)::int n from media")).toEqual([{ n: 0 }]);
      expect(await counts()).toMatchObject({ c: 1, v: 1, m: 4, o: 0, a: 0 });
      expect((await q("select last_customer_message_at from conversations"))[0].last_customer_message_at).toBeNull(); // history tidak membuka jendela layanan
      expect(s.seen).toEqual([]); // kontrak inti #3 / CCP 2.9: history tidak memicu otomatisasi
      const [c] = await q("select history_progress hp from channel_connections");
      expect(c.hp).toMatchObject({ phase: 2, progress: 100, complete: true, declined: false, phasesSeen: [0, 1, 2] });
    } finally { s.off(); }
  });

  it("MODE UJI: thread pelanggan di luar daftar → dikarantina, payload dibuang, tidak ada kontak/percakapan/pesan; thread di daftar tetap masuk", async () => {
    await world();
    await hist([histThread({ id: STRANGER, messages: [histMsg("wamid.uji.o1", { from: STRANGER, text: "RAHASIA ORANG ASING" })] }), histThread({ id: CUSTOMER, messages: [histMsg("wamid.uji.o2", { from: CUSTOMER })] })]);
    await drain();
    expect((await q("select provider_message_id id from messages")).map((x) => x.id)).toEqual(["wamid.uji.o2"]);
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(1);
    const quarantined = await q("select quarantine_reason, payload from inbound_events where status='quarantined'");
    expect(quarantined).toEqual([{ quarantine_reason: "pengirim_di_luar_daftar_uji", payload: null }]);
    expect(JSON.stringify(await q("select * from audit_log where action='integration.unlisted_sender'"))).not.toContain(STRANGER);
  });

  it("penolakan berbagi riwayat (2593109) → status jujur 'ditolak' pada koneksi; tidak ada pesan; progres 100 yang datang kemudian tidak membalik; bukan karantina", async () => {
    await world();
    await postWebhook(envelope([historyDeclined()]));
    await drain();
    expect((await q("select status from inbound_events")).map((x) => x.status)).toEqual(["processed"]);
    const [c] = await q("select history_progress hp from channel_connections");
    expect(c.hp).toMatchObject({ declined: true, errorCode: 2593109, complete: false });
    await hist([histThread({ id: CUSTOMER, messages: [histMsg("wamid.uji.d1", { from: CUSTOMER })] })], { phase: 0, chunk_order: 1, progress: 100 });
    await drain();
    expect((await q("select history_progress hp from channel_connections"))[0].hp).toMatchObject({ declined: true, complete: false });
  });

  it("aset media terpisah (field history + messages[]) → tidak memicu apa pun, tidak mengunduh, tidak membuat pesan; payload karantina tanpa nomor/ID media", async () => {
    await world();
    mock.media.set("media.hist.9", { bytes: Buffer.from("x"), mime: "image/jpeg" });
    await postWebhook(envelope([historyMediaAsset("wamid.uji.ma1", CUSTOMER, "media.hist.9")]));
    await drain();
    expect(await counts()).toMatchObject({ c: 0, v: 0, m: 0, o: 0, a: 0 });
    expect(mock.calls.filter((c) => c.path.includes("media.hist.9"))).toHaveLength(0);
    const [ev] = await q("select status, quarantine_reason, payload::text p from inbound_events");
    expect(ev).toMatchObject({ status: "quarantined", quarantine_reason: "bentuk_tidak_dikenal:history_media_tidak_diproses" });
    expect(`${ev.p}`.includes(CUSTOMER) || `${ev.p}`.includes("media.hist.9")).toBe(false);
  });

  it("dedup terhadap pesan langsung: history yang tiba SETELAH pesan langsungnya tidak mengubah apa pun dan tidak memicu hook", async () => {
    await world();
    await postWebhook(envelope([messagesChange({ messages: [textMsg("wamid.uji.dd", CUSTOMER, "langsung", secAgo(120))] })]));
    await drain();
    const s = spy();
    try {
      await hist([histThread({ id: CUSTOMER, messages: [histMsg("wamid.uji.dd", { from: CUSTOMER, text: "salinan riwayat" })] })]);
      await drain();
      expect(await q("select body, source, is_history from messages")).toEqual([{ body: "langsung", source: "pelanggan", is_history: false }]);
      expect(s.seen).toEqual([]);
    } finally { s.off(); }
  });
});

describe("@tahap-2 S-12 P3 history + BSUID (F1-03): identitas hanya digabung bila terbukti", () => {
  it("thread dengan context.wa_id + user_id (tanpa `id`) → kontak punya KEDUA identitas (bukti: konteks thread yang sama dari Meta); pesan masuk dari from_user_id → masuk", async () => {
    await world();
    await hist([histThread({ context: { wa_id: CUSTOMER, user_id: BSUID }, messages: [histMsg("wamid.uji.b1", { fromUserId: BSUID, text: "halo dari BSUID" })] })]);
    await drain();
    expect((await q("select identity_type from contact_identities order by identity_type")).map((x) => x.identity_type)).toEqual(["user_id", "wa_id"]);
    expect(await q("select direction, source, body from messages")).toEqual([{ direction: "masuk", source: "history", body: "halo dari BSUID" }]);
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(1);
  });

  it("thread HANYA BSUID: mode uji → dikenali bila BSUID itu sudah milik kontak yang nomornya ada di daftar uji; BSUID tak dikenal → dikarantina, tidak ada kontak baru", async () => {
    await world();
    await ownerQuery("insert into contacts(display_name) values('Dikenal')");
    const [k] = await q("select id from contacts");
    await ownerQuery("insert into contact_identities(contact_id, provider, identity_type, identity_value) values($1,'whatsapp','wa_id',$2), ($1,'whatsapp','user_id',$3)", [k.id, CUSTOMER, BSUID]);
    await hist([histThread({ context: { user_id: BSUID }, messages: [histMsg("wamid.uji.u1", { fromUserId: BSUID })] }), histThread({ context: { user_id: "BSUID.TAK.DIKENAL" }, messages: [histMsg("wamid.uji.u2", { fromUserId: "BSUID.TAK.DIKENAL" })] })]);
    await drain();
    expect((await q("select provider_message_id id from messages")).map((x) => x.id)).toEqual(["wamid.uji.u1"]);
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(1); // tidak ada kontak baru dari BSUID tak dikenal
    expect((await q("select quarantine_reason from inbound_events where status='quarantined'")).map((x) => x.quarantine_reason)).toEqual(["pengirim_di_luar_daftar_uji"]);
  });

  it("bukti bertentangan → dikarantina tanpa menulis apa pun: `id` thread ≠ context.wa_id; from_user_id ≠ context.user_id; arah pesan tak dapat ditentukan", async () => {
    await world();
    await hist([
      histThread({ id: CUSTOMER, context: { wa_id: "15550009999", user_id: BSUID }, messages: [histMsg("wamid.uji.x1", { from: CUSTOMER })] }),
      histThread({ id: CUSTOMER, context: { user_id: BSUID }, messages: [histMsg("wamid.uji.x2", { fromUserId: "BSUID.LAIN" })] }),
      histThread({ id: CUSTOMER, messages: [histMsg("wamid.uji.x3", {})] }),
    ]);
    await drain();
    expect(await counts()).toMatchObject({ c: 0, v: 0, m: 0 });
    expect((await q("select quarantine_reason from inbound_events where status='quarantined' order by id")).map((x) => x.quarantine_reason)).toEqual(["history_identitas_bertentangan", "history_identitas_bertentangan", "history_arah_tidak_pasti"]);
  });

  it("identitas menunjuk DUA kontak berbeda → karantina 'identitas_bentrok' (bukan kegagalan berulang); tidak ada penggabungan; tidak ada pesan", async () => {
    await world();
    await ownerQuery("insert into contacts(display_name) values('Kontak A'), ('Kontak B')");
    const [a, b] = (await q("select id from contacts order by display_name")).map((x) => x.id);
    await ownerQuery("insert into contact_identities(contact_id, provider, identity_type, identity_value) values($1,'whatsapp','wa_id',$2), ($3,'whatsapp','user_id',$4)", [a, CUSTOMER, b, BSUID]);
    await hist([histThread({ context: { wa_id: CUSTOMER, user_id: BSUID }, messages: [histMsg("wamid.uji.k1", { fromUserId: BSUID })] })]);
    await drain();
    expect(await q("select status, quarantine_reason, attempts from inbound_events where kind='history' and quarantine_reason is not null")).toEqual([{ status: "quarantined", quarantine_reason: "identitas_bentrok", attempts: 1 }]); // satu kali coba, bukan gagal berulang
    expect((await q("select status from inbound_events where status='failed'")).length).toBe(0);
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(0);
    expect((await q("select count(*)::int n from contact_identities"))[0].n).toBe(2);
  });
});
