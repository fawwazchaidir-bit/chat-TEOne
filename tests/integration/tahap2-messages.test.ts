import { statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { onCustomerMessage, processInboundBatch, runMaintenance } from "@/modules/conversations-messages";
import { MockGraph } from "../helpers/mock-graph";
import { ownerQuery, resetDb } from "../helpers/db";
import {
  BUSINESS_DISPLAY, CUSTOMER, JPG_BYTES, PDF_BYTES, PHONE_ID, PNG_BYTES, STRANGER, WABA, docMsg, echoChange, envelope, historyChange, imageMsg,
  messagesChange, postWebhook, secAgo, sha256Hex, statusObj, textMsg, world,
} from "../helpers/whatsapp";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const drain = async () => { for (;;) { const r = await processInboundBatch({ limit: 50 }); if (!r.claimed) return; } };
const live = (m: Record<string, unknown>[]) => envelope([messagesChange({ messages: m })]);
const spy = () => { const seen: string[] = []; const off = onCustomerMessage((e) => { seen.push(e.messageId); }); return { seen, off }; };

describe("@tahap-2 pesan masuk: teks, gambar, PDF", () => {
  it("teks → kontak, percakapan, pesan tercatat dengan waktu provider; jendela layanan terbuka", async () => {
    const { channel } = await world();
    const ts = secAgo(3600);
    await postWebhook(live([textMsg("wamid.uji.t1", CUSTOMER, "Halo, mau tanya program", ts)]));
    await drain();
    const [m] = await q("select direction, source, type, body, status, provider_ts, is_history, channel_id from messages");
    expect(m).toMatchObject({ direction: "masuk", source: "pelanggan", type: "text", body: "Halo, mau tanya program", status: null, is_history: false, channel_id: channel.id });
    expect(Math.floor(new Date(m.provider_ts).getTime() / 1000)).toBe(Number(ts));
    const [c] = await q("select last_customer_message_at from conversations");
    expect(Math.floor(new Date(c.last_customer_message_at).getTime() / 1000)).toBe(Number(ts));
    expect((await q("select display_name from contacts"))[0].display_name).toBe("Peserta Uji");
    expect((await q("select identity_type, identity_value from contact_identities"))[0]).toEqual({ identity_type: "wa_id", identity_value: CUSTOMER });
  });

  it("gambar: diunduh lewat mekanisme resmi, tipe di-sniff, sha256 cocok, disimpan PRIVAT (0600, di luar webroot)", async () => {
    await world();
    mock.media.set("media.in.1", { bytes: PNG_BYTES, mime: "image/png", sha256: sha256Hex(PNG_BYTES) });
    await postWebhook(live([imageMsg("wamid.uji.i1", CUSTOMER, "media.in.1", "image/png", sha256Hex(PNG_BYTES), "foto uji")]));
    await drain();
    const [md] = await q("select m.type, m.body, x.status, x.mime, x.sha256, x.size_bytes, x.storage_path from messages m join media x on x.message_id = m.id");
    expect(md).toMatchObject({ type: "image", body: "foto uji", status: "tersimpan", mime: "image/png", sha256: sha256Hex(PNG_BYTES), size_bytes: PNG_BYTES.length });
    const full = path.resolve(process.cwd(), ".data/test-media", md.storage_path);
    expect(statSync(full).mode & 0o777).toBe(0o600);
    expect(md.storage_path.includes("..")).toBe(false);
    expect(mock.calls.every((c) => c.auth === `Bearer ${mock.token}`)).toBe(true); // semua panggilan memakai header Authorization (bukan di URL)
    expect(mock.calls.some((c) => c.path.includes(mock.token))).toBe(false);
  });

  it("PDF: diterima dan disimpan; dokumen NON-PDF → 'tidak didukung' (metadata tersimpan, tidak diunduh, percakapan tetap berjalan)", async () => {
    await world();
    mock.media.set("media.in.pdf", { bytes: PDF_BYTES, mime: "application/pdf" });
    await postWebhook(live([docMsg("wamid.uji.d1", CUSTOMER, "media.in.pdf"), docMsg("wamid.uji.d2", CUSTOMER, "media.in.zip", "application/zip", "arsip.zip"), textMsg("wamid.uji.d3", CUSTOMER, "tetap diproses")]));
    await drain();
    const rows = await q("select provider_message_id id, type, raw_type from messages order by provider_message_id");
    expect(rows).toEqual([{ id: "wamid.uji.d1", type: "document", raw_type: "document" }, { id: "wamid.uji.d2", type: "unsupported", raw_type: "document" }, { id: "wamid.uji.d3", type: "text", raw_type: "text" }]);
    expect((await q("select status from media"))).toEqual([{ status: "tersimpan" }]); // zip tidak diunduh
    expect(mock.calls.some((c) => c.path.includes("media.in.zip"))).toBe(false);
  });

  it("jenis lain (audio, stiker, lokasi, tombol): metadata tersimpan, tampil 'belum didukung', TIDAK menggagalkan pemrosesan", async () => {
    await world();
    const weird = [
      { from: CUSTOMER, id: "wamid.uji.u1", timestamp: secAgo(5), type: "audio", audio: { id: "a1", mime_type: "audio/ogg" } },
      { from: CUSTOMER, id: "wamid.uji.u2", timestamp: secAgo(4), type: "sticker", sticker: { id: "s1" } },
      { from: CUSTOMER, id: "wamid.uji.u3", timestamp: secAgo(3), type: "location", location: { latitude: 1, longitude: 2 } },
      { from: CUSTOMER, id: "wamid.uji.u4", timestamp: secAgo(2), type: "jenis_masa_depan", jenis_masa_depan: { x: 1 } },
      textMsg("wamid.uji.u5", CUSTOMER, "setelahnya"),
    ];
    await postWebhook(live(weird));
    await drain();
    expect(await q("select type, raw_type, body from messages order by provider_ts, provider_message_id")).toEqual([
      { type: "unsupported", raw_type: "audio", body: null }, { type: "unsupported", raw_type: "sticker", body: null },
      { type: "unsupported", raw_type: "location", body: null }, { type: "unsupported", raw_type: "jenis_masa_depan", body: null },
      { type: "text", raw_type: "text", body: "setelahnya" },
    ]);
    expect((await q("select count(*)::int n from inbound_events where status <> 'processed'"))[0].n).toBe(0);
  });

  it("media bermasalah tidak menggagalkan pesan: sha256 salah, isi ≠ tipe, mime terlarang, terlalu besar, kedaluwarsa, URL SSRF", async () => {
    await world();
    mock.media.set("m.sha", { bytes: PNG_BYTES, mime: "image/png", sha256: "0".repeat(64) });
    mock.media.set("m.fake", { bytes: Buffer.from("<html>bukan gambar</html>"), mime: "image/png" });
    mock.media.set("m.exe", { bytes: Buffer.from("MZ....exe"), mime: "application/x-msdownload" });
    mock.media.set("m.big", { bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 0x89), mime: "image/png" });
    mock.media.set("m.ssrf", { bytes: PNG_BYTES, mime: "image/png" });
    const msgs = [
      imageMsg("wamid.uji.e1", CUSTOMER, "m.sha", "image/png", "0".repeat(64)), imageMsg("wamid.uji.e2", CUSTOMER, "m.fake", "image/png"),
      imageMsg("wamid.uji.e3", CUSTOMER, "m.exe", "image/png"), imageMsg("wamid.uji.e4", CUSTOMER, "m.big", "image/png"),
      imageMsg("wamid.uji.e5", CUSTOMER, "m.ssrf", "image/png"), imageMsg("wamid.uji.e6", CUSTOMER, "m.hilang", "image/png"),
    ];
    await postWebhook(live(msgs.slice(0, 4)));
    await drain();
    mock.overrideMediaUrl = "http://169.254.169.254/latest/meta-data/";
    await postWebhook(live([msgs[4]!]));
    await drain();
    mock.overrideMediaUrl = null;
    mock.mediaInfoStatus = 200;
    await postWebhook(live([msgs[5]!])); // media id tak ada → 404 dari info media
    await drain();
    const r = await q("select m.provider_message_id id, x.status, x.error_category cat, x.storage_path from messages m join media x on x.message_id = m.id order by m.provider_message_id");
    expect(r.map((x) => [x.id, x.status, x.cat])).toEqual([
      ["wamid.uji.e1", "gagal", "sha256_tidak_cocok"], ["wamid.uji.e2", "gagal", "isi_tidak_sesuai_tipe"], ["wamid.uji.e3", "gagal", "mime_tidak_diizinkan"],
      ["wamid.uji.e4", "gagal", "terlalu_besar"], ["wamid.uji.e5", "gagal", "url_media_tidak_diizinkan"], ["wamid.uji.e6", "tidak_tersedia", "kedaluwarsa_atau_dihapus"],
    ]);
    expect(r.every((x) => x.storage_path === null)).toBe(true); // tidak ada yang tersimpan
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(6); // semua pesan tetap tercatat
    expect(mock.calls.some((c) => c.path.includes("169.254"))).toBe(false); // URL SSRF tidak pernah dipanggil
  });

  it("gangguan sementara saat unduh → 'menunggu' lalu diulang maksimal 3×, kemudian 'gagal'", async () => {
    await world();
    mock.media.set("m.flaky", { bytes: JPG_BYTES, mime: "image/jpeg" });
    mock.mediaInfoStatus = 500;
    await postWebhook(live([imageMsg("wamid.uji.f1", CUSTOMER, "m.flaky", "image/jpeg")]));
    await drain();
    expect((await q("select status, attempts from media"))[0]).toEqual({ status: "menunggu", attempts: 1 });
    await ownerQuery("update media set created_at = now() - interval '5 minutes'");
    await runMaintenance();
    expect((await q("select status, attempts from media"))[0]).toEqual({ status: "menunggu", attempts: 2 });
    await runMaintenance();
    expect((await q("select status, attempts from media"))[0]).toEqual({ status: "gagal", attempts: 3 });
    await runMaintenance();
    expect((await q("select attempts from media"))[0].attempts).toBe(3); // tidak diulang lagi
    // pulih: pemeliharaan berikutnya tidak menyentuh yang sudah final; pesan tetap utuh
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(1);
  });
});

describe("@tahap-2 CCP 2.8 echo WhatsApp Business App", () => {
  const echo = (id: string, to = CUSTOMER, text = "dibalas dari HP", ts = secAgo(30)) => envelope([echoChange([{ from: BUSINESS_DISPLAY, to, id, timestamp: ts, type: "text", text: { body: text } }])]);

  it("dicatat sebagai pesan KELUAR bersumber WhatsApp Business App; BUKAN pesan pelanggan; jendela layanan tidak terbuka/berubah; tidak memicu hook", async () => {
    await world();
    const s = spy();
    await postWebhook(echo("wamid.uji.echo1"));
    await drain();
    s.off();
    expect((await q("select direction, source, type, body, is_history from messages"))[0]).toEqual({ direction: "keluar", source: "whatsapp_business_app", type: "text", body: "dibalas dari HP", is_history: false });
    expect((await q("select last_customer_message_at, last_message_at from conversations"))[0].last_customer_message_at).toBeNull();
    expect(s.seen).toEqual([]);
  });

  it("echo dideduplikasi (event ganda & kunci wamid); echo ke penerima di luar daftar uji → karantina minimal", async () => {
    await world();
    for (let i = 0; i < 5; i++) await postWebhook(echo("wamid.uji.echo2"));
    await postWebhook(echo("wamid.uji.echo3", STRANGER, "RAHASIA pelanggan lain"));
    await drain();
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(1);
    const [e] = await q("select status, quarantine_reason, payload from inbound_events where event_key = 'echo:wamid.uji.echo3'");
    expect(e).toEqual({ status: "quarantined", quarantine_reason: "pengirim_di_luar_daftar_uji", payload: null });
  });

  it("status yang datang SEBELUM echo-nya diterapkan saat pesan akhirnya tercatat (read mengalahkan delivered/sent)", async () => {
    await world();
    await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.uji.echo4", "read"), statusObj("wamid.uji.echo4", "delivered"), statusObj("wamid.uji.echo4", "sent")] })]));
    await drain();
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(0);
    expect((await q("select count(*)::int n from message_status_events"))[0].n).toBe(3);
    await postWebhook(echo("wamid.uji.echo4"));
    await drain();
    expect((await q("select status from messages"))[0].status).toBe("dibaca");
  });
});

describe("@tahap-2 CCP 2.9 history & status tidak berurutan", () => {
  const hist = (threads: Record<string, unknown>[], progress?: Record<string, unknown>) => envelope([historyChange(threads, progress)]);
  const thread = (msgs: Record<string, unknown>[]) => ({ id: CUSTOMER, messages: msgs });
  const hm = (id: string, from: string, text: string, ts: string) => ({ from, id, timestamp: ts, type: "text", text: { body: text }, history_context: { status: "READ" } });

  it("history ditandai, TIDAK membuka jendela layanan, TIDAK memicu hook, progres dicatat, media riwayat tidak diunduh", async () => {
    await world();
    const s = spy();
    await postWebhook(hist([thread([hm("wamid.uji.h1", CUSTOMER, "pesan lama pelanggan", secAgo(86400 * 3)), hm("wamid.uji.h2", BUSINESS_DISPLAY, "balasan lama bisnis", secAgo(86400 * 3 - 60)), { ...imageMsg("wamid.uji.h3", CUSTOMER, "m.hist", "image/png", undefined, undefined, secAgo(86400 * 2)), history_context: { status: "READ" } }])], { phase: 1, chunk_order: 2, progress: 55 }));
    await drain();
    s.off();
    const rows = await q("select provider_message_id id, direction, source, is_history, status from messages order by provider_message_id");
    expect(rows).toEqual([
      { id: "wamid.uji.h1", direction: "masuk", source: "history", is_history: true, status: null },
      { id: "wamid.uji.h2", direction: "keluar", source: "history", is_history: true, status: null },
      { id: "wamid.uji.h3", direction: "masuk", source: "history", is_history: true, status: null },
    ]);
    expect((await q("select last_customer_message_at from conversations"))[0].last_customer_message_at).toBeNull();
    expect(s.seen).toEqual([]);
    expect((await q("select status, error_category from media"))[0]).toEqual({ status: "tidak_tersedia", error_category: "riwayat_tidak_diunduh" });
    expect(mock.calls).toHaveLength(0); // tidak ada panggilan jaringan untuk history
    expect((await q("select history_progress from channel_connections"))[0].history_progress).toMatchObject({ phase: 1, chunk: 2, progress: 55 });
  });

  it("history dideduplikasi terhadap event langsung (dua arah); event langsung yang datang setelah salinan history 'menaikkan' pesan menjadi pesan pelanggan", async () => {
    await world();
    const s = spy();
    await postWebhook(live([textMsg("wamid.uji.dd1", CUSTOMER, "langsung", secAgo(60))]));
    await drain();
    await postWebhook(hist([thread([hm("wamid.uji.dd1", CUSTOMER, "langsung", secAgo(60))])]));
    await drain();
    expect((await q("select source, is_history from messages"))).toEqual([{ source: "pelanggan", is_history: false }]);
    await postWebhook(hist([thread([hm("wamid.uji.dd2", CUSTOMER, "lama", secAgo(120))])]));
    await drain();
    expect((await q("select source from messages where provider_message_id = 'wamid.uji.dd2'"))[0].source).toBe("history");
    await postWebhook(live([textMsg("wamid.uji.dd2", CUSTOMER, "lama", secAgo(120))]));
    await drain();
    s.off();
    expect((await q("select source, is_history from messages where provider_message_id = 'wamid.uji.dd2'"))[0]).toEqual({ source: "pelanggan", is_history: false });
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(2);
    expect(s.seen).toHaveLength(2); // dd1 (langsung) dan dd2 (langsung terlambat) — history sendiri tidak memicu
  });

  it("status berulang, tidak berurutan, dan terlambat tidak merusak status akhir (diturunkan dari log)", async () => {
    await world();
    await postWebhook(echoEnv("wamid.uji.s1"));
    await drain();
    const feed = async (...st: string[]) => { for (const s of st) await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.uji.s1", s)] })])); await drain(); };
    const status = async () => (await q("select status from messages where provider_message_id = 'wamid.uji.s1'"))[0].status;
    expect(await status()).toBe("terkirim");
    await feed("delivered", "delivered", "sent", "sent");
    expect(await status()).toBe("diterima");
    await feed("read", "delivered", "sent", "read");
    expect(await status()).toBe("dibaca"); // event terlambat/berulang tidak menurunkan
    // gagal tanpa bukti penerimaan
    await postWebhook(echoEnv("wamid.uji.s2"));
    await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.uji.s2", "failed", CUSTOMER, { errors: [{ code: 131026, title: "Message undeliverable" }] })] })]));
    await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.uji.s2", "sent")] })])); // 'sent' terlambat setelah 'failed'
    await drain();
    expect((await q("select status, error_code from messages where provider_message_id = 'wamid.uji.s2'"))[0]).toEqual({ status: "gagal", error_code: "131026" });
    await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.uji.s2", "delivered")] })])); // bukti penerimaan mengalahkan 'failed'
    await drain();
    expect((await q("select status from messages where provider_message_id = 'wamid.uji.s2'"))[0].status).toBe("diterima");
  });
  function echoEnv(id: string) { return envelope([echoChange([{ from: BUSINESS_DISPLAY, to: CUSTOMER, id, timestamp: secAgo(20), type: "text", text: { body: "x" } }])]); }
});

describe("@tahap-2 sumber lead, pengirim di luar daftar uji, hook", () => {
  it("referral (Click-to-WhatsApp) tersimpan dan ditautkan ke percakapan + pesan; pesan tanpa referral tidak diasumsikan memilikinya", async () => {
    await world();
    await postWebhook(live([
      { ...textMsg("wamid.uji.r1", CUSTOMER, "dari iklan"), referral: { source_url: "https://contoh.invalid/iklan", source_id: "ad-123", source_type: "ad", headline: "Promo Uji", ctwa_clid: "clid-uji-1" } },
      textMsg("wamid.uji.r2", CUSTOMER, "tanpa referral"),
    ]));
    await drain();
    const rows = await q("select l.source_type, l.source_id, l.headline, l.click_id, m.provider_message_id mid, l.conversation_id = m.conversation_id as tertaut from lead_sources l join messages m on m.id = l.message_id");
    expect(rows).toEqual([{ source_type: "ad", source_id: "ad-123", headline: "Promo Uji", click_id: "clid-uji-1", mid: "wamid.uji.r1", tertaut: true }]);
  });

  it("D-03 (mode uji): pengirim di luar daftar → karantina minimal (tanpa kontak/pesan/payload), TIDAK memicu hook, dilaporkan (audit + hitungan)", async () => {
    const w = await world();
    const s = spy();
    await postWebhook(live([textMsg("wamid.uji.x1", STRANGER, "RAHASIA-ISI-ORANG-ASING")]));
    await drain();
    s.off();
    expect(s.seen).toEqual([]);
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(0);
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(0);
    const [e] = await q("select status, quarantine_reason, payload from inbound_events");
    expect(e).toEqual({ status: "quarantined", quarantine_reason: "pengirim_di_luar_daftar_uji", payload: null });
    expect(JSON.stringify(await q("select * from inbound_events"))).not.toContain("RAHASIA-ISI-ORANG-ASING");
    expect((await q("select count(*)::int n from audit_log where action = 'integration.unlisted_sender'"))[0].n).toBeGreaterThan(0);
    const { loginFull } = await import("../helpers/fixtures");
    const ov = await (await loginFull(w.user)).get(`/api/v1/integration/overview?channelId=${w.channel.id}`);
    expect(ov.body.unlistedSenders24h).toBe(1);
    expect(JSON.stringify(ov.body)).not.toContain(STRANGER); // nomor tidak dibocorkan
  });

  it("bukan mode uji → pengirim mana pun diproses normal", async () => {
    await world({ testMode: false });
    await postWebhook(live([textMsg("wamid.uji.x2", STRANGER, "umum")]));
    await drain();
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(1);
  });

  it("hook otomatisasi dipicu TEPAT sekali per pesan pelanggan langsung baru (bukan duplikat/echo/history/status)", async () => {
    await world();
    const s = spy();
    await postWebhook(live([textMsg("wamid.uji.k1", CUSTOMER, "a")]));
    await postWebhook(live([textMsg("wamid.uji.k1", CUSTOMER, "a")])); // duplikat
    await postWebhook(live([textMsg("wamid.uji.k2", CUSTOMER, "b")]));
    await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.uji.k1", "read")] })]));
    await drain();
    s.off();
    expect(s.seen).toHaveLength(2);
  });

  it("identitas dari provider: pengenal tambahan (user_id) ditautkan ke kontak yang sama; kontak tanpa identitas dikarantina", async () => {
    await world();
    await postWebhook(live([{ ...textMsg("wamid.uji.id1", CUSTOMER, "satu"), user_id: "BSUID.uji.1" }]));
    await postWebhook(live([{ from: "", id: "wamid.uji.id2", timestamp: secAgo(1), type: "text", text: { body: "tanpa identitas" } }]));
    await drain();
    expect((await q("select identity_type from contact_identities order by identity_type")).map((r) => r.identity_type)).toEqual(["user_id", "wa_id"]);
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(1);
    expect((await q("select quarantine_reason from inbound_events where event_key = 'msg:wamid.uji.id2'"))[0].quarantine_reason).toBe("pengirim_tanpa_identitas");
  });

  it("kontrol: konstanta fixture konsisten", () => {
    expect([PHONE_ID, WABA].every((x) => /^\d+$/.test(x))).toBe(true);
  });
});
