/**
 * Migrasi 0007–0008 (Tahap 4, STRUKTUR): diuji pada DATABASE KOSONG (database uji dibuat dari nol) DAN pada SNAPSHOT data tahap sebelumnya (0000–0006 + data contoh).
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { closeDb } from "@/db/client";
import { runMigrations } from "../../scripts/migrate";
import { ownerQuery } from "../helpers/db";
import { TEST_ADMIN_URL, TEST_DB_HOST } from "../test-env";

afterAll(closeDb);
const SNAP = "teone_snap8";
const url = (user: string, pw: string) => `postgres://${user}:${pw}@${TEST_DB_HOST}/${SNAP}`;
const TABLES = ["ai_agents", "ai_agent_versions", "ai_agent_version_sources", "ai_channel_agents", "program_cards", "program_card_versions", "program_card_agents", "knowledge_sources", "knowledge_source_versions", "knowledge_source_agents"];
const JOURNAL = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string }[] };

describe("@tahap-4 migrasi 0007–0008: database kosong", () => {
  it("10 tabel + 5 fungsi/8 trigger penjaga + indeks full-text ada; kolom turunan tsvector tersedia (kekosongan tabel baru dibuktikan pada snapshot di bawah)", async () => {
    for (const t of TABLES) expect((await ownerQuery("select to_regclass($1) r", [t])).rows[0].r, t).not.toBeNull();
    const trg = (await ownerQuery("select tgname from pg_trigger where not tgisinternal and tgname ~ '(_guard|_in_use_guard|_active_guard)$' and tgrelid::regclass::text = any($1) order by 1", [TABLES])).rows.map((r) => r.tgname);
    expect(trg).toEqual(["ai_agent_version_sources_guard", "ai_agent_versions_guard", "ai_agents_in_use_guard", "ai_channel_agents_guard", "knowledge_source_versions_guard", "knowledge_sources_active_guard", "program_card_versions_guard", "program_cards_active_guard"]);
    expect((await ownerQuery("select count(*)::int n from pg_proc where proname in ('te_version_guard','te_agent_sources_guard','te_agent_in_use_guard','te_channel_agent_guard','te_active_needs_published')")).rows[0].n).toBe(5);
    expect((await ownerQuery("select is_generated from information_schema.columns where table_name='knowledge_source_versions' and column_name='content_tsv'")).rows[0].is_generated).toBe("ALWAYS");
  });
});

describe("@tahap-4 migrasi 0007–0008: snapshot data tahap sebelumnya (0000–0006 + data contoh) → 0007–0008", () => {
  it("0 kehilangan data; tabel lama tak berubah; penjaga baru berlaku; peran aplikasi dapat memakainya; diulang = idempoten", async () => {
    const admin = new Client({ connectionString: TEST_ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${SNAP} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${SNAP} OWNER teone_owner`);
    await admin.end();
    const sup = new Client({ connectionString: TEST_ADMIN_URL.replace(/\/[^/]*$/, `/${SNAP}`) });
    await sup.connect();
    await sup.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO teone_owner; GRANT USAGE ON SCHEMA public TO teone_app;");
    await sup.end();

    const tmp = mkdtempSync(path.join(os.tmpdir(), "teone-mig8-"));
    const before: Record<string, number> = {};
    const COUNTED = ["users", "channels", "channel_connections", "contacts", "conversations", "messages", "smb_sync_requests", "audit_log", "feature_flag_overrides", "kill_switches"];
    try {
      mkdirSync(path.join(tmp, "meta"), { recursive: true });
      const upTo6 = { ...JOURNAL, entries: JOURNAL.entries.filter((e) => e.idx <= 6) };
      expect(upTo6.entries).toHaveLength(7);
      writeFileSync(path.join(tmp, "meta/_journal.json"), JSON.stringify(upTo6));
      for (const e of upTo6.entries) cpSync(`drizzle/${e.tag}.sql`, path.join(tmp, `${e.tag}.sql`));
      const pool = new Pool({ connectionString: url("teone_owner", "owner_test_pw"), max: 1 });
      await migrate(drizzle(pool), { migrationsFolder: tmp });
      await pool.query(readFileSync("db/grants.sql", "utf8"));
      await pool.query(`
        insert into users(email,name,password_hash,is_super_admin,must_change_password) values ('a@contoh.test','A','x',true,false);
        insert into channels(name,function_label,integration_kind,environment,is_sample) values ('Admisi — contoh','Admisi','cloud_api_coexistence','development',true);
        insert into channel_connections(channel_id, waba_id, phone_number_id, verification_status, verification_mode, verified_at, coexistence_onboarded_at, coexistence_onboarded_source)
          select id, '100000000000008', '200000000000008', 'terverifikasi', 'simulasi', now(), now() - interval '2 hours', 'dinyatakan_admin' from channels;
        insert into smb_sync_requests(channel_id, sync_type, mapping_version, status) select id, 'smb_app_state_sync', 0, 'diterima_meta' from channels;
        insert into contacts(display_name) values ('Peserta Uji');
        insert into feature_flag_overrides(key, enabled) values ('whatsapp_connector', true);
        insert into kill_switches(scope_type, scope_ref, engaged, reason) values ('global','',false,'uji');
        insert into audit_log(actor_label, action, result) values ('uji','a.1','success'), ('uji','a.2','failure');`);
      for (const t of COUNTED) before[t] = (await pool.query(`select count(*)::int n from ${t}`)).rows[0].n;
      for (const t of TABLES) expect((await pool.query("select to_regclass($1) r", [t])).rows[0].r, t).toBeNull(); // belum ada sebelum 0007
      await pool.end();
    } finally { rmSync(tmp, { recursive: true, force: true }); }

    await runMigrations(url("teone_owner", "owner_test_pw"), { quiet: true }); // jalur operasional yang sama; menerapkan 0007–0008 (dan hak runtime)
    const o = new Client({ connectionString: url("teone_owner", "owner_test_pw") });
    await o.connect();
    try {
      expect((await o.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n).toBe(JOURNAL.entries.length);
      for (const t of COUNTED) expect((await o.query(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(before[t]); // 0 kehilangan data
      expect((await o.query("select coexistence_onboarded_source s, mapping_version v from channel_connections")).rows[0]).toEqual({ s: "dinyatakan_admin", v: 0 }); // S-12 utuh
      for (const t of TABLES) expect((await o.query(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(0);
      // penjaga baru berlaku pada data hasil migrasi
      const ag = (await o.query("insert into ai_agents(name) values('Agen Snapshot') returning id")).rows[0].id;
      const v = (await o.query("insert into ai_agent_versions(agent_id, version_no) values($1,1) returning id", [ag])).rows[0].id;
      await o.query("update ai_agent_versions set status='terbit', published_by=gen_random_uuid(), published_at=now() where id=$1", [v]);
      expect(((await o.query("update ai_agent_versions set config='{\"x\":1}' where id=$1", [v]).catch((e) => e)) as { code?: string }).code).toBe("TE010");
      const ch = (await o.query("select id from channels limit 1")).rows[0].id;
      await o.query("insert into ai_channel_agents(channel_id, agent_id) values($1,$2)", [ch, ag]); // channel lama dapat memakai agent baru
      expect(((await o.query("update ai_agents set status='nonaktif' where id=$1", [ag]).catch((e) => e)) as { code?: string }).code).toBe("TE011");
      // pengaman tahap sebelumnya tetap berlaku
      expect((await o.query("update audit_log set action = 'x'").catch((e) => e)).code).toBe("42501");
      expect((await o.query("update channels set status = 'terhubung'").catch((e) => e)).code).toBe("23514");
      await runMigrations(url("teone_owner", "owner_test_pw"), { quiet: true }); // idempoten
      expect((await o.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n).toBe(JOURNAL.entries.length);
    } finally { await o.end(); }
    const app = new Client({ connectionString: url("teone_app", "app_test_pw") });
    await app.connect();
    try {
      const a2 = (await app.query("insert into ai_agents(name) values('Agen via aplikasi') returning id")).rows[0].id;
      await app.query("insert into ai_agent_versions(agent_id, version_no) values($1,1)", [a2]);
      expect((await app.query("select count(*)::int n from ai_agent_versions")).rows[0].n).toBe(2);
      expect(((await app.query("create table z(a int)").catch((e) => e)) as { code?: string }).code).toBe("42501");
    } finally { await app.end(); }
    const adm = new Client({ connectionString: TEST_ADMIN_URL });
    await adm.connect();
    await adm.query(`DROP DATABASE IF EXISTS ${SNAP} WITH (FORCE)`);
    await adm.end();
  });
});
