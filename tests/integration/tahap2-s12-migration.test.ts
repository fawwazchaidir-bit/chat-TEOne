/**
 * Migrasi 0006 (S-12; expand-only): diuji pada DATABASE KOSONG (database uji dibuat dari nol) DAN pada SNAPSHOT data tahap sebelumnya (0000–0005 + data contoh).
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
const SNAP = "teone_snap6";
/** Jumlah migrasi = isi jurnal (semua migrasi harus terterap; tes ini tidak perlu diubah setiap ada migrasi baru). */
const JOURNAL_COUNT: number = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries.length;
const url = (user: string, pw: string) => `postgres://${user}:${pw}@${TEST_DB_HOST}/${SNAP}`;

describe("@tahap-2 S-12 migrasi 0006: database kosong", () => {
  it("tabel smb_sync_requests + kolom onboarding ada; kolom baru nullable tanpa nilai bawaan; UNIQUE 'sekali saja' ada", async () => {
    expect((await ownerQuery("select to_regclass('smb_sync_requests') r")).rows[0].r).not.toBeNull();
    const cols = (await ownerQuery("select column_name, is_nullable, column_default from information_schema.columns where table_name='channel_connections' and column_name like 'coexistence_onboarded_%' order by column_name")).rows;
    expect(cols.map((c) => [c.column_name, c.is_nullable, c.column_default])).toEqual([["coexistence_onboarded_at", "YES", null], ["coexistence_onboarded_by", "YES", null], ["coexistence_onboarded_source", "YES", null]]);
    const idx = (await ownerQuery("select indexdef from pg_indexes where indexname='smb_sync_requests_once'")).rows[0].indexdef as string;
    expect(idx).toMatch(/CREATE UNIQUE INDEX smb_sync_requests_once .*\(channel_id, sync_type, mapping_version\)/);
  });
});

describe("@tahap-2 S-12 migrasi 0006: snapshot data tahap sebelumnya (0000–0005 + data contoh) → 0006", () => {
  it("0 kehilangan data; kolom baru NULL; constraint baru berlaku; peran aplikasi dapat memakai tabel baru; diulang = idempoten", async () => {
    const admin = new Client({ connectionString: TEST_ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${SNAP} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${SNAP} OWNER teone_owner`);
    await admin.end();
    const sup = new Client({ connectionString: TEST_ADMIN_URL.replace(/\/[^/]*$/, `/${SNAP}`) });
    await sup.connect();
    await sup.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO teone_owner; GRANT USAGE ON SCHEMA public TO teone_app;");
    await sup.end();

    const tmp = mkdtempSync(path.join(os.tmpdir(), "teone-mig6-"));
    try {
      mkdirSync(path.join(tmp, "meta"), { recursive: true });
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      const upTo5 = { ...journal, entries: journal.entries.filter((e: { idx: number }) => e.idx <= 5) };
      expect(upTo5.entries).toHaveLength(6);
      writeFileSync(path.join(tmp, "meta/_journal.json"), JSON.stringify(upTo5));
      for (const e of upTo5.entries) cpSync(`drizzle/${e.tag}.sql`, path.join(tmp, `${e.tag}.sql`));
      const pool = new Pool({ connectionString: url("teone_owner", "owner_test_pw"), max: 1 });
      await migrate(drizzle(pool), { migrationsFolder: tmp });
      await pool.query(readFileSync("db/grants.sql", "utf8"));
      await pool.query(`
        insert into channels(name,function_label,integration_kind,environment,is_sample) values ('Kemitraan — contoh','Kemitraan','cloud_api_coexistence','development',true),('Hotline — contoh','Hotline','cloud_api_only','development',true);
        insert into channel_connections(channel_id, waba_id, phone_number_id, verification_status, verification_mode, verified_at, history_progress, mapping_version)
          select id, '100000000000006', '200000000000006', 'terverifikasi', 'simulasi', now(), '{"phase":1,"progress":40}'::jsonb, 3 from channels where name like 'Kemitraan%';
        insert into contacts(display_name) values ('Peserta Uji');
        insert into feature_flag_overrides(key, enabled) values ('whatsapp_connector', true);
        insert into audit_log(actor_label, action, result) values ('uji','a.1','success'), ('uji','a.2','failure');`);
      expect((await pool.query("select to_regclass('smb_sync_requests') r")).rows[0].r).toBeNull(); // belum ada sebelum 0006
      expect((await pool.query("select count(*)::int n from information_schema.columns where table_name='channel_connections' and column_name like 'coexistence_onboarded_%'")).rows[0].n).toBe(0);
      await pool.end();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }

    await runMigrations(url("teone_owner", "owner_test_pw"), { quiet: true }); // jalur operasional yang sama; menerapkan 0006 (dan hak runtime)
    const o = new Client({ connectionString: url("teone_owner", "owner_test_pw") });
    await o.connect();
    try {
      expect((await o.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n).toBe(JOURNAL_COUNT);
      // data lama utuh; nilai tak berubah
      expect((await o.query("select count(*)::int n from channels")).rows[0].n).toBe(2);
      expect((await o.query("select count(*)::int n from contacts")).rows[0].n).toBe(1);
      expect((await o.query("select count(*)::int n from audit_log")).rows[0].n).toBe(2);
      expect((await o.query("select enabled from feature_flag_overrides where key='whatsapp_connector'")).rows[0].enabled).toBe(true);
      const cc = (await o.query("select mapping_version, verification_status, verification_mode, history_progress, coexistence_onboarded_at, coexistence_onboarded_source, coexistence_onboarded_by from channel_connections")).rows[0];
      expect(cc).toEqual({ mapping_version: 3, verification_status: "terverifikasi", verification_mode: "simulasi", history_progress: { phase: 1, progress: 40 }, coexistence_onboarded_at: null, coexistence_onboarded_source: null, coexistence_onboarded_by: null });
      expect((await o.query("select count(*)::int n from smb_sync_requests")).rows[0].n).toBe(0);
      // constraint baru
      const ch = (await o.query("select id from channels where name like 'Kemitraan%'")).rows[0].id;
      const err = async (q: string, p: unknown[] = []) => ((await o.query(q, p).catch((e) => e)) as { code?: string; constraint?: string });
      expect((await err("update channel_connections set coexistence_onboarded_source = 'dinyatakan_admin'")).constraint).toBe("channel_connections_onboarded_source"); // sumber tanpa waktu
      expect((await err("update channel_connections set coexistence_onboarded_at = now()")).constraint).toBe("channel_connections_onboarded_source"); // waktu tanpa sumber
      expect((await err("update channel_connections set coexistence_onboarded_at = now(), coexistence_onboarded_source = 'meta_webhook'")).constraint).toBe("channel_connections_onboarded_source"); // sumber tak dikenal (belum ada sumber resmi)
      expect((await err("update channel_connections set coexistence_onboarded_at = now(), coexistence_onboarded_source = 'dinyatakan_admin'")).code).toBeUndefined();
      expect((await err("insert into smb_sync_requests(channel_id, sync_type, mapping_version) values ($1,'messages',3)", [ch])).constraint).toBe("smb_sync_requests_type");
      expect((await err("insert into smb_sync_requests(channel_id, sync_type, mapping_version, status) values ($1,'history',3,'berhasil')", [ch])).constraint).toBe("smb_sync_requests_status");
      expect((await err("insert into smb_sync_requests(channel_id, sync_type, mapping_version, failure_kind) values ($1,'history',3,'aneh')", [ch])).constraint).toBe("smb_sync_requests_failure_kind");
      expect((await err("insert into smb_sync_requests(channel_id, sync_type, mapping_version) values ($1,'history',3)", [ch])).code).toBeUndefined();
      expect((await err("insert into smb_sync_requests(channel_id, sync_type, mapping_version) values ($1,'history',3)", [ch])).constraint).toBe("smb_sync_requests_once"); // sekali saja
      expect((await err("insert into smb_sync_requests(channel_id, sync_type, mapping_version) values ($1,'history',4)", [ch])).code).toBeUndefined(); // versi pemetaan lain = siklus baru
      expect((await err("insert into smb_sync_requests(channel_id, sync_type, mapping_version) values ($1,'history',5)", [randomUuidLike()])).code).toBe("23503"); // FK ke channels
      // pengaman tahap sebelumnya tetap berlaku
      expect((await o.query("update audit_log set action = 'x'").catch((e) => e)).code).toBe("42501");
      expect((await o.query("update channels set status = 'terhubung'").catch((e) => e)).code).toBe("23514");
      await runMigrations(url("teone_owner", "owner_test_pw"), { quiet: true }); // idempoten
      expect((await o.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n).toBe(JOURNAL_COUNT);
    } finally {
      await o.end();
    }
    const app = new Client({ connectionString: url("teone_app", "app_test_pw") });
    await app.connect();
    try {
      const ch = (await app.query("select id from channels where name like 'Kemitraan%'")).rows[0].id;
      await app.query("insert into smb_sync_requests(channel_id, sync_type, mapping_version) values ($1,'smb_app_state_sync',3)", [ch]);
      expect((await app.query("update smb_sync_requests set status='diterima_meta' where sync_type='smb_app_state_sync'")).rowCount).toBe(1);
      expect((await app.query("create table z(a int)").catch((e) => e)).code).toBe("42501");
    } finally {
      await app.end();
    }
    const adm = new Client({ connectionString: TEST_ADMIN_URL });
    await adm.connect();
    await adm.query(`DROP DATABASE IF EXISTS ${SNAP} WITH (FORCE)`);
    await adm.end();
  });
});

const randomUuidLike = () => "00000000-0000-4000-8000-000000000000";
