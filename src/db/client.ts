import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

export type Db = NodePgDatabase<typeof schema>;
/** Executor bisa berupa koneksi biasa atau transaksi. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const g = globalThis as unknown as { __teonePool?: Pool; __teoneDb?: Db };

function getPool(): Pool {
  if (!g.__teonePool) {
    g.__teonePool = new Pool({
      connectionString: getEnv().DATABASE_URL, // role `teone_app`: tanpa DDL, tanpa UPDATE/DELETE di audit_log
      max: 10,
      idleTimeoutMillis: 30_000,
      // Timezone sesi selalu UTC; zona waktu bisnis (Asia/Jakarta) diterapkan di lapisan tampilan.
      options: "-c timezone=UTC -c statement_timeout=15000",
    });
    g.__teonePool.on("error", (e) => console.error("pg pool error:", e.message));
  }
  return g.__teonePool;
}

export function getDb(): Db {
  if (!g.__teoneDb) g.__teoneDb = drizzle(getPool(), { schema });
  return g.__teoneDb;
}

export async function closeDb() {
  if (g.__teonePool) {
    await g.__teonePool.end();
    g.__teonePool = undefined;
    g.__teoneDb = undefined;
  }
}

/** Kode SQLSTATE kustom yang dilempar trigger database (lihat drizzle/0001_*). */
export const PG_ERR = {
  CHANNEL_LIMIT: "TE001", LAST_SUPER_ADMIN: "TE002", LIMIT_BELOW_ACTIVE: "TE003",
  // Tahap 4 (migrasi 0008): versi terbit tidak berubah · agent masih dipakai · penempatan tidak sah · aktivasi tanpa versi terbit · sumber agent pada versi non-draft
  VERSION_IMMUTABLE: "TE010", AGENT_IN_USE: "TE011", PLACEMENT_INVALID: "TE012", ACTIVE_NEEDS_PUBLISHED: "TE013", SOURCES_LOCKED: "TE014",
} as const;

export function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  // drizzle membungkus error driver di `cause`
  for (let i = 0; i < 4 && cur; i++) {
    const code = (cur as { code?: string }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}
