import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { closeDb } from "@/db/client";
import { purgeRawPayloads } from "@/modules/whatsapp-adapter";
import { runMaintenance } from "@/modules/conversations-messages";
import { runMigrations } from "../../scripts/migrate";
import { ownerQuery, resetDb } from "../helpers/db";
import { TEST_ADMIN_URL } from "../test-env";
import { CUSTOMER, envelope, messagesChange, postWebhook, textMsg, world } from "../helpers/whatsapp";

afterAll(closeDb);

const SNAP = "teone_snap";
const url = (user: string, pw: string) => `postgres://${user}:${pw}@localhost:5432/${SNAP}`;
const TAHAP1_TABLES = ["org_settings", "users", "roles", "user_roles", "role_grants", "user_grants", "sessions", "recovery_codes", "login_attempts", "teams", "team_members", "channels", "team_channels", "audit_log", "feature_flag_overrides", "kill_switches"];
const TAHAP2_TABLES = ["contacts", "contact_identities", "channel_connections", "inbound_events", "conversations", "messages", "message_status_events", "lead_sources", "media", "test_recipients"];

describe("@tahap-2 migrasi 0002: maju-saja, diuji pada snapshot data Tahap 1 (GATE B2)", () => {
  it("snapshot Tahap 1 (migrasi 0000–0001 + data contoh) → terapkan 0002 → 0 kehilangan data, pengaman Tahap 1 tetap berlaku, tabel baru siap", async () => {
    const admin = new Client({ connectionString: TEST_ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${SNAP} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${SNAP} OWNER teone_owner`);
    await admin.end();
    const sup = new Client({ connectionString: TEST_ADMIN_URL.replace(/\/[^/]*$/, `/${SNAP}`) });
    await sup.connect();
    await sup.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO teone_owner; GRANT USAGE ON SCHEMA public TO teone_app;");
    await sup.end();

    // 1) skema Tahap 1 PERSIS (hanya entri jurnal 0000 dan 0001)
    const tmp = mkdtempSync(path.join(os.tmpdir(), "teone-mig-"));
    try {
      mkdirSync(path.join(tmp, "meta"), { recursive: true });
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      expect(journal.entries.map((e: { tag: string }) => e.tag)).toEqual(["0000_initial_schema", "0001_constraints_and_triggers", "0002_tahap2_whatsapp_connector"]);
      const t1 = { ...journal, entries: journal.entries.filter((e: { idx: number }) => e.idx <= 1) };
      writeFileSync(path.join(tmp, "meta/_journal.json"), JSON.stringify(t1));
      for (const e of t1.entries) cpSync(`drizzle/${e.tag}.sql`, path.join(tmp, `${e.tag}.sql`));
      const pool = new Pool({ connectionString: url("teone_owner", "owner_test_pw"), max: 1 });
      await migrate(drizzle(pool), { migrationsFolder: tmp });
      await pool.query(readFileSync("db/grants.sql", "utf8"));

      // 2) data contoh Tahap 1
      await pool.query(`
        insert into users(email,name,password_hash,is_super_admin,must_change_password) values ('a@contoh.test','A','x',true,false),('b@contoh.test','B','x',false,false);
        insert into roles(name) values ('Peran 1'),('Peran 2');
        insert into channels(name,function_label,integration_kind,environment,is_sample) values ('Admisi — contoh','Admisi','cloud_api_only','development',true),('Hotline — contoh','Hotline','cloud_api_only','development',true);
        insert into teams(name) values ('Tim 1');
        insert into feature_flag_overrides(key,enabled) values ('inbox', true);
        insert into kill_switches(scope_type,scope_ref,engaged,reason) values ('global','',true,'uji');
        insert into audit_log(actor_label,action,result) values ('uji','a.1','success'),('uji','a.2','success'),('uji','a.3','failure');`);
      const before: Record<string, number> = {};
      for (const t of TAHAP1_TABLES) before[t] = (await pool.query(`select count(*)::int n from ${t}`)).rows[0].n;
      expect(before.users).toBe(2);
      expect(before.audit_log).toBe(3);
      for (const t of TAHAP2_TABLES) expect((await pool.query("select to_regclass($1) r", [t])).rows[0].r, t).toBeNull(); // belum ada
      await pool.end();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }

    // 3) migrasi penuh pada snapshot (jalur operasional yang sama)
    await runMigrations(url("teone_owner", "owner_test_pw"), { quiet: true });
    const o = new Client({ connectionString: url("teone_owner", "owner_test_pw") });
    await o.connect();
    try {
      expect((await o.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n).toBe(3);
      expect((await o.query("select count(*)::int n from users")).rows[0].n).toBe(2);
      expect((await o.query("select count(*)::int n from channels")).rows[0].n).toBe(2);
      expect((await o.query("select count(*)::int n from audit_log")).rows[0].n).toBe(3);
      expect((await o.query("select engaged from kill_switches")).rows[0].engaged).toBe(true);
      expect((await o.query("select enabled from feature_flag_overrides")).rows[0].enabled).toBe(true);
      for (const t of TAHAP2_TABLES) expect((await o.query(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(0);
      // pengaman Tahap 1 TETAP berlaku setelah migrasi
      expect((await o.query("update audit_log set action = 'x'").catch((e) => e)).code).toBe("42501");
      expect((await o.query("update channels set status = 'terhubung'").catch((e) => e)).code).toBe("23514");
      expect((await o.query("update users set status = 'disabled' where is_super_admin").catch((e) => e)).code).toBe("TE002");
      expect((await o.query("select count(*)::int n from pg_trigger where not tgisinternal")).rows[0].n).toBeGreaterThanOrEqual(5);
      // tabel baru berkaitan dengan data Tahap 1 (FK ke channel yang sudah ada)
      const ch = (await o.query("select id from channels limit 1")).rows[0].id;
      await o.query("insert into channel_connections(channel_id, waba_id, phone_number_id) values ($1,'100000000000003','200000000000003')", [ch]);
      // migrasi diulang → idempoten
      await runMigrations(url("teone_owner", "owner_test_pw"), { quiet: true });
      expect((await o.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n).toBe(3);
    } finally {
      await o.end();
    }
    // role aplikasi: dapat memakai tabel baru, TIDAK dapat mengubah audit
    const app = new Client({ connectionString: url("teone_app", "app_test_pw") });
    await app.connect();
    try {
      await app.query("insert into contacts(display_name) values ('uji')");
      expect((await app.query("select count(*)::int n from contacts")).rows[0].n).toBe(1);
      expect((await app.query("update audit_log set action = 'x'").catch((e) => e)).code).toBe("42501");
      expect((await app.query("create table z(a int)").catch((e) => e)).code).toBe("42501");
    } finally {
      await app.end();
    }
    const adm = new Client({ connectionString: TEST_ADMIN_URL });
    await adm.connect();
    await adm.query(`DROP DATABASE IF EXISTS ${SNAP} WITH (FORCE)`);
    await adm.end();
  });

  it("database kosong: seluruh tabel Tahap 1 + Tahap 2 ada (database uji dibuat dari nol tiap eksekusi)", async () => {
    for (const t of [...TAHAP1_TABLES, ...TAHAP2_TABLES]) expect((await ownerQuery("select to_regclass($1) r", [t])).rows[0].r, t).not.toBeNull();
  });
});

describe("@tahap-2 retensi payload mentah (D-18, ASUMSI ≤ 30 hari)", () => {
  beforeEach(resetDb);
  it("payload event yang selesai/gagal/terkarantina lebih tua dari 30 hari di-NULL-kan; yang pending & yang baru tidak disentuh; pesan tetap utuh", async () => {
    await world();
    await postWebhook(envelope([messagesChange({ messages: [textMsg("wamid.uji.lama", CUSTOMER, "lama"), textMsg("wamid.uji.baru", CUSTOMER, "baru"), textMsg("wamid.uji.pending", CUSTOMER, "tunda")] })]));
    const { processInboundBatch } = await import("@/modules/conversations-messages");
    await processInboundBatch({ limit: 2 });
    await ownerQuery("update inbound_events set received_at = now() - interval '31 days' where event_key in ('msg:wamid.uji.lama','msg:wamid.uji.pending')");
    const n = await purgeRawPayloads();
    expect(n).toBe(1); // hanya 'lama' (processed & > 30 hari); 'pending' meski lama TIDAK dibuang (belum diproses)
    const rows = (await ownerQuery("select event_key, status, payload is null as kosong from inbound_events order by event_key")).rows;
    expect(rows).toEqual([
      { event_key: "msg:wamid.uji.baru", status: "processed", kosong: false },
      { event_key: "msg:wamid.uji.lama", status: "processed", kosong: true },
      { event_key: "msg:wamid.uji.pending", status: "pending", kosong: false },
    ]);
    expect((await ownerQuery("select count(*)::int n from messages")).rows[0].n).toBe(2); // jejak pesan tidak terpengaruh
    expect((await runMaintenance()).purged).toBe(0); // idempoten
  });
});
