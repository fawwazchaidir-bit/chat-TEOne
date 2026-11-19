import { Client } from "pg";
import { runMigrations } from "../scripts/migrate";
import { TEST_ADMIN_URL, TEST_DB, TEST_OWNER_URL } from "./test-env";

/** Membuat ulang database uji dari NOL, sehingga setiap eksekusi juga menguji migrasi pada DB kosong. */
export default async function setup() {
  const admin = new Client({ connectionString: TEST_ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    for (const [role, pw, extra] of [
      ["teone_owner", "owner_test_pw", ""],
      ["teone_app", "app_test_pw", "NOSUPERUSER NOCREATEDB NOCREATEROLE"],
    ] as const) {
      const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      if (exists.rowCount === 0) await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${pw}' ${extra}`);
      else await admin.query(`ALTER ROLE ${role} PASSWORD '${pw}'`);
    }
    await admin.query(`CREATE DATABASE ${TEST_DB} OWNER teone_owner`);
  } finally {
    await admin.end();
  }
  const db = new Client({ connectionString: TEST_ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`) });
  await db.connect();
  await db.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO teone_owner; GRANT USAGE ON SCHEMA public TO teone_app;");
  await db.end();
  await runMigrations(TEST_OWNER_URL, { quiet: true });
}
