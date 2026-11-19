// Konfigurasi database UJI. Semua nilai di sini hanya berlaku untuk database `teone_test` lokal/CI,
// bukan rahasia nyata. Superuser dapat diganti lewat TEST_ADMIN_DATABASE_URL.
export const TEST_DB = "teone_test";
export const TEST_ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const host = process.env.TEST_DB_HOST ?? "localhost:5432";
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
};
