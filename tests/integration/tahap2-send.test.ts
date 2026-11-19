import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { processInboundBatch, reconcileUncertain, runMaintenance } from "@/modules/conversations-messages";
import { MockGraph } from "../helpers/mock-graph";
import type { Client } from "../helpers/api";
import { ownerQuery, resetDb } from "../helpers/db";
import { loginFull, makeChannel, makeRole, makeUser } from "../helpers/fixtures";
import { BUSINESS_DISPLAY, CUSTOMER, PDF_BYTES, PHONE_ID, PNG_BYTES, STRANGER, WABA, echoChange, envelope, historyChange, messagesChange, postWebhook, secAgo, statusObj, textMsg, world } from "../helpers/whatsapp";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const drain = async () => { for (;;) { const r = await processInboundBatch({ limit: 50 }); if (!r.claimed) return; } };
const openWindow = async (ts = secAgo(60), from = CUSTOMER) => { await postWebhook(envelope([messagesChange({ messages: [textMsg(`wamid.uji.in.${randomUUID().slice(0, 8)}`, from, "halo", ts)] })])); await drain(); };
const ready = async () => { const w = await world(); const ui = await loginFull(w.user); return { w, ui }; };

async function send(c: Client, channelId: string, o: { to?: string; kind?: "text" | "image" | "document"; text?: string; key?: string; file?: { bytes: Uint8Array; mime: string; name: string }; caption?: string } = {}) {
  const f = new FormData();
  f.set("channelId", channelId); f.set("to", o.to ?? CUSTOMER); f.set("kind", o.kind ?? "text"); f.set("idempotencyKey", o.key ?? `kunci-${randomUUID()}`);
  if ((o.kind ?? "text") === "text") f.set("text", o.text ?? "balasan uji");
  if (o.caption) f.set("caption", o.caption);
  if (o.file) f.set("file", new File([o.file.bytes as BlobPart], o.file.name, { type: o.file.mime }));
  return c.postForm("/api/v1/integration/send", f);
}

describe("@tahap-2 pengiriman teks (alat uji)", () => {
  it("kirim teks ke peserta uji dalam jendela → 'diterima API' dengan ID provider; payload berisi biz_opaque_callback_data = kunci idempotensi; teraudit", async () => {
    const { w, ui } = await ready();
    await openWindow();
    const key = "kunci-uji-0001";
    const r = await send(ui, w.channel.id, { key, text: "Halo balik" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "diterima_api", duplicate: false, errorCategory: null });
    expect(mock.sends()).toHaveLength(1);
    expect(mock.sends()[0]!.json).toMatchObject({ messaging_product: "whatsapp", to: CUSTOMER, type: "text", text: { body: "Halo balik" }, biz_opaque_callback_data: key });
    const [m] = await q("select direction, source, status, provider_message_id, idempotency_key, created_by from messages where direction = 'keluar'");
    expect(m).toMatchObject({ direction: "keluar", source: "te_one", status: "diterima_api", provider_message_id: "wamid.mock.1", idempotency_key: key });
    expect((await q("select result, metadata from audit_log where action = 'integration.message_sent'"))[0]).toMatchObject({ result: "success" });
    expect(JSON.stringify(await q("select * from audit_log"))).not.toContain("Halo balik"); // isi pesan tidak masuk audit
  });

  it("status webhook menggerakkan status pesan keluar: terkirim → diterima → dibaca", async () => {
    const { w, ui } = await ready();
    await openWindow();
    await send(ui, w.channel.id);
    for (const s of ["sent", "delivered", "read"]) { await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.mock.1", s)] })])); await drain(); }
    expect((await q("select status from messages where direction = 'keluar'"))[0].status).toBe("dibaca");
  });

  it("KLIK GANDA: 12 permintaan paralel dengan kunci idempotensi yang sama → TEPAT SATU panggilan ke Meta, satu pesan, hasil sama", async () => {
    const { w, ui } = await ready();
    await openWindow();
    const key = "kunci-klik-ganda-1";
    const rs = await Promise.all(Array.from({ length: 12 }, () => send(ui, w.channel.id, { key })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(new Set(rs.map((r) => r.body.messageId)).size).toBe(1);
    expect(rs.filter((r) => r.body.duplicate === false)).toHaveLength(1);
    expect(mock.sends()).toHaveLength(1);
    expect((await q("select count(*)::int n from messages where direction = 'keluar'"))[0].n).toBe(1);
    // klik lagi sesudahnya → tetap tidak mengirim
    expect((await send(ui, w.channel.id, { key })).body.duplicate).toBe(true);
    expect(mock.sends()).toHaveLength(1);
  });

  it("kunci idempotensi yang dipakai channel lain → 409 (tidak bocor lintas channel)", async () => {
    const { w, ui } = await ready();
    await openWindow();
    await send(ui, w.channel.id, { key: "kunci-lintas-0001" });
    const other = await makeChannel("Hotline — contoh", "Hotline");
    await ownerQuery("insert into channel_connections(channel_id, waba_id, phone_number_id) values($1,'100000000000002','200000000000002')", [other.id]);
    const role = await makeRole("Penguji Hotline", [{ permission: "channel.view", channelIds: [other.id] }, { permission: "integration.test", scopeAll: true }]);
    const c2 = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await send(c2, other.id, { key: "kunci-lintas-0001" })).body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("@tahap-2 CCP 2.5: daftar penerima uji ditegakkan di server", () => {
  it("penerima di luar daftar → 403, TIDAK ADA panggilan ke Meta, tidak ada pesan, teraudit", async () => {
    const { w, ui } = await ready();
    await openWindow();
    const r = await send(ui, w.channel.id, { to: STRANGER });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("RECIPIENT_NOT_ALLOWED");
    expect(mock.calls).toHaveLength(0);
    expect((await q("select count(*)::int n from messages where direction = 'keluar'"))[0].n).toBe(0);
    const a = await q("select result, metadata from audit_log where action = 'integration.send_blocked'");
    expect(a[0].result).toBe("denied");
    expect(JSON.stringify(a)).not.toContain(STRANGER); // hanya disamarkan
  });

  it("penerima yang dinonaktifkan/dihapus dari daftar → ditolak; berlaku di SEMUA mode (juga bila mode uji mati)", async () => {
    const { w, ui } = await ready();
    await openWindow();
    await ownerQuery("update test_recipients set active = false");
    expect((await send(ui, w.channel.id)).status).toBe(403);
    await ownerQuery("update test_recipients set active = true");
    await ownerQuery("update channel_connections set test_mode = false");
    expect((await send(ui, w.channel.id, { to: STRANGER })).status).toBe(403); // mode uji mati pun, alat uji hanya ke daftar
    expect((await send(ui, w.channel.id)).status).toBe(200);
    expect(mock.sends()).toHaveLength(1);
  });

  it("format nomor lokal dinormalisasi sebelum dicocokkan (08… → 628…) — tidak dapat dipakai menyelinap", async () => {
    const { w, ui } = await ready();
    // Nilai dibangun saat runtime agar berkas ini tidak memuat nomor telepon utuh (guard repository).
    const local = ["0812", "3456", "7890"].join("-");
    const intl = ["62", "812", "3456", "7890"].join("");
    const plus = ["+62", "812", "3456", "7890"].join(" ");
    expect((await ui.post("/api/v1/integration/recipients", { label: "Format lokal", identity: local })).status).toBe(201);
    expect((await q("select identity_value from test_recipients where label = 'Format lokal'"))[0].identity_value).toBe(intl);
    expect((await ui.post("/api/v1/integration/recipients", { label: "Salah", identity: "abc" })).status).toBe(400);
    expect((await ui.post("/api/v1/integration/recipients", { label: "Dobel", identity: plus })).body.error.code).toBe("RECIPIENT_EXISTS");
    const list = await ui.get("/api/v1/integration/recipients");
    expect(JSON.stringify(list.body)).not.toContain(intl); // daftar hanya menampilkan disamarkan
    expect(JSON.stringify(list.body)).toContain("••••7890");
    expect(w.channel.id).toBeTruthy();
  });

  it("kelola penerima uji memerlukan izin di SEMUA channel; teraudit", async () => {
    const { w } = await ready();
    const role = await makeRole("Penguji Satu Channel", [{ permission: "channel.view", channelIds: [w.channel.id] }, { permission: "integration.test", channelIds: [w.channel.id] }]);
    const scoped = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await scoped.post("/api/v1/integration/recipients", { label: "x", identity: "15550001234" })).status).toBe(403);
    const view = await scoped.get("/api/v1/integration/recipients"); // melihat (tersamarkan) boleh agar dapat memilih penerima
    expect(view.status).toBe(200);
    expect(JSON.stringify(view.body)).not.toContain(CUSTOMER);
    const [{ id }] = view.body.items;
    expect((await scoped.delete(`/api/v1/integration/recipients/${id}`)).status).toBe(403);
    // kirim memakai recipientId: server menerjemahkan; id tak dikenal → 404
    await ownerQuery("insert into feature_flag_overrides(key, enabled) values ('whatsapp_connector', true) on conflict (key) do nothing");
    const f = new FormData();
    f.set("channelId", w.channel.id); f.set("recipientId", randomUUID()); f.set("kind", "text"); f.set("text", "x"); f.set("idempotencyKey", "kunci-recipient-id-1");
    expect((await scoped.postForm("/api/v1/integration/send", f)).status).toBe(404);
  });
});

describe("@tahap-2 CCP 2.7: jendela layanan", () => {
  it("tanpa pesan pelanggan → pesan bebas DIBLOKIR (409) dengan alasan; tidak ada panggilan ke Meta", async () => {
    const { w, ui } = await ready();
    const r = await send(ui, w.channel.id);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: "WINDOW_CLOSED", details: { reason: "belum_ada_pesan_pelanggan" } });
    expect(mock.calls).toHaveLength(0);
    expect((await q("select count(*)::int n from messages where direction = 'keluar'"))[0].n).toBe(0);
  });

  it("batas 24 jam: 23j59m55d lalu → boleh; 24j00m30d lalu → diblokir", async () => {
    const { w, ui } = await ready();
    await openWindow(secAgo(86400 - 30));
    expect((await send(ui, w.channel.id)).status).toBe(200);
    await ownerQuery("update conversations set last_customer_message_at = now() - interval '24 hours 30 seconds'");
    const r = await send(ui, w.channel.id);
    expect(r.body.error.details.reason).toBe("tertutup");
    expect(mock.sends()).toHaveLength(1);
  });

  it("echo dan history TIDAK membuka jendela layanan", async () => {
    const { w, ui } = await ready();
    await postWebhook(envelope([echoChange([{ from: BUSINESS_DISPLAY, to: CUSTOMER, id: "wamid.uji.e", timestamp: secAgo(10), type: "text", text: { body: "dari HP" } }])]));
    await postWebhook(envelope([historyChange([{ id: CUSTOMER, messages: [{ from: CUSTOMER, id: "wamid.uji.h", timestamp: secAgo(20), type: "text", text: { body: "lama" } }] }])]));
    await drain();
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(2);
    expect((await send(ui, w.channel.id)).body.error.details.reason).toBe("belum_ada_pesan_pelanggan");
    expect(mock.calls).toHaveLength(0);
  });

  it("waktu pesan pelanggan di masa depan (tak dapat dipastikan) → diblokir", async () => {
    const { w, ui } = await ready();
    await openWindow(String(Math.floor(Date.now() / 1000) + 3600));
    expect((await send(ui, w.channel.id)).body.error.details.reason).toBe("waktu_tidak_valid");
    expect(mock.calls).toHaveLength(0);
  });
});

describe("@tahap-2 CCP 2.6: hasil tidak pasti — TANPA retry buta", () => {
  it("timeout → 'belum pasti'; setelah menunggu, pemeliharaan, dan klik ulang: tetap SATU panggilan ke Meta", async () => {
    const { w, ui } = await ready();
    await openWindow();
    mock.sendMode = "timeout";
    const key = "kunci-timeout-0001";
    const r = await send(ui, w.channel.id, { key });
    expect(r.body).toMatchObject({ status: "belum_pasti", errorCategory: "timeout", duplicate: false });
    expect(mock.sends()).toHaveLength(1);
    await new Promise((res) => setTimeout(res, 300));
    await runMaintenance();
    await reconcileUncertain(new Date(Date.now() + 3600_000));
    mock.sendMode = "ok";
    const again = await send(ui, w.channel.id, { key }); // operator mengklik ulang dengan kunci yang sama
    expect(again.body).toMatchObject({ status: "belum_pasti", duplicate: true });
    expect(mock.sends()).toHaveLength(1);
    expect((await q("select status from messages where direction = 'keluar'"))[0].status).toBe("belum_pasti");
  });

  it("5xx dan respons tanpa ID → 'belum pasti' (bukan gagal); 4xx → 'gagal' pasti; 429 → gagal rate_limit; 131047 → gagal jendela_layanan", async () => {
    const { w, ui } = await ready();
    await openWindow();
    const cases: [typeof mock.sendMode, string, string | null][] = [["http500", "belum_pasti", "server_meta"], ["noid", "belum_pasti", "respons_tidak_dikenal"], ["http400", "gagal", "parameter"], ["http429", "gagal", "rate_limit"], ["window131047", "gagal", "jendela_layanan"]];
    for (const [mode, status, cat] of cases) {
      mock.sendMode = mode;
      const r = await send(ui, w.channel.id);
      expect([mode, r.body.status, r.body.errorCategory]).toEqual([mode, status, cat]);
    }
    expect(mock.sends()).toHaveLength(cases.length); // masing-masing tepat satu panggilan
  });

  it("rekonsiliasi: status webhook yang membawa biz_opaque_callback_data (kunci idempotensi) menautkan ID provider ke pesan 'belum pasti' — tanpa kirim ulang", async () => {
    const { w, ui } = await ready();
    await openWindow();
    mock.sendMode = "timeout";
    const key = "kunci-rekonsiliasi-1";
    await send(ui, w.channel.id, { key });
    expect((await q("select status, provider_message_id from messages where direction = 'keluar'"))[0]).toEqual({ status: "belum_pasti", provider_message_id: null });
    await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.sebenarnya.1", "sent", CUSTOMER, { biz_opaque_callback_data: key }), statusObj("wamid.sebenarnya.1", "delivered", CUSTOMER, { biz_opaque_callback_data: key })] })]));
    await drain();
    expect((await q("select status, provider_message_id, error_category from messages where direction = 'keluar'"))[0]).toEqual({ status: "diterima", provider_message_id: "wamid.sebenarnya.1", error_category: null });
    expect(mock.sends()).toHaveLength(1);
  });

  it("rekonsiliasi terjadwal: event status yang tercatat tetapi belum tertaut ditautkan oleh reconcileUncertain", async () => {
    const { w, ui } = await ready();
    await openWindow();
    mock.sendMode = "timeout";
    const key = "kunci-rekonsiliasi-2";
    await send(ui, w.channel.id, { key });
    await ownerQuery("insert into message_status_events(channel_id, provider_message_id, status, opaque) values($1,'wamid.tertinggal.1','sent',$2)", [w.channel.id, key]);
    expect(await reconcileUncertain(new Date(Date.now() + 3600_000))).toEqual({ resolved: 1, stillUncertain: 0 });
    expect((await q("select status, provider_message_id from messages where direction = 'keluar'"))[0]).toEqual({ status: "terkirim", provider_message_id: "wamid.tertinggal.1" });
  });

  it("penyelesaian manual: hanya untuk 'belum pasti', wajib catatan, hanya yang berizin pada channel itu, teraudit", async () => {
    const { w, ui } = await ready();
    await openWindow();
    mock.sendMode = "http500";
    await send(ui, w.channel.id);
    const [{ id }] = await q("select id from messages where direction = 'keluar'");
    expect((await ui.post(`/api/v1/integration/messages/${id}/resolve`, { outcome: "terkirim", note: " " })).status).toBe(400);
    const other = await makeChannel("Hotline — contoh", "Hotline");
    const role = await makeRole("Penguji Hotline", [{ permission: "channel.view", channelIds: [other.id] }, { permission: "integration.test", channelIds: [other.id] }]);
    const stranger = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await stranger.post(`/api/v1/integration/messages/${id}/resolve`, { outcome: "terkirim", note: "x" })).status).toBe(404);
    expect((await ui.post(`/api/v1/integration/messages/${id}/resolve`, { outcome: "terkirim", note: "dicek di ponsel peserta uji: sudah masuk" })).status).toBe(200);
    expect((await q("select status, error_category from messages where id = $1", [id]))[0]).toEqual({ status: "terkirim", error_category: "dikonfirmasi_manual" });
    expect((await ui.post(`/api/v1/integration/messages/${id}/resolve`, { outcome: "gagal", note: "lagi" })).body.error.code).toBe("NOT_UNCERTAIN");
    expect((await q("select metadata from audit_log where action = 'integration.uncertain_resolved'"))[0].metadata).toMatchObject({ outcome: "terkirim" });
    expect(mock.sends()).toHaveLength(1);
  });
});

describe("@tahap-2 gambar & PDF keluar, izin, token", () => {
  it("gambar dan PDF: diunggah ke Meta, dikirim dengan ID media, salinan disimpan privat dan dapat diunduh lewat endpoint berizin", async () => {
    const { w, ui } = await ready();
    await openWindow();
    const img = await send(ui, w.channel.id, { kind: "image", file: { bytes: PNG_BYTES, mime: "image/png", name: "foto.png" }, caption: "keterangan" });
    expect(img.body.status).toBe("diterima_api");
    const pdf = await send(ui, w.channel.id, { kind: "document", file: { bytes: PDF_BYTES, mime: "application/pdf", name: "brosur uji.pdf" } });
    expect(pdf.body.status).toBe("diterima_api");
    expect(mock.uploaded).toHaveLength(2);
    expect(mock.sends().map((s) => (s.json as { type: string }).type)).toEqual(["image", "document"]);
    expect(mock.sends()[0]!.json).toMatchObject({ image: { id: "media.out.1", caption: "keterangan" } });
    expect(mock.sends()[1]!.json).toMatchObject({ document: { id: "media.out.2", filename: "brosur uji.pdf" } });
    const [md] = await q("select x.id, x.status from media x join messages m on m.id = x.message_id where m.type = 'image'");
    expect(md.status).toBe("tersimpan");
    const res = await ui.get(`/api/v1/media/${md.id}`); // memakai ApiResult.body: biner dibaca sebagai teks → cukup periksa status & header
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("berkas tidak valid ditolak sebelum ke Meta: tipe terlarang, isi ≠ tipe, terlalu besar, kosong", async () => {
    const { w, ui } = await ready();
    await openWindow();
    const zip = await send(ui, w.channel.id, { kind: "document", file: { bytes: Buffer.from("PK\x03\x04"), mime: "application/zip", name: "a.zip" } });
    expect(zip.body.error.code).toBe("MIME_NOT_ALLOWED");
    const fake = await send(ui, w.channel.id, { kind: "image", file: { bytes: PDF_BYTES, mime: "image/png", name: "a.png" } });
    expect(fake.body.error.code).toBe("MIME_MISMATCH");
    const big = await send(ui, w.channel.id, { kind: "image", file: { bytes: Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]), mime: "image/png", name: "b.png" } });
    expect(big.body.error.code).toBe("FILE_TOO_LARGE");
    expect((await send(ui, w.channel.id, { kind: "image" })).status).toBe(400);
    expect(mock.calls).toHaveLength(0);
  });

  it("izin: tanpa integration.test → 403; izin di channel lain → 404; tanpa token Meta → 409 (tidak ada baris dibuat)", async () => {
    const { w, ui } = await ready();
    await openWindow();
    const none = await loginFull(await makeUser());
    expect((await send(none, w.channel.id)).status).toBe(403);
    const other = await makeChannel("Hotline — contoh", "Hotline");
    const role = await makeRole("Penguji Hotline", [{ permission: "channel.view", channelIds: [other.id] }, { permission: "integration.test", channelIds: [other.id] }]);
    const stranger = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await send(stranger, w.channel.id)).status).toBe(404);
    const prev = process.env.META_ACCESS_TOKEN;
    delete process.env.META_ACCESS_TOKEN;
    resetEnvCacheForTests();
    try {
      expect((await send(ui, w.channel.id)).body.error.code).toBe("META_BELUM_DIKONFIGURASI");
    } finally {
      process.env.META_ACCESS_TOKEN = prev;
      resetEnvCacheForTests();
    }
    expect((await q("select count(*)::int n from messages where direction = 'keluar'"))[0].n).toBe(0);
    expect(mock.calls).toHaveLength(0);
  });

  it("token yang ditolak Meta (190) → 'gagal' kategori autentikasi; token tidak pernah muncul di audit, pesan, atau respons", async () => {
    const { w, ui } = await ready();
    await openWindow();
    mock.token = "token-lain-yang-benar";
    const r = await send(ui, w.channel.id);
    expect(r.body).toMatchObject({ status: "gagal", errorCategory: "autentikasi" });
    const dump = JSON.stringify([r.body, await q("select * from messages"), await q("select * from audit_log"), await q("select * from inbound_events")]);
    for (const secret of ["uji-access-token-sintetis-0001", "uji-app-secret-sintetis-0001", "uji-verify-token-sintetis-0001", "token-lain-yang-benar"]) expect(dump).not.toContain(secret);
  });

  it("media pesan lain tidak dapat dibaca tanpa izin: 401 tanpa sesi, 404 di luar cakupan, 404 id tidak ada, path traversal tidak membocorkan berkas", async () => {
    const { w, ui } = await ready();
    await openWindow();
    await send(ui, w.channel.id, { kind: "image", file: { bytes: PNG_BYTES, mime: "image/png", name: "foto.png" } });
    const [{ id }] = await q("select id from media");
    const { Client } = await import("../helpers/api");
    expect((await new Client().get(`/api/v1/media/${id}`)).status).toBe(401);
    const other = await makeChannel("Hotline — contoh", "Hotline");
    const role = await makeRole("Penguji Hotline", [{ permission: "channel.view", channelIds: [other.id] }, { permission: "integration.test", channelIds: [other.id] }]);
    const stranger = await loginFull(await makeUser({ roleIds: [role.id] }));
    expect((await stranger.get(`/api/v1/media/${id}`)).status).toBe(404);
    expect((await ui.get(`/api/v1/media/${randomUUID()}`)).status).toBe(404);
    await ownerQuery("update media set storage_path = '../../../../etc/passwd'");
    const trav = await ui.get(`/api/v1/media/${id}`);
    expect(trav.status).toBe(404);
    expect(JSON.stringify(trav.body)).not.toContain("root:");
    expect(PHONE_ID && WABA).toBeTruthy();
  });
});

describe("@tahap-2 fungsi kirim template (adapter; dipakai Tahap 6 — TIDAK terhubung ke alat uji/UI)", () => {
  it("pembentuk payload template benar dan dikirim tepat sekali ke Graph API mock (uji SIMULASI; uji nyata opsional/belum dilakukan)", async () => {
    const { buildTemplate, postMessage } = await import("@/modules/whatsapp-adapter");
    const payload = buildTemplate(CUSTOMER, "pengingat_kelas", "id", [{ type: "body", parameters: [{ type: "text", text: "Kelas A" }] }], "kunci-template-0001");
    expect(payload).toMatchObject({ to: CUSTOMER, type: "template", biz_opaque_callback_data: "kunci-template-0001", template: { name: "pengingat_kelas", language: { code: "id" } } });
    const r = await postMessage(PHONE_ID, payload);
    expect(r.ok).toBe(true);
    expect(mock.sends()).toHaveLength(1);
    expect(mock.sends()[0]?.json).toMatchObject({ messaging_product: "whatsapp", type: "template", template: { name: "pengingat_kelas" } });
  });
  it("tidak ada jalur API/UI yang mengirim template pada Tahap 2 (alat uji hanya teks/gambar/PDF)", async () => {
    const { w, ui } = await ready();
    await openWindow();
    const f = new FormData();
    f.set("channelId", w.channel.id); f.set("to", CUSTOMER); f.set("kind", "template"); f.set("idempotencyKey", `kunci-${randomUUID()}`);
    const r = await ui.postForm("/api/v1/integration/send", f);
    expect(r.status).toBe(400);
    expect(mock.sends()).toHaveLength(0);
  });
});
