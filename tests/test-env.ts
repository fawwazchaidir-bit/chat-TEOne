// Konfigurasi database UJI. Semua nilai di sini hanya berlaku untuk database `teone_test` lokal/CI,
// bukan rahasia nyata. Superuser dapat diganti lewat TEST_ADMIN_DATABASE_URL.
export const TEST_DB = "teone_test";
export const TEST_ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
/**
 * Host:port server PostgreSQL uji. SATU-SATUNYA sumber (audit ulang Gate 1): semua test turunan memakai ini, bukan nilai tetap.
 * Bila TEST_DB_HOST tidak diisi, diturunkan dari TEST_ADMIN_DATABASE_URL sehingga server di port nonstandar cukup dikonfigurasi lewat SATU variabel.
 */
export const TEST_DB_HOST = process.env.TEST_DB_HOST ?? new URL(TEST_ADMIN_URL).host;
const host = TEST_DB_HOST;
export const TEST_OWNER_URL = `postgres://teone_owner:owner_test_pw@${host}/${TEST_DB}`;
export const TEST_APP_URL = `postgres://teone_app:app_test_pw@${host}/${TEST_DB}`;
// Kunci uji acak-tetap (bukan rahasia): 32 byte base64.
export const TEST_ENCRYPTION_KEY = Buffer.from("test-only-key-0123456789abcdef!!").toString("base64");

export const TEST_ENV: Record<string, string> = {
  APP_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: TEST_APP_URL,
  DATABASE_MIGRATION_URL: TEST_OWNER_URL,
  APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  TRUST_PROXY: "true",
  // Nilai SINTETIS untuk uji (bukan rahasia nyata). Basis URL diarahkan ke mock Graph oleh test yang memerlukannya.
  META_APP_SECRET: "uji-app-secret-sintetis-0001",
  META_VERIFY_TOKEN: "uji-verify-token-sintetis-0001",
  META_ACCESS_TOKEN: "uji-access-token-sintetis-0001",
  META_APP_ID: "300000000000001",
  META_GRAPH_BASE_URL: "http://127.0.0.1:1",
  META_HTTP_TIMEOUT_MS: "1500",
  MEDIA_DIR: ".data/test-media",
  WORKER_INLINE: "false",
};
