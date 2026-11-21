/** Tahap 3 — Inbox: visibilitas per channel (CCP 3.1), pencarian/filter/jumlah, belum dibaca (D-16), history, media, umpan perubahan. SIMULASI. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { resetAccessCacheForTests } from "@/modules/conversations-messages";
import { MockGraph } from "../helpers/mock-graph";
import { ownerQuery, resetDb } from "../helpers/db";
import { addUserGrant, setRoles } from "../helpers/fixtures";
import { CUSTOMER2, CUSTOMER3, PHONE_ADM, PHONE_HOT, convId, enableFlag, inbound, inboxWorld, makeTeam } from "../helpers/inbox";
import { BUSINESS_DISPLAY, CUSTOMER, PNG_BYTES, WABA, echoChange, envelope, historyChange, imageMsg, messagesChange, postWebhook, secAgo, textMsg } from "../helpers/whatsapp";
import { drain } from "../helpers/inbox";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); resetAccessCacheForTests(); });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const list = async (c: { get: (p: string) => Promise<{ status: number; body: any }> }, qs = "") => (await c.get(`/api/v1/inbox/conversations${qs}`)); // eslint-disable-line @typescript-eslint/no-explicit-any

describe("@tahap-3 CCP 3.1 visibilitas per channel: daftar, jumlah, pencarian, filter, navigasi", () => {
  it("daftar, total, dan navigasi hanya memuat channel yang berizin; channel lain TIDAK bocor di mana pun", async () => {
    const w = await inboxWorld();
    await inbound({ phone: PHONE_ADM, from: CUSTOMER, text: "tanya admisi", name: "Budi Admisi" });
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "keluhan hotline", name: "Citra Hotline" });
    const a = await w.login(w.adminA), b = await w.login(w.adminB);
    const la = await list(a);
    expect(la.status).toBe(200);
    expect(la.body.total).toBe(1);
    expect(la.body.items.map((i: { channelName: string }) => i.channelName)).toEqual(["Admisi — contoh"]);
    expect(JSON.stringify(la.body)).not.toContain("Citra");
    expect(JSON.stringify(la.body)).not.toContain("keluhan hotline");
    const lb = await list(b);
    expect(lb.body.total).toBe(1);
    expect(lb.body.items[0].contactName).toBe("Citra Hotline");
    const na = (await a.get("/api/v1/inbox/nav")).body;
    expect(na.totals.all).toBe(1);
    expect(na.channels.map((c: { name: string }) => c.name)).toEqual(["Admisi — contoh"]);
    expect(JSON.stringify(na)).not.toContain("Hotline");
    // filter eksplisit ke channel yang bukan miliknya → 0 (bukan galat yang membocorkan keberadaan)
    const probe = await list(a, `?channelId=${w.chB.id}`);
    expect(probe.body).toMatchObject({ total: 0, items: [] });
    // detail percakapan channel lain → 404 (keberadaan tidak dibocorkan)
    const hot = await convId(w.chB.id, CUSTOMER2);
    expect((await a.get(`/api/v1/conversations/${hot}`)).status).toBe(404);
    expect((await a.get(`/api/v1/conversations/${hot}/messages`)).status).toBe(404);
  });

  it("identitas pada daftar DISAMARKAN; nomor lengkap hanya pada panel kontak untuk yang berhak", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const a = await w.login(w.adminA);
    const item = (await list(a)).body.items[0];
    expect(item.identity).toBe(`••••${CUSTOMER.slice(-4)}`);
    expect(JSON.stringify((await list(a)).body)).not.toContain(CUSTOMER);
    const d = (await a.get(`/api/v1/conversations/${item.id}`)).body;
    expect(d.contact.identities).toEqual([{ type: "wa_id", value: CUSTOMER }]);
  });

  it("kontak yang SAMA di dua channel = satu kontak, dua percakapan; panel riwayat lintas channel menghormati izin", async () => {
    const w = await inboxWorld();
    await inbound({ phone: PHONE_ADM, text: "di admisi", name: "Dewi" });
    await inbound({ phone: PHONE_HOT, text: "di hotline", name: "Dewi" });
    expect((await q("select count(*)::int n from contacts"))[0].n).toBe(1);
    expect((await q("select count(*)::int n from conversations"))[0].n).toBe(2);
    const convA = await convId(w.chA.id), convB = await convId(w.chB.id);
    const a = await w.login(w.adminA), b = await w.login(w.adminB);
    // admin Admisi hanya melihat percakapannya; panel TIDAK menyebut channel Hotline
    const da = (await a.get(`/api/v1/conversations/${convA}`)).body;
    expect(da.otherChannels).toEqual([]);
    // Tidak ada data percakapan/channel Hotline di mana pun. (Daftar tim tujuan pengalihan berisi nama tim — itu struktur organisasi untuk pemilih "Alihkan",
    // bukan data channel — jadi dikecualikan dari pemeriksaan ini; lihat docs/tahap-3/tim-antrian-routing.md.)
    expect(JSON.stringify({ ...da, routing: undefined })).not.toContain("Hotline");
    expect(JSON.stringify(da.otherChannels) + JSON.stringify(da.conversation) + JSON.stringify(da.activity)).not.toContain("di hotline");
    // pengguna yang berizin di KEDUA channel melihat riwayat lintas channel (tanpa tertukar)
    await addUserGrant(w.adminA.id, { permission: "chat.view", effect: "allow", channelIds: [w.chA.id, w.chB.id] });
    const da2 = (await a.get(`/api/v1/conversations/${convA}`)).body;
    expect(da2.otherChannels.map((o: { id: string; channelName: string }) => [o.id, o.channelName])).toEqual([[convB, "Hotline — contoh"]]);
    expect(da2.otherChannels[0].preview.text).toBe("di hotline");
    // dan sebaliknya: panel Hotline untuk admin Hotline tidak menampilkan Admisi
    const db = (await b.get(`/api/v1/conversations/${convB}`)).body;
    expect(db.otherChannels).toEqual([]);
  });

  it("pencarian (nama/nomor) dan filter tidak membocorkan: hasil dan JUMLAH selalu dibatasi izin", async () => {
    const w = await inboxWorld();
    await inbound({ phone: PHONE_ADM, from: CUSTOMER, text: "a", name: "Andi Rahasia Admisi" });
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "b", name: "Rahasia Hotline Saja" });
    const a = await w.login(w.adminA);
    expect((await list(a, "?q=Rahasia")).body.total).toBe(1);
    expect((await list(a, "?q=Hotline")).body).toMatchObject({ total: 0, items: [] }); // nama yang hanya ada di channel lain
    expect((await list(a, `?q=${CUSTOMER2.slice(-6)}`)).body.total).toBe(0); // nomor di channel lain
    expect((await list(a, `?q=${CUSTOMER.slice(-6)}`)).body.total).toBe(1);
    expect((await list(a, "?q=%25")).body.total).toBe(0); // karakter LIKE tidak berfungsi sebagai wildcard
    expect((await list(a, "?q=' OR 1=1 --")).body.total).toBe(0); // bukan injeksi
    const b = await w.login(w.adminB);
    expect((await list(b, "?q=Rahasia")).body.total).toBe(1);
  });

  it("filter: channel, tim, PIC (saya/belum ditugaskan), belum dibaca, status AI, eskalasi, lead nyasar; pagination kursor stabil", async () => {
    const w = await inboxWorld();
    await ownerQuery("update channels set default_team_id = $1 where id = $2", [w.teamA, w.chA.id]);
    for (let i = 0; i < 5; i++) await inbound({ from: `1555000${5000 + i}`, text: `m${i}`, name: `Kontak ${i}`, ts: secAgo(100 - i * 10) }).catch(() => undefined);
    // kontak di luar daftar uji dikarantina (tidak muncul) → hanya yang terdaftar: gunakan 3 penerima uji
    expect((await q("select count(*)::int n from conversations"))[0].n).toBe(0);
    await inbound({ from: CUSTOMER, text: "satu", ts: secAgo(90) });
    await inbound({ from: CUSTOMER2, text: "dua", ts: secAgo(60) });
    await inbound({ from: CUSTOMER3, text: "tiga", ts: secAgo(30) });
    const a = await w.login(w.adminA);
    const all = await list(a);
    expect(all.body.items.map((i: { preview: { text: string } }) => i.preview.text)).toEqual(["tiga", "dua", "satu"]); // terbaru dulu
    // tim default channel: percakapan BARU masuk antrian tim default channel (CCP routing)
    expect(all.body.items.every((i: { teamId: string | null }) => i.teamId === w.teamA)).toBe(true);
    const c1 = await convId(w.chA.id, CUSTOMER);
    await ownerQuery("update conversations set assignee_id = $1, team_id = $2 where id = $3", [w.adminA.id, w.teamB, c1]); // satu percakapan dipindah ke tim lain agar filter tim benar-benar membedakan
    await ownerQuery("update conversations set escalated_at = now(), ai_status = 'off', ai_off_reason = 'eskalasi', ai_version = 1 where id = $1", [await convId(w.chA.id, CUSTOMER2)]);
    await ownerQuery("update conversations set stray_lead = true where id = $1", [await convId(w.chA.id, CUSTOMER3)]);
    expect((await list(a, "?assignee=me")).body.total).toBe(1);
    expect((await list(a, "?assignee=none")).body.total).toBe(2);
    expect((await list(a, `?teamId=${w.teamA}`)).body.total).toBe(2);
    expect((await list(a, `?teamId=${w.teamB}`)).body.total).toBe(1);
    expect((await list(a, "?aiStatus=off")).body.total).toBe(1);
    expect((await list(a, "?escalated=1")).body.total).toBe(1);
    expect((await list(a, "?strayLead=1")).body.total).toBe(1);
    expect((await list(a, `?channelId=${w.chA.id}`)).body.total).toBe(3);
    // pagination: limit 2 → halaman 1 (2 item) + kursor → halaman 2 (1 item), tanpa duplikat
    const p1 = (await list(a, "?limit=2")).body;
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await list(a, `?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)).body;
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
    expect(new Set([...p1.items, ...p2.items].map((i: { id: string }) => i.id)).size).toBe(3);
    expect((await list(a, "?limit=0")).status).toBe(400);
  });

  it("fitur mati (flag inbox) → seolah tidak ada (404); izin dicabut berlaku pada permintaan BERIKUTNYA", async () => {
    const w = await inboxWorld();
    await inbound({ text: "x" });
    const a = await w.login(w.adminA);
    expect((await list(a)).body.total).toBe(1);
    await setRoles(w.adminA.id, []); // peran dicabut
    expect((await list(a)).body.total).toBe(0);
    expect((await a.get(`/api/v1/conversations/${await convId(w.chA.id)}`)).status).toBe(404);
    await setRoles(w.adminA.id, [w.roleA.id]);
    expect((await list(a)).body.total).toBe(1);
    await enableFlag("inbox", false);
    expect((await list(a)).body.error.code).toBe("FEATURE_DISABLED");
  });
});

describe("@tahap-3 belum dibaca (D-16, ASUMSI: per pengguna)", () => {
  it("per pengguna: dibaca satu admin tidak mengubah admin lain; duplikat, history, dan echo TIDAK menambah jumlah", async () => {
    const w = await inboxWorld();
    const a1 = await w.login(w.adminA), a2 = await w.login(w.adminA2);
    const id1 = await inbound({ text: "pertama" });
    const conv = await convId(w.chA.id);
    const unread = async (c: typeof a1) => (await list(c)).body.items[0].unread;
    expect([await unread(a1), await unread(a2)]).toEqual([1, 1]);
    // webhook duplikat
    await postWebhook(envelope([messagesChange({ phoneId: PHONE_ADM, messages: [textMsg(id1, CUSTOMER, "pertama", secAgo(5))] })], WABA));
    await drain();
    expect(await unread(a1)).toBe(1);
    // history (lama + baru) dan echo
    await postWebhook(envelope([historyChange([{ id: CUSTOMER, messages: [{ from: CUSTOMER, id: "wamid.uji.h1", timestamp: secAgo(86400 * 2), type: "text", text: { body: "lama" }, history_context: { status: "READ" } }] }], { phase: 0, chunk_order: 1, progress: 10 }, PHONE_ADM)], WABA));
    await postWebhook(envelope([echoChange([{ from: BUSINESS_DISPLAY, to: CUSTOMER, id: "wamid.uji.e1", timestamp: secAgo(3), type: "text", text: { body: "dari hp" } }], PHONE_ADM)], WABA));
    await drain();
    expect(await unread(a1)).toBe(1);
    // a1 membaca → hanya a1 yang nol
    expect((await a1.post(`/api/v1/conversations/${conv}/read`)).status).toBe(200);
    expect([await unread(a1), await unread(a2)]).toEqual([0, 1]);
    expect((await a1.get("/api/v1/inbox/nav")).body.totals.unread).toBe(0);
    expect((await a2.get("/api/v1/inbox/nav")).body.totals.unread).toBe(1);
    // pesan baru → keduanya bertambah; filter unread
    await inbound({ text: "kedua" });
    expect([await unread(a1), await unread(a2)]).toEqual([1, 2]);
    expect((await list(a1, "?unread=1")).body.total).toBe(1);
    await a2.post(`/api/v1/conversations/${conv}/read`);
    expect((await list(a2, "?unread=1")).body.total).toBe(0);
    // membaca percakapan di luar akses → 404
    expect((await (await w.login(w.adminB)).post(`/api/v1/conversations/${conv}/read`)).status).toBe(404);
  });

  it("pesan history yang masuk terlambat TIDAK memindahkan chat lama ke urutan teratas (juga tanpa cap waktu)", async () => {
    const w = await inboxWorld();
    await inbound({ from: CUSTOMER, text: "chat lama", ts: secAgo(7200) });
    await inbound({ from: CUSTOMER2, text: "chat baru", ts: secAgo(60) });
    const a = await w.login(w.adminA);
    expect((await list(a)).body.items.map((i: { preview: { text: string } }) => i.preview.text)).toEqual(["chat baru", "chat lama"]);
    // history baru tiba untuk chat lama, tetapi isinya lama (dan satu tanpa cap waktu)
    await postWebhook(envelope([historyChange([{ id: CUSTOMER, messages: [
      { from: CUSTOMER, id: "wamid.uji.hl1", timestamp: secAgo(86400 * 3), type: "text", text: { body: "history lama" }, history_context: { status: "READ" } },
      { from: CUSTOMER, id: "wamid.uji.hl2", type: "text", text: { body: "history tanpa waktu" }, history_context: { status: "READ" } },
    ] }], { phase: 1, chunk_order: 2, progress: 50 }, PHONE_ADM)], WABA));
    await drain();
    expect((await list(a)).body.items.map((i: { preview: { text: string } | null }) => i.preview?.text)).toEqual(["chat baru", "chat lama"]);
    // dan tidak menjadi "belum dibaca"
    expect((await list(a)).body.items.find((i: { contactName: string }) => i.contactName)!.unread).toBe(1);
  });
});

describe("@tahap-3 media & umpan perubahan mengikuti izin", () => {
  it("media pesan hanya dapat dibaca yang berhak atas PERCAKAPAN itu (404 untuk yang lain)", async () => {
    const w = await inboxWorld();
    mock.phones.set(PHONE_ADM, { display: "15550000001", name: "x" });
    mock.media.set("m.img1", { bytes: PNG_BYTES, mime: "image/png" });
    await postWebhook(envelope([messagesChange({ phoneId: PHONE_ADM, messages: [imageMsg("wamid.uji.img1", CUSTOMER, "m.img1", "image/png", undefined, "foto", secAgo(5))] })], WABA));
    await drain();
    const conv = await convId(w.chA.id);
    const mediaId = (await q("select id from media"))[0].id;
    const a = await w.login(w.adminA), b = await w.login(w.adminB);
    const msgs = (await a.get(`/api/v1/conversations/${conv}/messages`)).body.messages;
    expect(msgs[0]).toMatchObject({ type: "image", mediaId, mediaStatus: "tersimpan" });
    expect((await a.get(`/api/v1/media/${mediaId}`)).status).toBe(200);
    expect((await b.get(`/api/v1/media/${mediaId}`)).status).toBe(404);
    expect((await (await w.login(w.viewer)).get(`/api/v1/media/${mediaId}`)).status).toBe(200); // pelihat Admisi (chat.view)
  });

  it("umpan perubahan: hanya percakapan yang berhak; resync tanpa kursor; tidak ada kebocoran lintas channel; perubahan terlihat tanpa refresh manual", async () => {
    const w = await inboxWorld();
    const a = await w.login(w.adminA);
    const first = (await a.get("/api/v1/inbox/changes")).body;
    expect(first).toMatchObject({ resync: true, items: [] });
    const since = new Date(new Date(first.serverTime).getTime() - 1000).toISOString();
    await inbound({ phone: PHONE_ADM, from: CUSTOMER, text: "untuk admisi" });
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "untuk hotline" });
    const ch = (await a.get(`/api/v1/inbox/changes?since=${encodeURIComponent(since)}`)).body;
    expect(ch.resync).toBe(false);
    expect(ch.items.map((i: { preview: { text: string } }) => i.preview.text)).toEqual(["untuk admisi"]);
    expect(JSON.stringify(ch)).not.toContain("hotline");
    // pesan baru memperbarui item yang sama (tanpa duplikasi: kunci id) — klien menggabung per id
    const cursor = ch.serverTime;
    await inbound({ phone: PHONE_ADM, from: CUSTOMER, text: "susulan", ts: secAgo(2) });
    const ch2 = (await a.get(`/api/v1/inbox/changes?since=${encodeURIComponent(new Date(new Date(cursor).getTime() - 1000).toISOString())}`)).body;
    expect(ch2.items).toHaveLength(1);
    expect(ch2.items[0].id).toBe(ch.items[0].id);
    expect(ch2.items[0].preview.text).toBe("susulan");
    // tanpa perubahan baru → kosong
    expect((await a.get(`/api/v1/inbox/changes?since=${encodeURIComponent(ch2.serverTime)}`)).body.items).toEqual([]);
    // kursor rusak → resync (bukan galat)
    expect((await a.get("/api/v1/inbox/changes?since=bukan-tanggal")).body.resync).toBe(true);
  });

  it("makeTeam tidak menambah akses sendiri (kontrol: anggota tim tanpa izin tetap tidak melihat apa pun)", async () => {
    const w = await inboxWorld();
    await inbound({ text: "x" });
    const lone = await (await import("../helpers/fixtures")).makeUser({ name: "Tanpa Peran" });
    await makeTeam("Tim Kosong", { userIds: [lone.id] });
    const c = await w.login(lone);
    expect((await list(c)).body.total).toBe(0);
    expect((await c.get("/api/v1/inbox/nav")).body.totals.all).toBe(0);
  });
});
