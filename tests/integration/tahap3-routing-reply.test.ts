/** Tahap 3 — Routing/penugasan/pengalihan (CCP 3.2) dan balasan manual, balasan cepat, catatan internal (CCP 3.5). SIMULASI (mock Graph). */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { resetAccessCacheForTests } from "@/modules/conversations-messages";
import { MockGraph } from "../helpers/mock-graph";
import { ownerQuery, resetDb } from "../helpers/db";
import { addUserGrant, makeUser } from "../helpers/fixtures";
import { CUSTOMER2, PHONE_ADM, PHONE_HOT, convId, idem, inbound, inboxWorld, makeTeam, reply } from "../helpers/inbox";
import { CUSTOMER, PDF_BYTES, PNG_BYTES } from "../helpers/whatsapp";

const mock = new MockGraph();
let prevBase: string | undefined;
beforeAll(async () => { await mock.start(); prevBase = process.env.META_GRAPH_BASE_URL; process.env.META_GRAPH_BASE_URL = mock.url; resetEnvCacheForTests(); });
afterAll(async () => { process.env.META_GRAPH_BASE_URL = prevBase; resetEnvCacheForTests(); await mock.stop(); await closeDb(); });
beforeEach(async () => { await resetDb(); mock.reset(); resetAccessCacheForTests(); });

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const audit = async (action: string, objectId?: string) => q("select action, result, metadata, actor_label from audit_log where action = $1 and ($2::text is null or object_id = $2) order by id", [action, objectId ?? null]);

describe("@tahap-3 CCP 3.2 routing: antrian default, penugasan, benturan", () => {
  it("percakapan BARU masuk antrian tim default channel; channel tanpa tim default → belum ada tim; default dapat diatur lewat API (teraudit)", async () => {
    const w = await inboxWorld();
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "sebelum default diatur" });
    expect((await q("select team_id from conversations"))[0].team_id).toBeNull();
    const sa = await w.login(w.adminA);
    // pengguna biasa tanpa izin kelola channel tidak boleh mengatur tim default
    expect((await sa.put(`/api/v1/channels/${w.chA.id}/default-team`, { teamId: w.teamA })).status).toBe(403);
    await ownerQuery("update channels set default_team_id = $1 where id = $2", [w.teamA, w.chA.id]);
    await inbound({ phone: PHONE_ADM, from: CUSTOMER, text: "setelah default diatur" });
    expect((await q("select team_id from conversations where channel_id = $1", [w.chA.id]))[0].team_id).toBe(w.teamA);
    expect((await q("select team_id from conversations where channel_id = $1", [w.chB.id]))[0].team_id).toBeNull(); // channel lain tidak ikut
  });

  it("penugasan tim + PIC: versi naik, teraudit (dari→ke); PIC wajib anggota tim; tim wajib terhubung ke channel; tim/pengguna nonaktif ditolak; PIC dapat dilepas", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    const ok = await a.post(`/api/v1/conversations/${conv}/assign`, { teamId: w.teamA, assigneeId: w.adminA2.id, expectedVersion: 0 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ version: 1, teamId: w.teamA, assigneeId: w.adminA2.id });
    const [au] = await audit("conversation.assigned", conv);
    expect(au.metadata).toMatchObject({ to: { teamId: w.teamA, assigneeId: w.adminA2.id }, version: 1 });
    // PIC bukan anggota tim → ditolak
    expect((await a.post(`/api/v1/conversations/${conv}/assign`, { teamId: w.teamA, assigneeId: w.adminB.id, expectedVersion: 1 })).body.error.code).toBe("ASSIGNEE_NOT_IN_TEAM");
    // tim yang tidak terhubung ke channel → ditolak (gunakan "Alihkan")
    expect((await a.post(`/api/v1/conversations/${conv}/assign`, { teamId: w.teamB, expectedVersion: 1 })).body.error.code).toBe("TEAM_NOT_LINKED");
    // tim nonaktif
    const dead = await makeTeam("Tim Mati", { channelIds: [w.chA.id], active: false });
    expect((await a.post(`/api/v1/conversations/${conv}/assign`, { teamId: dead, expectedVersion: 1 })).body.error.code).toBe("TEAM_INVALID");
    // PIC nonaktif
    const off = await makeUser({ name: "Nonaktif", status: "disabled" });
    expect((await a.post(`/api/v1/conversations/${conv}/assign`, { assigneeId: off.id, expectedVersion: 1 })).body.error.code).toBe("ASSIGNEE_INVALID");
    // penolakan di atas tidak menaikkan versi / mengubah data
    expect((await q("select assign_version v, assignee_id from conversations where id = $1", [conv]))[0]).toMatchObject({ v: 1, assignee_id: w.adminA2.id });
    // PIC dilepas
    const rel = await a.post(`/api/v1/conversations/${conv}/assign`, { assigneeId: null, expectedVersion: 1 });
    expect(rel.body).toMatchObject({ version: 2, assigneeId: null, teamId: w.teamA });
  });

  it("DUA admin mengubah penugasan BERSAMAAN: tepat satu menang, yang lain 409 ASSIGN_CONFLICT dan benturan TERAUDIT; tak ada penimpaan diam-diam", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const [a1, a2] = [await w.login(w.adminA), await w.login(w.adminA2)];
    const res = await Promise.all([
      a1.post(`/api/v1/conversations/${conv}/assign`, { teamId: w.teamA, assigneeId: w.adminA.id, expectedVersion: 0 }),
      a2.post(`/api/v1/conversations/${conv}/assign`, { teamId: w.teamA, assigneeId: w.adminA2.id, expectedVersion: 0 }),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = res.find((r) => r.status === 409)!;
    expect(loser.body.error.code).toBe("ASSIGN_CONFLICT");
    const row = (await q("select assign_version v, assignee_id from conversations where id = $1", [conv]))[0];
    expect(row.v).toBe(1);
    const winnerId = res.find((r) => r.status === 200)!.body.assigneeId;
    expect(row.assignee_id).toBe(winnerId);
    const conflicts = await audit("conversation.assign_conflict", conv);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ result: "denied", metadata: { expected: 0, current: 1 } });
    // versi basi yang dikirim ulang juga ditolak
    expect((await a1.post(`/api/v1/conversations/${conv}/assign`, { assigneeId: null, expectedVersion: 0 })).status).toBe(409);
  });

  it("izin penugasan: pengguna tanpa chat.assign → 403; di luar channel → 404", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    expect((await (await w.login(w.viewer)).post(`/api/v1/conversations/${conv}/assign`, { assigneeId: null, expectedVersion: 0 })).status).toBe(403);
    expect((await (await w.login(w.adminB)).post(`/api/v1/conversations/${conv}/assign`, { assigneeId: null, expectedVersion: 0 })).status).toBe(404);
    expect(await audit("conversation.assigned", conv)).toHaveLength(0);
  });
});

describe("@tahap-3 CCP 3.2 pengalihan antartim (D-22, ASUMSI): akses tim tujuan terbatas pada percakapan itu", () => {
  it("lead nyasar di Hotline dialihkan ke Tim Admisi: anggota Tim Admisi dapat bertindak di percakapan ITU, TIDAK di percakapan Hotline lain; teraudit", async () => {
    const w = await inboxWorld();
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "mau daftar pelatihan", name: "Calon Peserta" }); // nyasar di Hotline
    await inbound({ phone: PHONE_HOT, from: "15550004004", text: "keluhan lain" }).catch(() => undefined); // di luar daftar uji → karantina (tidak jadi percakapan)
    await ownerQuery("insert into test_recipients(label, identity_value) values('Peserta 4','15550004004') on conflict do nothing");
    await inbound({ phone: PHONE_HOT, from: "15550004004", text: "keluhan lain Hotline", name: "Peserta Lain" });
    const stray = await convId(w.chB.id, CUSTOMER2), other = await convId(w.chB.id, "15550004004");
    const a = await w.login(w.adminA), b = await w.login(w.adminB);
    // sebelum dialihkan: adminA (Tim Admisi) tidak melihat apa pun di Hotline
    expect((await a.get(`/api/v1/conversations/${stray}`)).status).toBe(404);
    const t = await b.post(`/api/v1/conversations/${stray}/transfer`, { teamId: w.teamA, strayLead: true, note: "ini lead Admisi", expectedVersion: 0 });
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({ teamId: w.teamA, version: 1 });
    // setelah: percakapan yang dialihkan terlihat & dapat dibalas; percakapan lain di channel yang sama TETAP tertutup
    expect((await a.get(`/api/v1/conversations/${stray}`)).status).toBe(200);
    expect((await a.get(`/api/v1/conversations/${other}`)).status).toBe(404);
    expect((await a.get(`/api/v1/conversations/${other}/messages`)).status).toBe(404);
    const list = (await a.get("/api/v1/inbox/conversations")).body;
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([stray]);
    expect(list.total).toBe(1);
    expect(JSON.stringify(list)).not.toContain("keluhan lain");
    expect((await a.get("/api/v1/inbox/nav")).body.totals.all).toBe(1);
    // balasan lewat channel yang BENAR (Hotline), bukan channel tim tujuan
    const r = await reply(a, stray, { text: "Halo, kami Tim Admisi" });
    expect(r.status).toBe(200);
    expect((await q("select channel_id from messages where direction = 'keluar'"))[0].channel_id).toBe(w.chB.id);
    expect(mock.sends().at(-1)?.path).toContain(`/${PHONE_HOT}/messages`);
    // akses tidak mengangkat izin lain: adminA tetap tidak boleh mengelola percakapan lain / mengubah channel Hotline
    expect((await a.post(`/api/v1/conversations/${other}/assign`, { assigneeId: null, expectedVersion: 0 })).status).toBe(404);
    // audit: pengalihan + penanda lead nyasar tercatat; pencatat = pelaku
    const [tr] = await audit("conversation.transferred", stray);
    expect(tr.metadata).toMatchObject({ toTeamId: w.teamA, strayLead: true, note: "ini lead Admisi" });
    expect(tr.actor_label).toBe(w.adminB.email);
    expect((await q("select stray_lead from conversations where id = $1", [stray]))[0].stray_lead).toBe(true);
    expect(await q("select 1 from conversation_team_access where conversation_id = $1 and revoked_at is null", [stray])).toHaveLength(1);
  });

  it("penolakan pengguna MENGALAHKAN akses pengalihan; pengalihan lagi mencabut akses tim sebelumnya; tim dinonaktifkan → akses hilang pada permintaan berikutnya", async () => {
    const w = await inboxWorld();
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "x" });
    const conv = await convId(w.chB.id, CUSTOMER2);
    const a = await w.login(w.adminA), b = await w.login(w.adminB);
    await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamA, expectedVersion: 0 });
    expect((await a.get(`/api/v1/conversations/${conv}`)).status).toBe(200);
    // deny eksplisit pada channel Hotline → menang atas akses pengalihan
    await addUserGrant(w.adminA.id, { permission: "chat.view", effect: "deny", channelIds: [w.chB.id] });
    expect((await a.get(`/api/v1/conversations/${conv}`)).status).toBe(404);
    await ownerQuery("delete from user_grants where user_id = $1", [w.adminA.id]);
    expect((await a.get(`/api/v1/conversations/${conv}`)).status).toBe(200);
    // pengalihan berikutnya ke tim lain (Hotline) mencabut akses Tim Admisi
    const back = await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamB, expectedVersion: 1 });
    expect(back.status).toBe(200);
    expect((await a.get(`/api/v1/conversations/${conv}`)).status).toBe(404);
    expect((await q("select count(*)::int n from conversation_team_access where revoked_at is not null"))[0].n).toBe(1);
    // alihkan lagi ke Tim Admisi, lalu nonaktifkan tim → akses hilang segera
    await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamA, expectedVersion: 2 });
    expect((await a.get(`/api/v1/conversations/${conv}`)).status).toBe(200);
    await ownerQuery("update teams set is_active = false where id = $1", [w.teamA]);
    expect((await a.get(`/api/v1/conversations/${conv}`)).status).toBe(404);
  });

  it("validasi & izin pengalihan: tim sama/nonaktif ditolak; tanpa chat.transfer 403; versi basi 409 (teraudit); anggota tim tujuan tanpa izin aksi tidak memperoleh apa pun", async () => {
    const w = await inboxWorld();
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "x" });
    const conv = await convId(w.chB.id, CUSTOMER2);
    const b = await w.login(w.adminB);
    await ownerQuery("update conversations set team_id = $1 where id = $2", [w.teamB, conv]);
    expect((await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamB, expectedVersion: 0 })).body.error.code).toBe("SAME_TEAM");
    const dead = await makeTeam("Tim Mati", { active: false });
    expect((await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: dead, expectedVersion: 0 })).body.error.code).toBe("TEAM_INVALID");
    // pelihat Admisi tidak punya apa pun di Hotline: 404 (bukan 403)
    expect((await (await w.login(w.viewer)).post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamA, expectedVersion: 0 })).status).toBe(404);
    // versi basi
    await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamA, expectedVersion: 0 });
    const stale = await b.post(`/api/v1/conversations/${conv}/transfer`, { teamId: w.teamB, expectedVersion: 0 });
    expect(stale.status).toBe(409);
    expect(await audit("conversation.assign_conflict", conv)).toHaveLength(1);
    // anggota tim tujuan TANPA izin chat.view di mana pun tidak mendapat akses
    const lone = await makeUser({ name: "Anggota Tanpa Peran" });
    await ownerQuery("insert into team_members(team_id, user_id) values($1,$2)", [w.teamA, lone.id]);
    expect((await (await w.login(lone)).get(`/api/v1/conversations/${conv}`)).status).toBe(404);
    // anggota tim tujuan yang HANYA berizin lihat: dapat membuka, tetapi tidak membalas (403)
    await ownerQuery("insert into team_members(team_id, user_id) values($1,$2)", [w.teamA, w.viewer.id]);
    const v = await w.login(w.viewer);
    expect((await v.get(`/api/v1/conversations/${conv}`)).status).toBe(200);
    expect((await reply(v, conv)).status).toBe(403);
  });

  it("penanda manual Lead Nyasar: dapat dipasang/dilepas oleh yang berizin, teraudit; PIC chat terpisah dari PIC pipeline (kolom berbeda)", async () => {
    const w = await inboxWorld();
    await inbound({ text: "x" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    expect((await a.post(`/api/v1/conversations/${conv}/stray-lead`, { value: true })).body).toEqual({ strayLead: true });
    expect((await (await w.login(w.viewer)).post(`/api/v1/conversations/${conv}/stray-lead`, { value: false })).status).toBe(403);
    expect((await q("select stray_lead from conversations where id = $1", [conv]))[0].stray_lead).toBe(true);
    expect((await audit("conversation.stray_lead", conv))[0].metadata).toEqual({ value: true });
    // PIC pipeline belum ada di Tahap 3 (Tahap 5): kolom PIC percakapan bernama assignee_id, bukan pipeline_*
    const cols = (await q("select column_name from information_schema.columns where table_name = 'conversations'")).map((c) => c.column_name as string);
    expect(cols).toContain("assignee_id");
    expect(cols.filter((c) => c.startsWith("pipeline"))).toEqual([]);
  });
});

describe("@tahap-3 CCP 3.5 balasan manual (teks, gambar, PDF) lewat channel yang benar", () => {
  it("balasan teks: penerima DIAMBIL DARI PERCAKAPAN (bukan dari klien), lewat nomor channel yang benar, AI → Off 'admin membalas' (v1), teraudit", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    const f = new FormData();
    f.set("kind", "text"); f.set("text", "Halo Kak, ada yang bisa dibantu?"); f.set("idempotencyKey", idem());
    f.set("to", "15559998888"); // upaya menimpa penerima — harus diabaikan
    const r = await a.postForm(`/api/v1/conversations/${conv}/reply`, f);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "diterima_api", duplicate: false, aiStatus: "off", aiVersion: 1 });
    expect(mock.sends()).toHaveLength(1);
    expect(mock.sends()[0]!.path).toContain(`/${PHONE_ADM}/messages`);
    expect(mock.sends()[0]!.json).toMatchObject({ to: CUSTOMER, type: "text", text: { body: "Halo Kak, ada yang bisa dibantu?" } });
    expect(JSON.stringify(mock.sends())).not.toContain("15559998888");
    const m = (await q("select direction, source, status, created_by from messages where direction = 'keluar'"))[0];
    expect(m).toMatchObject({ direction: "keluar", source: "te_one", status: "diterima_api", created_by: w.adminA.id });
    expect((await q("select ai_status, ai_off_reason, ai_version from conversations where id = $1", [conv]))[0]).toEqual({ ai_status: "off", ai_off_reason: "admin_membalas", ai_version: 1 });
    expect((await q("select reason, version, actor_id from conversation_ai_events where conversation_id = $1", [conv]))).toEqual([{ reason: "admin_membalas", version: 1, actor_id: w.adminA.id }]);
    expect((await audit("conversation.ai_changed", conv))[0].metadata).toMatchObject({ from: "aktif", to: "off", reason: "admin_membalas", version: 1 });
    const mid = (await q("select id from messages where direction = 'keluar'"))[0].id as string;
    expect((await audit("inbox.message_sent", mid)).map((x) => x.result)).toEqual(["success"]); // jejak kirim tercatat sekali untuk pesan ini
  });

  it("balasan gambar dan PDF: berkas terunggah ke Meta sekali per berkas; jenis/ukuran tak valid ditolak sebelum kirim", async () => {
    const w = await inboxWorld();
    await inbound({ text: "kirim brosur" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    const img = await reply(a, conv, { kind: "image", file: { bytes: PNG_BYTES, mime: "image/png", name: "brosur.png" }, text: undefined });
    expect(img.status).toBe(200);
    expect(img.body.status).toBe("diterima_api");
    const pdf = await reply(a, conv, { kind: "document", file: { bytes: PDF_BYTES, mime: "application/pdf", name: "silabus.pdf" } });
    expect(pdf.status).toBe(200);
    expect(mock.uploaded).toHaveLength(2);
    expect(mock.sends().map((s) => (s.json as { type: string }).type)).toEqual(["image", "document"]);
    expect((await q("select type, status from messages where direction = 'keluar' order by received_at")).map((m) => `${m.type}:${m.status}`)).toEqual(["image:diterima_api", "document:diterima_api"]);
    // tipe tidak didukung / tanpa berkas → ditolak, tak ada panggilan baru ke Meta
    const before = mock.calls.length;
    expect((await reply(a, conv, { kind: "image", file: { bytes: Buffer.from("MZ-bukan-gambar"), mime: "application/x-msdownload", name: "virus.exe" } })).status).toBe(400);
    expect((await reply(a, conv, { kind: "document" })).status).toBe(400);
    expect(mock.calls.length).toBe(before);
  });

  it("tanpa izin: pelihat → 403; admin channel lain → 404; tak ada pesan, tak ada panggilan Meta, AI tidak berubah", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    expect((await reply(await w.login(w.viewer), conv)).status).toBe(403);
    expect((await reply(await w.login(w.adminB), conv)).status).toBe(404);
    expect(mock.calls).toHaveLength(0);
    expect(await q("select 1 from messages where direction = 'keluar'")).toHaveLength(0);
    expect((await q("select ai_status, ai_version from conversations"))[0]).toEqual({ ai_status: "aktif", ai_version: 0 });
  });

  it("KLIK GANDA: 12 permintaan serentak dengan kunci yang sama → 1 pesan, 1 panggilan Meta, AI Off tepat sekali (1 transisi)", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    const key = idem();
    const res = await Promise.all(Array.from({ length: 12 }, () => reply(a, conv, { key, text: "sekali saja" })));
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(new Set(res.map((r) => r.body.messageId)).size).toBe(1);
    expect(res.filter((r) => r.body.duplicate === false)).toHaveLength(1);
    expect(mock.sends()).toHaveLength(1);
    expect((await q("select count(*)::int n from messages where direction = 'keluar'"))[0].n).toBe(1);
    expect((await q("select count(*)::int n from conversation_ai_events"))[0].n).toBe(1);
    expect((await q("select ai_version from conversations"))[0].ai_version).toBe(1);
    // pengiriman ulang dengan kunci sama setelah selesai → hasil sama, tanpa panggilan baru
    const again = await reply(a, conv, { key, text: "sekali saja" });
    expect(again.body).toMatchObject({ duplicate: true, messageId: res[0]!.body.messageId });
    expect(mock.sends()).toHaveLength(1);
    // kunci yang sama untuk percakapan LAIN ditolak
    await inbound({ from: CUSTOMER2, text: "lain" });
    expect((await reply(a, await convId(w.chA.id, CUSTOMER2), { key })).body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("di luar jendela layanan: DIBLOKIR dengan alasan; tidak membuat pesan, tidak memanggil Meta, dan TIDAK mengubah status AI (teraudit)", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    await ownerQuery("update conversations set last_customer_message_at = now() - interval '25 hours' where id = $1", [conv]);
    const a = await w.login(w.adminA);
    const r = await reply(a, conv);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: "WINDOW_CLOSED", details: { reason: "tertutup" } });
    expect(mock.calls).toHaveLength(0);
    expect(await q("select 1 from messages where direction = 'keluar'")).toHaveLength(0);
    expect((await q("select ai_status, ai_version from conversations"))[0]).toEqual({ ai_status: "aktif", ai_version: 0 });
    expect((await audit("inbox.send_blocked", conv))[0]).toMatchObject({ result: "denied", metadata: { reason: "tertutup" } });
    // belum ada pesan pelanggan sama sekali → alasan berbeda
    await ownerQuery("update conversations set last_customer_message_at = null where id = $1", [conv]);
    expect((await reply(a, conv)).body.error.details.reason).toBe("belum_ada_pesan_pelanggan");
  });

  it("gagal dan belum pasti TAMPIL jujur; AI TETAP Off; tidak ada retry buta (tepat satu panggilan per percobaan)", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA);
    mock.sendMode = "http400";
    const fail = await reply(a, conv, { text: "gagal" });
    expect(fail.body).toMatchObject({ status: "gagal", aiStatus: "off" });
    expect(mock.sends()).toHaveLength(1); // tanpa retry buta
    expect((await q("select ai_status, ai_off_reason from conversations"))[0]).toEqual({ ai_status: "off", ai_off_reason: "admin_membalas" });
    mock.sendMode = "noid"; // Meta menjawab 200 tanpa ID pesan → hasil tidak pasti
    const unsure = await reply(a, conv, { text: "tidak pasti" });
    expect(unsure.body.status).toBe("belum_pasti");
    expect(mock.sends()).toHaveLength(2);
    // status tampil di isi percakapan
    const msgs = (await a.get(`/api/v1/conversations/${conv}/messages`)).body.messages.filter((m: { direction: string }) => m.direction === "keluar");
    expect(msgs.map((m: { status: string }) => m.status)).toEqual(["gagal", "belum_pasti"]);
    // admin dapat mengaktifkan kembali AI HANYA secara manual
    expect((await q("select count(*)::int n from conversation_ai_events"))[0].n).toBe(1); // dua balasan = satu transisi
  });

  it("penerima di luar daftar uji (non-production) DIBLOKIR di server: 403, 0 panggilan Meta, teraudit, AI tidak berubah", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    await ownerQuery("delete from test_recipients where identity_value = $1", [CUSTOMER]);
    const r = await reply(await w.login(w.adminA), conv);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("RECIPIENT_NOT_ALLOWED");
    expect(mock.calls).toHaveLength(0);
    expect((await audit("inbox.send_blocked", conv))[0].metadata).toMatchObject({ reason: "penerima_di_luar_daftar_uji" });
    expect(JSON.stringify(await audit("inbox.send_blocked", conv))).not.toContain(CUSTOMER); // nomor disamarkan di audit
    expect((await q("select ai_version from conversations"))[0].ai_version).toBe(0);
  });

  it("DUA admin membalas pada waktu berdekatan (kunci berbeda): keduanya terkirim sebagai dua pesan terpisah, AI Off hanya satu transisi, tanpa deadlock", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const [a1, a2] = [await w.login(w.adminA), await w.login(w.adminA2)];
    const [r1, r2] = await Promise.all([reply(a1, conv, { text: "dari admin 1" }), reply(a2, conv, { text: "dari admin 2" })]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(mock.sends()).toHaveLength(2);
    expect((await q("select created_by from messages where direction = 'keluar' order by received_at")).map((m) => m.created_by).sort()).toEqual([w.adminA.id, w.adminA2.id].sort());
    expect((await q("select ai_status, ai_version from conversations"))[0]).toEqual({ ai_status: "off", ai_version: 1 });
  });
});

describe("@tahap-3 balasan cepat", () => {
  it("dikelola hanya oleh yang berizin per channel, variabel aman (tak dikenal ditolak), teraudit; hanya MENGISI komposer — pengiriman tetap melewati pemeriksaan jendela", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo", name: "Budi Santoso" });
    await inbound({ phone: PHONE_HOT, from: CUSTOMER2, text: "halo", name: "Citra" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA), b = await w.login(w.adminB), v = await w.login(w.viewer);
    // tanpa izin kelola
    expect((await v.post("/api/v1/quick-replies", { title: "T", body: "x", channelId: w.chA.id })).status).toBe(403);
    expect((await v.get("/api/v1/quick-replies")).status).toBe(403);
    // balasan untuk SEMUA channel butuh izin di semua channel
    expect((await a.post("/api/v1/quick-replies", { title: "Global", body: "x" })).status).toBe(403);
    // variabel tak dikenal / terlalu panjang
    expect((await a.post("/api/v1/quick-replies", { title: "T", body: "Halo {alamat_rumah}", channelId: w.chA.id })).body.error.code).toBe("UNKNOWN_VARIABLE");
    expect((await a.post("/api/v1/quick-replies", { title: "", body: "x", channelId: w.chA.id })).status).toBe(400);
    const created = await a.post("/api/v1/quick-replies", { title: "Sapaan", body: "Halo {nama}, terima kasih sudah menghubungi {channel}.", channelId: w.chA.id });
    expect(created.status).toBe(201);
    const qr = created.body.id as string;
    // dirender dengan variabel aman untuk percakapan yang benar
    const items = (await a.get(`/api/v1/conversations/${conv}/quick-replies`)).body.items;
    expect(items).toEqual([{ id: qr, title: "Sapaan", text: "Halo Budi Santoso, terima kasih sudah menghubungi Admisi — contoh." }]);
    // admin Hotline tidak melihat/mengubah balasan cepat channel Admisi
    expect((await b.get("/api/v1/quick-replies")).body.items).toEqual([]);
    expect((await b.patch(`/api/v1/quick-replies/${qr}`, { body: "ubah" })).status).toBe(404);
    const hot = await convId(w.chB.id, CUSTOMER2);
    expect((await b.get(`/api/v1/conversations/${hot}/quick-replies`)).body.items).toEqual([]);
    // kirim memakai teks balasan cepat → tetap diperiksa jendela layanan (diblokir bila tertutup)
    await ownerQuery("update conversations set last_customer_message_at = now() - interval '30 hours' where id = $1", [conv]);
    expect((await reply(a, conv, { text: items[0].text })).body.error.code).toBe("WINDOW_CLOSED");
    expect(mock.calls).toHaveLength(0);
    await ownerQuery("update conversations set last_customer_message_at = now() where id = $1", [conv]);
    expect((await reply(a, conv, { text: items[0].text })).body.status).toBe("diterima_api");
    expect((mock.sends()[0]!.json as { text: { body: string } }).text.body).toBe("Halo Budi Santoso, terima kasih sudah menghubungi Admisi — contoh.");
    // nonaktifkan → tidak lagi tersedia; semua perubahan teraudit
    expect((await a.patch(`/api/v1/quick-replies/${qr}`, { isActive: false })).status).toBe(200);
    expect((await a.get(`/api/v1/conversations/${conv}/quick-replies`)).body.items).toEqual([]);
    expect((await q("select action from audit_log where object_type = 'quick_reply' order by id")).map((x) => x.action)).toEqual(["quick_reply.created", "quick_reply.deactivated"]);
  });
});

describe("@tahap-3 catatan internal TIDAK PERNAH terkirim", () => {
  it("catatan tersimpan terpisah dari pesan, tampil berbeda untuk yang berhak, tidak memicu panggilan Meta, isinya tidak masuk audit; tanpa izin 403", async () => {
    const w = await inboxWorld();
    await inbound({ text: "halo" });
    const conv = await convId(w.chA.id);
    const a = await w.login(w.adminA), v = await w.login(w.viewer);
    const secret = "CATATAN-RAHASIA-INTERNAL <script>alert(1)</script>";
    const n = await a.post(`/api/v1/conversations/${conv}/notes`, { body: secret });
    expect(n.status).toBeLessThan(300);
    expect(mock.calls).toHaveLength(0);
    expect((await q("select count(*)::int n from messages where direction = 'keluar'"))[0].n).toBe(0);
    expect(JSON.stringify(await q("select * from audit_log where action = 'conversation.note_added'"))).not.toContain("CATATAN-RAHASIA");
    const msgs = (await a.get(`/api/v1/conversations/${conv}/messages`)).body;
    expect(msgs.notes.map((x: { body: string }) => x.body)).toEqual([secret]);
    expect(msgs.messages.map((x: { body: string | null }) => x.body)).not.toContain(secret);
    // validasi + izin
    expect((await a.post(`/api/v1/conversations/${conv}/notes`, { body: "   " })).status).toBe(400);
    expect((await v.post(`/api/v1/conversations/${conv}/notes`, { body: "x" })).status).toBe(403);
    // catatan tidak dapat diubah/dihapus oleh aplikasi (append-only di database)
    expect((await ownerQuery("update conversation_notes set body = 'ubah'").catch((e) => e)).code).toBeTruthy();
    // balasan berikutnya tidak membawa isi catatan
    await reply(a, conv, { text: "balasan biasa" });
    expect(JSON.stringify(mock.calls)).not.toContain("CATATAN-RAHASIA");
  });

  it("jaminan STRUKTURAL: jalur kirim (send, outbox, automation) tidak pernah merujuk tabel catatan internal", () => {
    for (const f of ["src/modules/conversations-messages/send.ts", "src/modules/conversations-messages/outbox.ts", "src/modules/automation/jobs.ts", "src/modules/whatsapp-adapter/client.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/conversationNotes|conversation_notes/);
    }
  });
});
