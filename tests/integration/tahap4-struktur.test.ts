/**
 * Tahap 4 — STRUKTUR (migrasi 0007–0008): constraint dan trigger penjaga di DATABASE. Belum ada perilaku agent/AI; hanya bukti bahwa bentuk data dan aturan integritas
 * yang tak boleh pernah salah ditegakkan oleh PostgreSQL itu sendiri (bukan hanya aplikasi). Data SINTETIS.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { closeDb } from "@/db/client";
import { PG_ERR } from "@/db/client";
import { ownerQuery, resetDb } from "../helpers/db";
import { makeChannel } from "../helpers/fixtures";
import { TEST_APP_URL } from "../test-env";

afterAll(closeDb);
beforeEach(resetDb);

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
type PgErr = { code?: string; constraint?: string; message: string };
const err = async (sql: string, p: unknown[] = []): Promise<PgErr | null> => { try { await ownerQuery(sql, p); return null; } catch (e) { return e as PgErr; } };
const U = randomUUID(); // pengguna sintetis (kolom *_by tanpa FK)

const agent = async (name = "Agen Uji") => (await q("insert into ai_agents(name) values($1) returning id", [name]))[0].id as string;
const draft = async (agentId: string, no = 1) => (await q("insert into ai_agent_versions(agent_id, version_no, config) values($1,$2,'{\"gaya\":\"ramah\"}') returning id", [agentId, no]))[0].id as string;
const publish = (table: string, id: string) => ownerQuery(`update ${table} set status='terbit', published_by=$2, published_at=now() where id=$1`, [id, U]);
const publishedAgent = async (name = "Agen Uji") => { const a = await agent(name); const v = await draft(a); await publish("ai_agent_versions", v); return { a, v }; };
const card = async (code = "TOT-01") => (await q("insert into program_cards(code) values($1) returning id", [code]))[0].id as string;
const cardDraft = async (cardId: string, no = 1) => (await q("insert into program_card_versions(program_card_id, version_no, name) values($1,$2,'Training of Trainers') returning id", [cardId, no]))[0].id as string;
const source = async (scope: "shared" | "agent" = "shared", owner: string | null = null) => (await q("insert into knowledge_sources(title, scope, owner_agent_id, kind) values('Panduan uji',$1,$2,'teks') returning id", [scope, owner]))[0].id as string;
const sourceDraft = async (sid: string, no = 1, text = "Pendaftaran program pelatihan trainer dibuka bulan depan") => (await q("insert into knowledge_source_versions(source_id, version_no, content_text) values($1,$2,$3) returning id", [sid, no, text]))[0].id as string;

describe("@tahap-4 struktur: agent dan versi (draft → terbit → diganti)", () => {
  it("nama agent: tidak dikunci di kode, tidak boleh kembar (tanpa huruf besar/kecil), panjang 1–80, dapat diubah; status hanya aktif/nonaktif", async () => {
    const a = await agent("Chelsea — Admisi");
    expect((await err("insert into ai_agents(name) values('chelsea — admisi')"))?.constraint).toBe("ai_agents_name_unique");
    expect((await err("insert into ai_agents(name) values('   ')"))?.constraint).toBe("ai_agents_name_len");
    expect((await err("insert into ai_agents(name) values($1)", ["x".repeat(81)]))?.constraint).toBe("ai_agents_name_len");
    expect((await err("insert into ai_agents(name, status) values('Lain','dihapus')"))?.constraint).toBe("ai_agents_status");
    expect(await err("update ai_agents set name='Agen Admisi Baru' where id=$1", [a])).toBeNull(); // ganti nama tanpa mengubah kode
    expect((await q("select name from ai_agents where id=$1", [a]))[0].name).toBe("Agen Admisi Baru");
  });

  it("satu DRAFT dan satu TERBIT per agent; nomor versi unik; versi baru harus draft; metadata terbit wajib lengkap", async () => {
    const a = await agent();
    const v1 = await draft(a, 1);
    expect((await err("insert into ai_agent_versions(agent_id, version_no) values($1,2)", [a]))?.constraint).toBe("ai_agent_versions_one_draft");
    expect((await err("insert into ai_agent_versions(agent_id, version_no, status, published_at, published_by) values($1,2,'terbit',now(),$2)", [a, U]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await err("update ai_agent_versions set status='terbit' where id=$1", [v1]))?.constraint).toBe("ai_agent_versions_published_meta"); // terbit tanpa penerbit/waktu
    expect((await err("update ai_agent_versions set version_no=0 where id=$1", [v1]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    await publish("ai_agent_versions", v1);
    const v2 = await draft(a, 2); // draft baru boleh setelah yang lama terbit
    expect((await err("update ai_agent_versions set status='terbit', published_by=$2, published_at=now() where id=$1", [v2, U]))?.constraint).toBe("ai_agent_versions_one_published"); // dua terbit sekaligus ditolak
    expect((await err("insert into ai_agent_versions(agent_id, version_no) values($1,1)", [await agent("Agen Lain")]))).toBeNull(); // nomor versi per agent, bukan global
    await ownerQuery("delete from ai_agent_versions where id=$1", [v2]); // draft boleh dihapus
    expect((await err("insert into ai_agent_versions(agent_id, version_no, status) values($1,0,'draft')", [a]))?.constraint).toBe("ai_agent_versions_no");
  });

  it("alur penerbitan: lama terbit → diganti (tanpa ubah isi), baru draft → terbit; riwayat tetap; terbit/diganti tidak dapat diubah atau dihapus", async () => {
    const a = await agent();
    const v1 = await draft(a, 1); await publish("ai_agent_versions", v1);
    const v2 = await draft(a, 2);
    expect((await err("update ai_agent_versions set status='diganti', config='{}' where id=$1", [v1]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE); // diganti + isi berubah
    expect((await err("update ai_agent_versions set config='{\"gaya\":\"kasar\"}' where id=$1", [v1]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);       // isi terbit berubah
    expect((await err("update ai_agent_versions set status='draft' where id=$1", [v1]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);                      // mundur ke draft
    expect((await err("delete from ai_agent_versions where id=$1", [v1]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await err("update ai_agent_versions set status='diganti' where id=$1", [v2]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);                   // draft tidak langsung diganti
    expect(await err("update ai_agent_versions set status='diganti' where id=$1", [v1])).toBeNull();
    expect(await err("update ai_agent_versions set status='terbit', published_by=$2, published_at=now() where id=$1", [v2, U])).toBeNull();
    expect((await err("update ai_agent_versions set status='terbit' where id=$1", [v1]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);                    // diganti tidak hidup lagi
    expect((await err("delete from ai_agent_versions where id=$1", [v1]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await q("select version_no, status from ai_agent_versions where agent_id=$1 order by version_no", [a]))).toEqual([{ version_no: 1, status: "diganti" }, { version_no: 2, status: "terbit" }]);
  });

  it("aturan versi yang SAMA berlaku untuk versi Kartu Program dan versi knowledge", async () => {
    const c = await card(); const cv = await cardDraft(c);
    const k = await source(); const kv = await sourceDraft(k);
    await publish("program_card_versions", cv); await publish("knowledge_source_versions", kv);
    expect((await err("update program_card_versions set name='Diubah diam-diam' where id=$1", [cv]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await err("update knowledge_source_versions set content_text='Diubah diam-diam' where id=$1", [kv]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await err("delete from program_card_versions where id=$1", [cv]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await err("delete from knowledge_source_versions where id=$1", [kv]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await err("insert into program_card_versions(program_card_id, version_no, status, published_at, published_by) values($1,2,'terbit',now(),$2)", [c, U]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await err("insert into knowledge_source_versions(source_id, version_no, status, published_at, published_by) values($1,2,'terbit',now(),$2)", [k, U]))?.code).toBe(PG_ERR.VERSION_IMMUTABLE);
    expect((await err("insert into program_card_versions(program_card_id, version_no) values($1,2)", [c]))).toBeNull();
    expect((await err("insert into program_card_versions(program_card_id, version_no) values($1,3)", [c]))?.constraint).toBe("program_card_versions_one_draft");
    expect(await err("update program_card_versions set status='diganti' where id=$1", [cv])).toBeNull();
    expect(await err("update knowledge_source_versions set status='diganti' where id=$1", [kv])).toBeNull();
  });
});

describe("@tahap-4 struktur: sumber agent dua arah dan sumber versi terkunci", () => {
  it("sumber pilihan versi: tepat SATU jenis; tanpa duplikat; hanya berubah selama versi DRAFT (terbit = beku)", async () => {
    const a = await agent(); const v = await draft(a); const c = await card(); const k = await source();
    expect((await err("insert into ai_agent_version_sources(version_id) values($1)", [v]))?.constraint).toBe("ai_agent_version_sources_one");
    expect((await err("insert into ai_agent_version_sources(version_id, program_card_id, knowledge_source_id) values($1,$2,$3)", [v, c, k]))?.constraint).toBe("ai_agent_version_sources_one");
    expect(await err("insert into ai_agent_version_sources(version_id, program_card_id) values($1,$2)", [v, c])).toBeNull();
    expect(await err("insert into ai_agent_version_sources(version_id, knowledge_source_id) values($1,$2)", [v, k])).toBeNull();
    expect((await err("insert into ai_agent_version_sources(version_id, program_card_id) values($1,$2)", [v, c]))?.constraint).toBe("ai_agent_version_sources_card_unique");
    expect((await err("insert into ai_agent_version_sources(version_id, knowledge_source_id) values($1,$2)", [v, k]))?.constraint).toBe("ai_agent_version_sources_knowledge_unique");
    await publish("ai_agent_versions", v);
    const k2 = await source();
    expect((await err("insert into ai_agent_version_sources(version_id, knowledge_source_id) values($1,$2)", [v, k2]))?.code).toBe(PG_ERR.SOURCES_LOCKED);
    expect((await err("delete from ai_agent_version_sources where version_id=$1", [v]))?.code).toBe(PG_ERR.SOURCES_LOCKED);
    expect((await err("update ai_agent_version_sources set program_card_id=null, knowledge_source_id=$2 where version_id=$1 and program_card_id is not null", [v, k2]))?.code).toBe(PG_ERR.SOURCES_LOCKED);
    expect((await q("select count(*)::int n from ai_agent_version_sources where version_id=$1", [v]))[0].n).toBe(2); // tak ada yang berubah
    const v2 = await draft(a, 2); // draft berikutnya boleh memilih ulang
    expect(await err("insert into ai_agent_version_sources(version_id, knowledge_source_id) values($1,$2)", [v2, k2])).toBeNull();
    const other = await agent("Agen Kedua"); const ov = await draft(other);
    expect((await err("update ai_agent_version_sources set version_id=$2 where version_id=$1 and knowledge_source_id=$3", [v2, ov, k2]))?.code).toBe(PG_ERR.SOURCES_LOCKED); // tak boleh dipindah antar versi
  });

  it("sisi sumber: kartu mengizinkan agent, knowledge shared mengizinkan agent (kunci ganda tidak dibuat dua kali); knowledge khusus agent wajib punya pemilik, shared tidak boleh", async () => {
    const a = await agent(); const c = await card(); const s = await source();
    await ownerQuery("insert into program_card_agents(program_card_id, agent_id) values($1,$2)", [c, a]);
    await ownerQuery("insert into knowledge_source_agents(source_id, agent_id) values($1,$2)", [s, a]);
    expect((await err("insert into program_card_agents(program_card_id, agent_id) values($1,$2)", [c, a]))?.code).toBe("23505");
    expect((await err("insert into knowledge_source_agents(source_id, agent_id) values($1,$2)", [s, a]))?.code).toBe("23505");
    expect((await err("insert into knowledge_sources(title, scope, kind) values('X','agent','teks')"))?.constraint).toBe("knowledge_sources_owner_rule");
    expect((await err("insert into knowledge_sources(title, scope, owner_agent_id, kind) values('X','shared',$1,'teks')", [a]))?.constraint).toBe("knowledge_sources_owner_rule");
    expect(await err("insert into knowledge_sources(title, scope, owner_agent_id, kind) values('X','agent',$1,'docx')", [a])).toBeNull();
    expect((await err("insert into knowledge_sources(title, scope, kind) values('X','semua','teks')"))?.constraint).toMatch(/^knowledge_sources_(scope|owner_rule)$/); // dua penjaga tumpang-tindih; PostgreSQL mengevaluasi menurut urutan nama
    expect((await err("insert into knowledge_sources(title, scope, kind) values('X','shared','xlsx')"))?.constraint).toBe("knowledge_sources_kind");
    expect((await err("insert into knowledge_sources(title, scope, kind, status) values('X','shared','teks','siap')"))?.constraint).toBe("knowledge_sources_status");
    expect((await err("insert into program_card_agents(program_card_id, agent_id) values($1,$2)", [randomUUID(), a]))?.code).toBe("23503"); // FK
  });
});

describe("@tahap-4 struktur: penempatan agent di channel (satu channel = satu agent aktif; riwayat tetap)", () => {
  const place = (channelId: string, agentId: string) => ownerQuery("insert into ai_channel_agents(channel_id, agent_id, assigned_by) values($1,$2,$3)", [channelId, agentId, U]);

  it("hanya agent AKTIF dengan versi TERBIT pada channel yang belum diarsipkan; draft-saja / nonaktif / channel arsip ditolak", async () => {
    const ch = await makeChannel("Admisi — contoh", "Admisi");
    const noVersion = await agent("Tanpa Versi");
    expect((await err("insert into ai_channel_agents(channel_id, agent_id) values($1,$2)", [ch.id, noVersion]))?.code).toBe(PG_ERR.PLACEMENT_INVALID);
    const onlyDraft = await agent("Hanya Draft"); await draft(onlyDraft);
    expect((await err("insert into ai_channel_agents(channel_id, agent_id) values($1,$2)", [ch.id, onlyDraft]))?.code).toBe(PG_ERR.PLACEMENT_INVALID);
    const { a } = await publishedAgent("Agen Siap");
    const arsip = await makeChannel("Arsip — contoh", "Hotline");
    await ownerQuery("update channels set archived_at=now() where id=$1", [arsip.id]);
    expect((await err("insert into ai_channel_agents(channel_id, agent_id) values($1,$2)", [arsip.id, a]))?.code).toBe(PG_ERR.PLACEMENT_INVALID);
    expect((await err("insert into ai_channel_agents(channel_id, agent_id, ended_at) values($1,$2,now())", [ch.id, a]))?.code).toBe(PG_ERR.PLACEMENT_INVALID); // baru harus aktif
    await place(ch.id, a);
    expect((await q("select count(*)::int n from ai_channel_agents where ended_at is null"))[0].n).toBe(1);
  });

  it("satu channel tidak dapat memiliki dua agent aktif; satu agent boleh di banyak channel; pergantian meninggalkan RIWAYAT (agent lama, baru, waktu, pelaku)", async () => {
    const c1 = await makeChannel("Admisi — contoh", "Admisi"); const c2 = await makeChannel("Hotline — contoh", "Hotline");
    const { a } = await publishedAgent("Agen Satu"); const { a: b } = await publishedAgent("Agen Dua");
    await place(c1.id, a);
    expect((await err("insert into ai_channel_agents(channel_id, agent_id) values($1,$2)", [c1.id, b]))?.constraint).toBe("ai_channel_agents_one_active");
    await place(c2.id, a); // agent yang sama di channel lain
    expect((await q("select count(*)::int n from ai_channel_agents where agent_id=$1 and ended_at is null", [a]))[0].n).toBe(2);
    // ganti agent di channel 1: akhiri lama, lalu tempatkan baru
    expect(await err("update ai_channel_agents set ended_at=now(), ended_by=$2 where channel_id=$1 and ended_at is null", [c1.id, U])).toBeNull();
    await place(c1.id, b);
    const rows = await q("select agent_id, ended_at is not null as berakhir, assigned_by from ai_channel_agents where channel_id=$1 order by assigned_at, id", [c1.id]);
    expect(rows.map((r) => [r.agent_id, r.berakhir])).toEqual([[a, true], [b, false]]);
    expect(rows.every((r) => r.assigned_by === U)).toBe(true);
  });

  it("riwayat penempatan tidak dapat dihapus/diubah (hanya diakhiri SEKALI)", async () => {
    const ch = await makeChannel("Admisi — contoh", "Admisi"); const { a } = await publishedAgent(); const { a: b } = await publishedAgent("Agen Dua");
    await place(ch.id, a);
    expect((await err("update ai_channel_agents set agent_id=$2 where channel_id=$1", [ch.id, b]))?.code).toBe(PG_ERR.PLACEMENT_INVALID);
    expect((await err("update ai_channel_agents set assigned_at = assigned_at - interval '1 day' where channel_id=$1", [ch.id]))?.code).toBe(PG_ERR.PLACEMENT_INVALID);
    expect((await err("delete from ai_channel_agents where channel_id=$1", [ch.id]))?.code).toBe(PG_ERR.PLACEMENT_INVALID);
    await ownerQuery("update ai_channel_agents set ended_at=now(), ended_by=$2 where channel_id=$1", [ch.id, U]);
    expect((await err("update ai_channel_agents set ended_at=now() + interval '1 hour' where channel_id=$1", [ch.id]))?.code).toBe(PG_ERR.PLACEMENT_INVALID);
    expect((await err("update ai_channel_agents set ended_at = assigned_at - interval '1 second' where channel_id=$1 and ended_at is null", [ch.id]))).toBeNull(); // tak ada baris aktif → tak terjadi apa pun
  });

  it("agent yang masih ditempatkan tidak boleh dinonaktifkan/dihapus; setelah penempatan berakhir boleh; agent nonaktif tidak dapat ditempatkan", async () => {
    const ch = await makeChannel("Admisi — contoh", "Admisi"); const { a } = await publishedAgent();
    await place(ch.id, a);
    expect((await err("update ai_agents set status='nonaktif' where id=$1", [a]))?.code).toBe(PG_ERR.AGENT_IN_USE);
    expect((await err("delete from ai_agents where id=$1", [a]))?.code).toBe(PG_ERR.AGENT_IN_USE);
    expect(await err("update ai_agents set name='Agen Dipakai (ganti nama)' where id=$1", [a])).toBeNull(); // ganti nama tetap boleh
    await ownerQuery("update ai_channel_agents set ended_at=now(), ended_by=$2 where channel_id=$1 and ended_at is null", [ch.id, U]);
    expect(await err("update ai_agents set status='nonaktif' where id=$1", [a])).toBeNull();
    expect((await err("insert into ai_channel_agents(channel_id, agent_id) values($1,$2)", [ch.id, a]))?.code).toBe(PG_ERR.PLACEMENT_INVALID);
  });
});

describe("@tahap-4 struktur: Kartu Program — bentuk data yang tak boleh salah", () => {
  it("kode: format dan unik tanpa huruf besar/kecil; status draft|aktif|diarsipkan; 'aktif' hanya bila ada versi TERBIT", async () => {
    const c = await card("ToT-2027");
    expect((await err("insert into program_cards(code) values('tot-2027')"))?.constraint).toBe("program_cards_code_unique");
    for (const bad of ["x", "-awal", "ada spasi", "a".repeat(41), "kode/miring"]) expect((await err("insert into program_cards(code) values($1)", [bad]))?.constraint, bad).toBe("program_cards_code_fmt");
    expect((await err("insert into program_cards(code, status) values('Lain-1','aneh')"))?.constraint).toBe("program_cards_status");
    expect((await err("insert into program_cards(code, status) values('Lain-2','aktif')"))?.code).toBe(PG_ERR.ACTIVE_NEEDS_PUBLISHED);
    expect((await err("update program_cards set status='aktif' where id=$1", [c]))?.code).toBe(PG_ERR.ACTIVE_NEEDS_PUBLISHED);
    const v = await cardDraft(c);
    expect((await err("update program_cards set status='aktif' where id=$1", [c]))?.code).toBe(PG_ERR.ACTIVE_NEEDS_PUBLISHED); // draft belum cukup
    await publish("program_card_versions", v);
    expect(await err("update program_cards set status='aktif' where id=$1", [c])).toBeNull();
    expect(await err("update program_cards set status='diarsipkan' where id=$1", [c])).toBeNull();
  });

  it("URL pendaftaran hanya https tanpa spasi (≤ 2000); mode online/offline; tanggal nyata dan selesai ≥ mulai; zona waktu bawaan Asia/Jakarta", async () => {
    const c = await card();
    const ins = (cols: string, vals: string, no: number) => err(`insert into program_card_versions(program_card_id, version_no, ${cols}) values($1,${no}, ${vals})`, [c]);
    expect((await ins("registration_url", "'http://daftar.contoh.test/x'", 1))?.constraint).toBe("program_card_versions_url");
    expect((await ins("registration_url", "'javascript:alert(1)'", 1))?.constraint).toBe("program_card_versions_url");
    expect((await ins("registration_url", "'https://daftar.contoh.test/a b'", 1))?.constraint).toBe("program_card_versions_url");
    expect((await ins("registration_url", `'https://x.test/${"a".repeat(2000)}'`, 1))?.constraint).toBe("program_card_versions_url");
    expect((await ins("mode", "'hybrid'", 1))?.constraint).toBe("program_card_versions_mode");
    expect((await ins("schedule_start, schedule_end", "'2027-03-10','2027-03-01'", 1))?.constraint).toBe("program_card_versions_dates");
    expect((await ins("schedule_start", "'2027-02-31'", 1))?.code).toBe("22008"); // tanggal tak ada di kalender
    expect(await ins("registration_url, mode, schedule_start, schedule_end", "'https://daftar.contoh.test/tot','online','2027-03-01','2027-03-02'", 1)).toBeNull();
    const row = (await q("select timezone, schedule_start::text s, registration_close_at from program_card_versions where program_card_id=$1", [c]))[0];
    expect([row.timezone, row.s, row.registration_close_at]).toEqual(["Asia/Jakarta", "2027-03-01", null]); // tanggal kalender tidak bergeser oleh zona proses
    const c2 = await card("TOT-02");
    expect(await err("insert into program_card_versions(program_card_id, version_no, registration_url) values($1,1,null)", [c2])).toBeNull(); // kosong = sah pada draft; kelayakan tautan diputuskan kode saat kirim
  });
});

describe("@tahap-4 struktur: knowledge — status, pencarian teks penuh, dan hak akses data", () => {
  it("'aktif' membutuhkan versi terbit; pencarian teks penuh config indonesian (GIN) menemukan isi versi; kolom turunan tidak dapat ditulis", async () => {
    const s = await source(); const v = await sourceDraft(s, 1, "Pendaftaran program pelatihan trainer dibuka bulan depan. Biaya mengikuti kartu program.");
    expect((await err("update knowledge_sources set status='aktif' where id=$1", [s]))?.code).toBe(PG_ERR.ACTIVE_NEEDS_PUBLISHED);
    await publish("knowledge_source_versions", v);
    expect(await err("update knowledge_sources set status='aktif' where id=$1", [s])).toBeNull();
    const hit = await q("select count(*)::int n from knowledge_source_versions where content_tsv @@ plainto_tsquery('indonesian','pelatihan trainer')");
    expect(hit[0].n).toBe(1);
    expect((await q("select count(*)::int n from knowledge_source_versions where content_tsv @@ plainto_tsquery('indonesian','kereta cepat')"))[0].n).toBe(0);
    // stemmer bahasa Indonesia (bukan config 'simple'): imbuhan dilepas → "mendaftar"/"melatih" menemukan "Pendaftaran"/"pelatihan"
    expect((await q("select count(*)::int n from knowledge_source_versions where content_tsv @@ plainto_tsquery('indonesian','mendaftar melatih')"))[0].n).toBe(1);
    expect((await err("update knowledge_source_versions set content_tsv = to_tsvector('x') where id=$1", [v]))?.code).toBe("428C9"); // generated column
    const idx = (await q("select indexdef from pg_indexes where indexname='knowledge_source_versions_fts_idx'"))[0].indexdef as string;
    expect(idx).toMatch(/USING gin \(content_tsv\)/);
    expect((await err("insert into knowledge_source_versions(source_id, version_no, content_sha256) values($1,2,'bukan-hash')", [s]))?.constraint).toBe("knowledge_source_versions_sha");
    expect((await err("insert into knowledge_source_versions(source_id, version_no, byte_size) values($1,2,-1)", [s]))?.constraint).toBe("knowledge_source_versions_size");
  });

  it("peran aplikasi (teone_app) dapat memakai tabel baru (hak runtime diterapkan), tetapi penjaga TETAP berlaku bagi aplikasi dan DDL ditolak", async () => {
    const app = new Client({ connectionString: TEST_APP_URL });
    await app.connect();
    try {
      const a = (await app.query("insert into ai_agents(name) values('Agen via aplikasi') returning id")).rows[0].id;
      const v = (await app.query("insert into ai_agent_versions(agent_id, version_no) values($1,1) returning id", [a])).rows[0].id;
      await app.query("update ai_agent_versions set status='terbit', published_by=$2, published_at=now() where id=$1", [v, U]);
      const e = await app.query("update ai_agent_versions set config='{\"x\":1}' where id=$1", [v]).catch((x) => x as PgErr);
      expect((e as PgErr).code).toBe(PG_ERR.VERSION_IMMUTABLE);
      expect(((await app.query("create table z(a int)").catch((x) => x)) as PgErr).code).toBe("42501");
      for (const t of ["ai_agents", "ai_agent_versions", "ai_agent_version_sources", "ai_channel_agents", "program_cards", "program_card_versions", "program_card_agents", "knowledge_sources", "knowledge_source_versions", "knowledge_source_agents"]) {
        const p = await app.query("select has_table_privilege('teone_app', $1, 'SELECT,INSERT,UPDATE') ok", [t]);
        expect(p.rows[0].ok, t).toBe(true);
      }
    } finally { await app.end(); }
  });
});
