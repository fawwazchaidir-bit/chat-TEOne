/**
 * Menjalankan migrasi (maju saja) lalu menerapkan hak runtime.
 * Memakai DATABASE_MIGRATION_URL (role pemilik) — BUKAN koneksi runtime aplikasi.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export async function runMigrations(url: string, opts: { quiet?: boolean } = {}) {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    await pool.query(readFileSync(path.resolve(process.cwd(), "db/grants.sql"), "utf8"));
    if (!opts.quiet) console.log("Migrasi selesai dan hak runtime diterapkan.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) {
    console.error("DATABASE_MIGRATION_URL wajib diisi.");
    process.exit(1);
  }
  runMigrations(url).catch((e) => {
    console.error("Migrasi gagal:", e.message);
    process.exit(1);
  });
}
