/**
 * Regresi temuan audit independen Gate 2 (docs/gates/gate-2.md): G2-A01 identitas, G2-A02 waktu/jendela, G2-A03 history→langsung,
 * G2-A04 balapan verifikasi, G2-A05 label bukti koneksi, G2-A06 `diproses` tertahan. Semua SIMULASI (mock Graph + fixture sintetis).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { detachIdentity } from "@/modules/contacts/service";
import {
  AUTOMATION_MAX_AGE_MS, expireStaleProcessing, ingestEvent, onCustomerMessage, processInboundBatch, reconcileUncertain,
} from "@/modules/conversations-messages";
import { computeReadiness, contactMatchesMessage, normalizePayload, storeEvents, type NormalizedEvent } from "@/modules/whatsapp-adapter";
import { MockGraph } from "../helpers/mock-graph";
import type { Client } from "../helpers/api";
import { ownerQuery, resetDb } from "../helpers/db";
import { loginFull, makeChannel } from "../helpers/fixtures";
import {
  CUSTOMER, PDF_BYTES, PHONE_ID, PNG_BYTES, WABA, envelope, historyChange, messagesChange, postWebhook, secAgo, statusObj, world,
} from "../helpers/whatsapp";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const drain = async () => { for (;;) { const r = await processInboundBatch({ limit: 50 }); if (!r.claimed) return; } };
const live = (m: Record<string, unknown>[], contacts?: Record<string, unknown>[]) => envelope([messagesChange({ messages: m, ...(contacts ? { contacts } : {}) })]);
const spy = () => { const seen: string[] = []; const off = onCustomerMessage((e) => { seen.push(e.messageId); }); return { seen, off }; };
const hist = (msgs: Record<string, unknown>[]) => envelope([historyChange([{ id: CUSTOMER, messages: msgs.map((m) => ({ ...m, history_context: { status: "READ" } })) }])]);
const rawMsg = (id: string, from: string, ts: unknown): Record<string, unknown> => ({ from, id, ...(ts === undefined ? {} : { timestamp: ts }), type: "text", text: { body: "uji" } });

// Identitas sintetis tambahan (bukan nomor Indonesia; tidak ada di daftar penerima uji kecuali ditambahkan).
const A = CUSTOMER, B = "15550002002", C = "15550003003";

async function ready() { const w = await world(); const ui = await loginFull(w.user); return { w, ui }; }
async function send(c: Client, channelId: string, o: { kind?: "text" | "image"; key?: string; to?: string } = {}) {
  const f = new FormData();
  f.set("channelId", channelId); f.set("to", o.to ?? A); f.set("kind", o.kind ?? "text"); f.set("idempotencyKey", o.key ?? `kunci-${randomUUID()}`);
  if ((o.kind ?? "text") === "text") f.set("text", "balasan uji"); else f.set("file", new File([PNG_BYTES as BlobPart], "x.png", { type: "image/png" }));
  return c.postForm("/api/v1/integration/send", f);
}

// ═════════════ G2-A01 — identitas dua pelanggan tidak boleh tercampur ═════════════
describe("@tahap-2 G2-A01 identitas: hanya digabung bila terbukti dari payload", () => {
  it("normalizer: entri contacts yang TIDAK cocok dengan pengirim tidak dipakai (tanpa fallback ke contacts[0]); ambigu/bertentangan ditolak", () => {
    const ev = (contacts: unknown[], msg: Record<string, unknown>) =>
      normalizePayload(envelope([{ field: "messages", value: { metadata: { phone_number_id: PHONE_ID }, contacts, messages: [msg] } }]))[0] as Extract<NormalizedEvent, { kind: "message" }>;
    // kasus audit: from=A, satu-satunya entri = B (wa_id B, user_id B)
    expect(ev([{ wa_id: B, user_id: B, profile: { name: "Orang B" } }], rawMsg("m1", A, "1700000000")).contact).toBeNull();
    // cocok lewat wa_id → entri itu (dengan user_id & nama miliknya)
    expect(ev([{ wa_id: B, user_id: "UB" }, { wa_id: A, user_id: "UA", profile: { name: "Orang A" } }], rawMsg("m2", A, "1700000000")).contact).toEqual({ waId: A, userId: "UA", name: "Orang A" });
    // cocok lewat user_id pesan (tanpa from)
    expect(ev([{ wa_id: B, user_id: "UB" }, { wa_id: A, user_id: "UA" }], { ...rawMsg("m3", "", "1700000000"), user_id: "UA" }).contact).toMatchObject({ waId: A, userId: "UA" });
    // bertentangan: wa_id cocok tetapi user_id entri ≠ user_id pesan → ditolak
    expect(ev([{ wa_id: A, user_id: "UX" }], { ...rawMsg("m4", A, "1700000000"), user_id: "UY" }).contact).toBeNull();
    // ambigu: dua entri berbeda sama-sama cocok → tidak ada yang dipakai
    expect(ev([{ wa_id: A, user_id: "U1" }, { wa_id: A, user_id: "U2" }], rawMsg("m5", A, "1700000000")).contact).toBeNull();
    // tanpa contacts sama sekali (kontak hilang)
    expect(ev([], rawMsg("m6", A, "1700000000")).contact).toBeNull();
    expect(contactMatchesMessage({ from: A, userId: null }, { waId: B, userId: null, name: null })).toBe(false);
  });

  it("kasus audit end-to-end: from=A, contacts hanya B → kontak A tanpa identitas B; B tidak tersimpan di mana pun", async () => {
    await world();
    await postWebhook(live([rawMsg("wamid.uji.a01a", A, secAgo(5))], [{ wa_id: B, user_id: B, profile: { name: "Orang B" } }]));
    await drain();
    expect(await q("select identity_type, identity_value from contact_identities order by identity_type")).toEqual([{ identity_type: "wa_id", identity_value: A }]);
    expect((await q("select display_name from contacts"))[0].display_name).toBeNull(); // nama dari entri B TIDAK dipakai
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(1);
  });

  it("multi-kontak dalam satu payload: tiap pesan hanya pada kontaknya sendiri (identitas & nama tidak tertukar)", async () => {
    const w = await world();
    await ownerQuery("insert into test_recipients(label, identity_value) values ('B', $1), ('C', $2)", [B, C]);
    await postWebhook(live(
      [rawMsg("wamid.uji.a01b1", A, secAgo(9)), { ...rawMsg("wamid.uji.a01b2", B, secAgo(8)), user_id: "UB" }, rawMsg("wamid.uji.a01b3", C, secAgo(7))],
      [{ wa_id: C, profile: { name: "Orang C" } }, { wa_id: B, user_id: "UB", profile: { name: "Orang B" } }, { wa_id: A, profile: { name: "Orang A" } }],
    ));
    await drain();
    const rows = await q(`select c.display_name, array_agg(i.identity_type || ':' || i.identity_value order by i.identity_type) ids from contacts c join contact_identities i on i.contact_id = c.id group by c.id, c.display_name order by c.display_name`);
    expect(rows).toEqual([
      { display_name: "Orang A", ids: [`wa_id:${A}`] },
      { display_name: "Orang B", ids: [`user_id:UB`, `wa_id:${B}`] },
      { display_name: "Orang C", ids: [`wa_id:${C}`] },
    ]);
    expect((await q("select count(*)::int n from conversations where channel_id = $1", [w.channel.id]))[0].n).toBe(3);
  });

  it("identitas bentrok: wa_id → kontak X, user_id → kontak Y → KARANTINA 'identitas_bentrok'; tidak ada pesan/identitas baru; X dan Y utuh; payload dipertahankan; diaudit", async () => {
    const w = await world();
    await postWebhook(live([rawMsg("wamid.uji.x", A, secAgo(30))]));
    await drain(); // kontak X (wa_id A)
    const [y] = await q("insert into contacts(display_name) values ('Y') returning id");
    await ownerQuery("insert into contact_identities(contact_id, provider, identity_type, identity_value) values ($1,'whatsapp','user_id','UY')", [y.id]);
    const before = await q("select count(*)::int n from messages");
    const s = spy();
    await postWebhook(live([{ ...rawMsg("wamid.uji.bentrok", A, secAgo(5)), user_id: "UY" }]));
    await drain();
    s.off();
    const ev = (await q("select status, quarantine_reason, payload is not null as has_payload from inbound_events where event_key = 'msg:wamid.uji.bentrok'"))[0];
    expect(ev).toEqual({ status: "quarantined", quarantine_reason: "identitas_bentrok", has_payload: true });
    expect((await q("select count(*)::int n from messages"))).toEqual(before);
    expect((await q("select identity_type, identity_value from contact_identities order by identity_value")).length).toBe(2); // A (X) dan UY (Y) — tidak ada tautan baru
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(2);
    expect(s.seen).toEqual([]);
    // audit_log append-only (tidak ikut di-reset antar test) → selalu disaring per objek
    expect((await q("select result from audit_log where action = 'integration.identity_conflict' and object_id = $1", [w.channel.id])).map((r) => r.result)).toEqual(["denied"]);
    expect(JSON.stringify(await q("select metadata from audit_log where action = 'integration.identity_conflict' and object_id = $1", [w.channel.id]))).not.toContain(A); // tanpa nomor di audit
  });

  it("user_id sudah milik kontak yang sama dengan wa_id → ditautkan normal (bukan konflik); pengirim berbeda channel = kontak sama, percakapan berbeda", async () => {
    const w = await world();
    await postWebhook(live([{ ...rawMsg("wamid.uji.u1", A, secAgo(20)), user_id: "UA" }]));
    await postWebhook(live([{ ...rawMsg("wamid.uji.u2", A, secAgo(10)), user_id: "UA" }]));
    await drain();
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(1);
    expect((await q("select count(*)::int n from contact_identities"))[0].n).toBe(2);
    // channel kedua dengan kasus audit (contacts hanya B) → tetap kontak A yang sama, tanpa B
    const ch2 = await makeChannel("Hotline — contoh", "Hotline");
    await ownerQuery("insert into channel_connections(channel_id, waba_id, phone_number_id) values ($1,'100000000000002','200000000000002')", [ch2.id]);
    await postWebhook(envelope([messagesChange({ phoneId: "200000000000002", messages: [rawMsg("wamid.uji.u3", A, secAgo(5))], contacts: [{ wa_id: B, user_id: B }] })], "100000000000002"));
    await drain();
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(1);
    expect((await q("select count(*)::int n from conversations"))[0].n).toBe(2);
    expect((await q("select count(*)::int n from contact_identities where identity_value = $1", [B]))[0].n).toBe(0);
    expect(w.channel.id).not.toBe(ch2.id);
  });

  it("event LAMA di antrean (dinormalisasi sebelum perbaikan, contact tak terbukti) divalidasi ulang saat diproses", async () => {
    await world();
    const stale: NormalizedEvent = {
      kind: "message", eventKey: "msg:wamid.uji.lama", meta: { phoneNumberId: PHONE_ID, wabaId: WABA, displayPhone: null }, providerTs: new Date().toISOString(),
      contact: { waId: B, userId: "UB", name: "Orang B" }, // entri contoh versi lama: contacts[0]
      message: { id: "wamid.uji.lama", from: A, userId: null, ts: new Date().toISOString(), type: "text", rawType: "text", text: "hai", media: null, referral: null },
    };
    await storeEvents([stale]);
    await drain();
    expect(await q("select identity_value from contact_identities")).toEqual([{ identity_value: A }]);
    expect((await q("select display_name from contacts"))[0].display_name).toBeNull();
  });

  it("pemulihan terkontrol: detachIdentity memindahkan SATU identitas ke kontak baru; menolak identitas tunggal; percakapan lama tetap pada kontak asal", async () => {
    await world();
    await postWebhook(live([{ ...rawMsg("wamid.uji.rec", A, secAgo(5)), user_id: "UKELIRU" }]));
    await drain();
    const [{ id: wrongId }] = await q("select id from contact_identities where identity_type = 'user_id'");
    const out = await getDb().transaction((tx) => detachIdentity(tx, wrongId));
    expect(out.oldContactId).not.toBe(out.newContactId);
    expect((await q("select contact_id from contact_identities where id = $1", [wrongId]))[0].contact_id).toBe(out.newContactId);
    expect((await q("select count(*)::int n from conversations where contact_id = $1", [out.oldContactId]))[0].n).toBe(1); // batasan jujur: pesan tidak ikut terpisah
    const [{ id: lastId }] = await q("select id from contact_identities where contact_id = $1", [out.oldContactId]);
    await expect(getDb().transaction((tx) => detachIdentity(tx, lastId))).rejects.toThrow("identitas_satu_satunya_pada_kontak");
    await expect(getDb().transaction((tx) => detachIdentity(tx, randomUUID()))).rejects.toThrow("identitas_tidak_ditemukan");
  });
});

// ═════════════ G2-A02 — jendela layanan hanya dari bukti waktu pesan ═════════════
describe("@tahap-2 G2-A02 waktu pesan: kedatangan ≠ waktu pesan", () => {
  for (const [nama, ts] of [["tanpa timestamp", undefined], ["timestamp kosong", ""], ["timestamp rusak", "bukan-angka"], ["timestamp di masa depan (+2 jam)", String(Math.floor(Date.now() / 1000) + 7200)]] as const) {
    it(`${nama} → pesan tersimpan, TETAPI dasar jendela tidak diperbarui, kirim bebas diblokir, tidak memicu otomatisasi`, async () => {
      const { w, ui } = await ready();
      const s = spy();
      await postWebhook(live([rawMsg("wamid.uji.ts", A, ts)]));
      await drain();
      s.off();
      expect((await q("select count(*)::int n from messages"))[0].n).toBe(1);
      expect((await q("select received_at is not null as r from messages"))[0].r).toBe(true); // waktu diterima TERPISAH dari waktu pesan
      const c = (await q("select last_customer_message_at, last_message_at from conversations"))[0];
      expect(c.last_customer_message_at).toBeNull();
      expect(c.last_message_at).not.toBeNull(); // urutan tampilan memakai waktu kedatangan
      expect(s.seen).toEqual([]);
      const r = await send(ui, w.channel.id);
      expect(r.status).toBe(409);
      expect(r.body.error.details.reason).toBe("belum_ada_pesan_pelanggan");
      expect(mock.calls).toHaveLength(0);
    });
  }

  it("pengiriman ulang tertunda >24 jam (cap waktu lama yang sah): tersimpan, jendela TETAP tertutup, tidak memicu otomatisasi", async () => {
    const { w, ui } = await ready();
    const s = spy();
    await postWebhook(live([rawMsg("wamid.uji.lama24", A, secAgo(30 * 3600))]));
    await drain();
    s.off();
    expect((await send(ui, w.channel.id)).body.error.details.reason).toBe("tertutup");
    expect(s.seen).toEqual([]);
    // pesan segar berikutnya membuka jendela
    await postWebhook(live([rawMsg("wamid.uji.segar", A, secAgo(20))]));
    await drain();
    expect((await send(ui, w.channel.id)).status).toBe(200);
  });

  it("pesan tanpa bukti waktu TIDAK memperpanjang jendela yang sudah ada", async () => {
    await world();
    const old = secAgo(23 * 3600);
    await postWebhook(live([rawMsg("wamid.uji.p1", A, old)]));
    await postWebhook(live([rawMsg("wamid.uji.p2", A, undefined)])); // tak terbukti
    await drain();
    expect(Math.floor(new Date((await q("select last_customer_message_at t from conversations"))[0].t).getTime() / 1000)).toBe(Number(old));
  });

  it("jendela DIPERIKSA ULANG tepat sebelum kirim: tertutup saat unggah media berjalan → gagal PASTI (jendela_layanan), tidak ada panggilan kirim", async () => {
    const { w, ui } = await ready();
    await postWebhook(live([rawMsg("wamid.uji.jw", A, secAgo(86400 - 60))])); // tersisa ±60 dtk
    await drain();
    const release = mock.hold("upload");
    const pending = send(ui, w.channel.id, { kind: "image" });
    await mock.waitFor(() => mock.calls.some((c) => c.path.endsWith("/media")));
    await ownerQuery("update conversations set last_customer_message_at = now() - interval '25 hours'"); // jendela tertutup selama proses
    release();
    const r = await pending;
    expect(r.body).toMatchObject({ status: "gagal", errorCategory: "jendela_layanan" });
    expect(mock.sends()).toHaveLength(0);
    const [{ id: mid }] = await q("select id from messages where direction = 'keluar'");
    expect((await q("select metadata from audit_log where action = 'integration.send_blocked' and object_id = $1", [mid]))[0].metadata).toMatchObject({ stage: "sebelum_kirim" });
  });
});

// ═════════════ G2-A03 — history→langsung: pembaruan data ≠ kelayakan otomatisasi ═════════════
describe("@tahap-2 G2-A03 history↔langsung: kelayakan dari bukti waktu, bukan urutan kedatangan", () => {
  it("history → langsung BARU (cap waktu segar): data diperbarui, jendela terbuka, hook TEPAT sekali; langsung berulang tidak memicu lagi", async () => {
    await world();
    const s = spy();
    const ts = secAgo(60);
    await postWebhook(hist([rawMsg("wamid.uji.hb", A, ts)]));
    await drain();
    expect((await q("select last_customer_message_at from conversations"))[0].last_customer_message_at).toBeNull(); // history: tidak membuka jendela
    await postWebhook(live([rawMsg("wamid.uji.hb", A, ts)]));
    await drain();
    await postWebhook(live([rawMsg("wamid.uji.hb", A, ts)])); // duplikat langsung
    await drain();
    s.off();
    expect((await q("select source, is_history from messages"))).toEqual([{ source: "pelanggan", is_history: false }]);
    expect(Math.floor(new Date((await q("select last_customer_message_at t from conversations"))[0].t).getTime() / 1000)).toBe(Number(ts));
    expect(s.seen).toHaveLength(1);
  });

  it("history → langsung LAMA (3 hari): data diperbarui tetapi jendela TETAP tertutup dan hook TIDAK dipicu", async () => {
    const { w, ui } = await ready();
    const s = spy();
    const ts = secAgo(3 * 86400);
    await postWebhook(hist([rawMsg("wamid.uji.hl", A, ts)]));
    await drain();
    await postWebhook(live([rawMsg("wamid.uji.hl", A, ts)]));
    await drain();
    s.off();
    expect((await q("select source, is_history from messages"))[0]).toEqual({ source: "pelanggan", is_history: false });
    expect(s.seen).toEqual([]);
    expect((await send(ui, w.channel.id)).body.error.details.reason).toBe("tertutup");
  });

  it("history → langsung TANPA cap waktu: tidak memicu hook dan tidak membuka jendela", async () => {
    await world();
    const s = spy();
    await postWebhook(hist([rawMsg("wamid.uji.hn", A, secAgo(30))]));
    await drain();
    await postWebhook(live([rawMsg("wamid.uji.hn", A, undefined)]));
    await drain();
    s.off();
    expect(s.seen).toEqual([]);
    expect((await q("select last_customer_message_at from conversations"))[0].last_customer_message_at).toBeNull();
  });

  it("langsung → history: salinan history tidak mengubah apa pun dan tidak memicu hook kedua", async () => {
    await world();
    const s = spy();
    await postWebhook(live([rawMsg("wamid.uji.lh", A, secAgo(30))]));
    await drain();
    await postWebhook(hist([rawMsg("wamid.uji.lh", A, secAgo(30))]));
    await drain();
    s.off();
    expect(s.seen).toHaveLength(1);
    expect((await q("select source, is_history from messages"))).toEqual([{ source: "pelanggan", is_history: false }]);
  });

  it(`pesan langsung yang SANGAT terlambat (> ${AUTOMATION_MAX_AGE_MS / 60000} menit setelah dibuat): tersimpan dan jendela terbuka, tetapi TIDAK layak otomatisasi`, async () => {
    const { w, ui } = await ready();
    const s = spy();
    await postWebhook(live([rawMsg("wamid.uji.terlambat", A, secAgo(3600))]));
    await drain();
    s.off();
    expect(s.seen).toEqual([]);
    expect((await send(ui, w.channel.id)).status).toBe(200); // jendela benar-benar terbuka (waktu pesan terbukti 1 jam lalu)
  });

  it("webhook terlambat + duplikat setelah 'restart' (diproses ulang): hook tetap sekali; pemrosesan ulang event yang sama tidak menggandakan", async () => {
    await world();
    const s = spy();
    const raw = live([rawMsg("wamid.uji.restart", A, secAgo(20))]);
    await postWebhook(raw);
    await drain();
    await postWebhook(raw); // Meta mengirim ulang setelah restart
    await ownerQuery("update inbound_events set status = 'pending', processed_at = null"); // simulasi: penanda hilang saat crash
    await drain();
    s.off();
    expect(s.seen).toHaveLength(1);
    expect((await q("select count(*)::int n from messages"))[0].n).toBe(1);
  });

  it("ingest langsung dua kali (transaksi terpisah) → efek samping sekali (kunci unik, bukan urutan)", async () => {
    await world();
    const ev = normalizePayload(live([rawMsg("wamid.uji.dua", A, secAgo(10))]))[0] as NormalizedEvent;
    await storeEvents([ev]);
    const [row] = await q("select id, channel_id from inbound_events");
    const claimed = { id: row.id, channelId: row.channel_id, payload: ev } as unknown as Parameters<typeof ingestEvent>[1];
    const o1 = await getDb().transaction((tx) => ingestEvent(tx, claimed));
    const o2 = await getDb().transaction((tx) => ingestEvent(tx, claimed));
    expect(o1.kind === "processed" && o1.after.length).toBeGreaterThan(0);
    expect(o2.kind === "processed" && o2.after.length).toBe(0);
  });
});

// ═════════════ G2-A04 — balapan verifikasi koneksi ═════════════
describe("@tahap-2 G2-A04 verifikasi koneksi: hasil tidak boleh dicatat pada pemetaan yang sudah berubah", () => {
  const meta = (phone = PHONE_ID, waba = WABA) => { mock.phones.set(phone, { display: "15550000001", name: "Contoh Bisnis" }); mock.wabas.set(waba, [phone]); mock.subscribed.add(waba); };
  async function conn() {
    await ownerQuery("update feature_flag_overrides set enabled = true where key = 'whatsapp_connector'").catch(() => undefined);
    const w = await world();
    await ownerQuery("delete from channel_connections"); // mulai dari pemetaan kosong; diatur lewat API
    const ui = await loginFull(w.user);
    return { w, ui };
  }
  const put = (ui: Client, id: string, phone: string, waba = WABA) => ui.put(`/api/v1/channels/${id}/connection`, { wabaId: waba, phoneNumberId: phone });

  it("pemetaan diubah A→B SAAT verifikasi A berjalan → hasil A dibuang (409 MAPPING_CHANGED); baris B tetap 'belum diperiksa'", async () => {
    const { w, ui } = await conn();
    const A_PHONE = "200000000000011", B_PHONE = "200000000000022";
    meta(A_PHONE); meta(B_PHONE);
    await put(ui, w.channel.id, A_PHONE);
    const release = mock.hold("phone");
    const verifying = ui.post(`/api/v1/channels/${w.channel.id}/connection/verify`);
    await mock.waitFor(() => mock.calls.some((c) => c.path.endsWith(`/${A_PHONE}`)));
    expect((await put(ui, w.channel.id, B_PHONE)).status).toBe(200); // pemetaan B tersimpan selama A diperiksa
    release();
    const r = await verifying;
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("MAPPING_CHANGED");
    expect((await q("select phone_number_id, verification_status, verified_at, mapping_version from channel_connections"))[0]).toEqual({ phone_number_id: B_PHONE, verification_status: "belum_diperiksa", verified_at: null, mapping_version: 1 });
    expect((await q("select result, metadata from audit_log where action = 'integration.connection_verified' and object_id = $1 order by id", [w.channel.id]))[0]).toMatchObject({ result: "denied", metadata: { stale: true } });
    // pemeriksaan ulang terhadap B berhasil dan mencatat B
    const again = await ui.post(`/api/v1/channels/${w.channel.id}/connection/verify`);
    expect(again.body.verified).toBe(true);
    expect((await q("select phone_number_id, verification_status from channel_connections"))[0]).toEqual({ phone_number_id: B_PHONE, verification_status: "terverifikasi" });
  });

  it("menyimpan pemetaan YANG SAMA saat verifikasi berjalan tidak menaikkan versi → hasil tetap dicatat; perubahan nyata menaikkan versi", async () => {
    const { w, ui } = await conn();
    meta();
    await put(ui, w.channel.id, PHONE_ID);
    const release = mock.hold("phone");
    const verifying = ui.post(`/api/v1/channels/${w.channel.id}/connection/verify`);
    await mock.waitFor(() => mock.calls.some((c) => c.path.endsWith(`/${PHONE_ID}`)));
    await put(ui, w.channel.id, PHONE_ID); // sama persis
    release();
    expect((await verifying).body.verified).toBe(true);
    expect((await q("select verification_status, mapping_version from channel_connections"))[0]).toEqual({ verification_status: "terverifikasi", mapping_version: 0 });
  });

  it("dua verifikasi bersamaan pada pemetaan yang sama → keduanya sah; tidak ada yang merusak status", async () => {
    const { w, ui } = await conn();
    meta();
    await put(ui, w.channel.id, PHONE_ID);
    const [r1, r2] = await Promise.all([ui.post(`/api/v1/channels/${w.channel.id}/connection/verify`), ui.post(`/api/v1/channels/${w.channel.id}/connection/verify`)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect((await q("select verification_status from channel_connections"))[0].verification_status).toBe("terverifikasi");
  });
});

// ═════════════ G2-A05 — status bukti koneksi terpisah ═════════════
describe("@tahap-2 G2-A05 bukti koneksi: pemetaan ≠ langganan aplikasi ≠ event diterima", () => {
  const meta = () => { mock.phones.set(PHONE_ID, { display: "15550000001", name: "Contoh Bisnis" }); mock.wabas.set(WABA, [PHONE_ID]); mock.subscribed.add(WABA); };
  async function verified() { const w = await world(); const ui = await loginFull(w.user); meta(); const r = await ui.post(`/api/v1/channels/${w.channel.id}/connection/verify`); return { w, ui, r }; }
  const view = async (ui: Client, id: string) => (await ui.get(`/api/v1/channels/${id}/connection`)).body;

  it("keadaan langganan: terkonfirmasi · aplikasi lain · ada tapi tak dipastikan (tanpa META_APP_ID) · tidak berlangganan · tidak diketahui", async () => {
    const w = await world(); const ui = await loginFull(w.user);
    const state = async () => (await ui.post(`/api/v1/channels/${w.channel.id}/connection/verify`)).body.detail.subscription.state;
    meta();
    expect(await state()).toBe("terkonfirmasi");
    mock.appId = "999999999999"; expect(await state()).toBe("aplikasi_lain");
    mock.appId = "300000000000001";
    const prev = process.env.META_APP_ID; delete process.env.META_APP_ID; resetEnvCacheForTests();
    try { expect(await state()).toBe("ada_aplikasi_tidak_dipastikan"); } finally { process.env.META_APP_ID = prev; resetEnvCacheForTests(); }
    mock.subscribed.clear(); expect(await state()).toBe("tidak_berlangganan");
    meta(); mock.subscribedStatus = 500; expect(await state()).toBe("tidak_diketahui");
  });

  it("pemetaan terverifikasi (simulasi) + langganan terkonfirmasi TIDAK cukup: 'siap menerima' tetap belum terbukti dan alasannya disebut", async () => {
    const { w, ui } = await verified();
    const v = await view(ui, w.channel.id);
    expect(v.verificationStatus).toBe("terverifikasi");
    expect(v.readiness.state).toBe("belum_terbukti");
    expect(v.readiness.missing.join(" ")).toMatch(/SIMULASI/);
    expect(v.readiness.missing.join(" ")).toMatch(/event/i);
    expect(v.readiness.subscription).toBe("terkonfirmasi");
  });

  it("event benar-benar diterima dicatat sebagai bukti terpisah; mengubah pemetaan menghapus bukti lama", async () => {
    const { w, ui } = await verified();
    expect((await view(ui, w.channel.id)).readiness.lastEventAt).toBeNull();
    await postWebhook(live([rawMsg("wamid.uji.ev", A, secAgo(5))]));
    await drain();
    expect((await view(ui, w.channel.id)).readiness.lastEventAt).not.toBeNull();
    await ui.put(`/api/v1/channels/${w.channel.id}/connection`, { wabaId: WABA, phoneNumberId: "200000000000099" });
    const after = await view(ui, w.channel.id);
    expect(after.readiness.lastEventAt).toBeNull(); // event dari pemetaan sebelumnya tidak dihitung
    expect(after.verificationStatus).toBe("belum_diperiksa");
  });

  it("computeReadiness: 'siap' HANYA bila pemetaan NYATA + langganan terkonfirmasi + event diterima; kekurangan mana pun → belum terbukti", () => {
    const ok = { verificationStatus: "terverifikasi", verificationMode: "nyata", verificationDetail: { subscription: { state: "terkonfirmasi" } } };
    const now = new Date();
    expect(computeReadiness(ok, now)).toMatchObject({ state: "siap_menerima", missing: [] });
    expect(computeReadiness(ok, null).state).toBe("belum_terbukti");
    expect(computeReadiness({ ...ok, verificationMode: "simulasi" }, now).state).toBe("belum_terbukti");
    expect(computeReadiness({ ...ok, verificationStatus: "gagal" }, now).state).toBe("belum_terbukti");
    for (const s of ["aplikasi_lain", "ada_aplikasi_tidak_dipastikan", "tidak_berlangganan", "tidak_diketahui"]) expect(computeReadiness({ ...ok, verificationDetail: { subscription: { state: s } } }, now).state, s).toBe("belum_terbukti");
    expect(computeReadiness({ ...ok, verificationDetail: {} }, now).missing.join(" ")).toMatch(/belum diperiksa/);
  });
});

// ═════════════ G2-A06 — `diproses` tertahan ═════════════
describe("@tahap-2 G2-A06 pesan keluar `diproses` yang tertahan (proses mati) → 'belum pasti', tanpa retry buta", () => {
  async function stuck(ageSec: number, key = `kunci-${randomUUID()}`) {
    const w = await world();
    const ui = await loginFull(w.user);
    const [{ id: contactId }] = await q("insert into contacts(display_name) values ('x') returning id");
    const [{ id: convId }] = await q("insert into conversations(contact_id, channel_id) values ($1,$2) returning id", [contactId, w.channel.id]);
    const [{ id }] = await q(`insert into messages(conversation_id, channel_id, direction, source, type, body, status, idempotency_key, received_at) values ($1,$2,'keluar','te_one','text','x','diproses',$3, now() - ($4 || ' seconds')::interval) returning id`, [convId, w.channel.id, key, String(ageSec)]);
    return { w, ui, id, key };
  }

  it("crash SEBELUM panggilan Meta: lewat ambang → belum_pasti (proses_terhenti), teraudit, 0 panggilan ke Meta; dapat diselesaikan manual", async () => {
    const { ui, id } = await stuck(3600);
    expect(await expireStaleProcessing()).toBe(1);
    expect((await q("select status, error_category from messages where id = $1", [id]))[0]).toEqual({ status: "belum_pasti", error_category: "proses_terhenti" });
    expect((await q("select action from audit_log where action = 'integration.processing_expired' and object_id = $1", [id])).length).toBe(1);
    expect(mock.sends()).toHaveLength(0); // TIDAK ADA retry
    expect((await ui.post(`/api/v1/integration/messages/${id}/resolve`, { outcome: "gagal", note: "dicek di ponsel: tidak masuk" })).status).toBe(200);
    expect((await q("select status from messages where id = $1", [id]))[0].status).toBe("gagal");
  });

  it("yang masih baru (di bawah ambang) tidak disentuh", async () => {
    const { id } = await stuck(5);
    expect(await expireStaleProcessing()).toBe(0);
    expect((await q("select status from messages where id = $1", [id]))[0].status).toBe("diproses");
  });

  it("crash SESUDAH Meta menerima: status webhook membawa kunci idempotensi → tertaut; juga bila penyapu sudah menandai belum_pasti lebih dulu", async () => {
    const a = await stuck(3600, "kunci-sesudah-1");
    await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.uji.sesudah1", "sent", A, { biz_opaque_callback_data: "kunci-sesudah-1" })] })]));
    await drain();
    expect((await q("select status, provider_message_id from messages where id = $1", [a.id]))[0]).toMatchObject({ status: "terkirim", provider_message_id: "wamid.uji.sesudah1" });
    expect(await expireStaleProcessing()).toBe(0); // sudah bukan 'diproses'
    // urutan terbalik
    await resetDb();
    const b = await stuck(3600, "kunci-sesudah-2");
    expect(await expireStaleProcessing()).toBe(1);
    await postWebhook(envelope([messagesChange({ statuses: [statusObj("wamid.uji.sesudah2", "delivered", A, { biz_opaque_callback_data: "kunci-sesudah-2" })] })]));
    await drain();
    expect((await q("select status, provider_message_id, error_category from messages where id = $1", [b.id]))[0]).toEqual({ status: "diterima", provider_message_id: "wamid.uji.sesudah2", error_category: null });
  });

  it("dua pekerja bersamaan: setiap pesan ditandai dan diaudit TEPAT sekali", async () => {
    const { id } = await stuck(3600);
    const [x, y] = await Promise.all([expireStaleProcessing(), expireStaleProcessing()]);
    expect(x + y).toBe(1);
    expect((await q("select count(*)::int n from audit_log where action = 'integration.processing_expired' and object_id = $1", [id]))[0].n).toBe(1);
  });

  it("reconcileUncertain ikut menyapu (jalur pemeliharaan worker)", async () => {
    await stuck(3600);
    expect(await reconcileUncertain()).toMatchObject({ expired: 1 });
  });

  it("pengirim yang LAMBAT (bukan mati) menyelesaikan SETELAH disapu: hasil pasti tidak hilang (diterima_api + ID), tetap SATU panggilan", async () => {
    const { w, ui } = await ready();
    await postWebhook(live([rawMsg("wamid.uji.lambat", A, secAgo(30))]));
    await drain();
    const release = mock.hold("send");
    const pending = send(ui, w.channel.id);
    await mock.waitFor(() => mock.calls.some((c) => c.method === "POST" && c.path.endsWith("/messages")));
    await ownerQuery("update messages set received_at = now() - interval '1 hour' where direction = 'keluar'");
    expect(await expireStaleProcessing()).toBe(1); // dianggap tertahan
    release();
    const r = await pending;
    expect(r.body).toMatchObject({ status: "diterima_api", errorCategory: null });
    expect((await q("select status, provider_message_id from messages where direction = 'keluar'"))[0]).toEqual({ status: "diterima_api", provider_message_id: "wamid.mock.1" });
    expect(mock.sends()).toHaveLength(1);
  });

  it("kontrol: PDF/gambar tidak mengubah perilaku (fixture tersedia)", () => {
    expect([PDF_BYTES.length, PNG_BYTES.length].every((n) => n > 0)).toBe(true);
  });
});
