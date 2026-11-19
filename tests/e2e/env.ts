// Database & server E2E terpisah dari database test integrasi. Nilai uji saja — bukan rahasia nyata.
export const E2E_DB = "teone_e2e";
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const host = process.env.TEST_DB_HOST ?? "localhost:5432";
export const E2E_OWNER_URL = `postgres://teone_owner:owner_test_pw@${host}/${E2E_DB}`;
export const E2E_APP_URL = `postgres://teone_app:app_test_pw@${host}/${E2E_DB}`;
export const E2E_ENV = {
  APP_ENV: "development",
  APP_BASE_URL: E2E_BASE_URL,
  DATABASE_URL: E2E_APP_URL,
  DATABASE_MIGRATION_URL: E2E_OWNER_URL,
  APP_ENCRYPTION_KEY: Buffer.from("e2e-only-key-0123456789abcdef!!!").toString("base64"),
  TRUST_PROXY: "false",
  // Tahap 2: nilai SINTETIS. Basis Graph diarahkan ke alamat tak terjangkau → semua hasil pemeriksaan = SIMULASI/gagal (jujur).
  META_APP_SECRET: "e2e-app-secret-sintetis-0001",
  META_VERIFY_TOKEN: "e2e-verify-token-sintetis-0001",
  META_ACCESS_TOKEN: "e2e-access-token-sintetis-0001",
  META_GRAPH_BASE_URL: "http://127.0.0.1:9",
  META_HTTP_TIMEOUT_MS: "1500",
  MEDIA_DIR: ".data/e2e-media",
  PORT: String(E2E_PORT),
  HOSTNAME: "localhost",
};
export const FIXTURE_FILE = ".test-results/e2e-fixtures.json";

export const E2E_WABA = "100000000000009";
export const E2E_PHONE_ID = "200000000000009";
export const E2E_CUSTOMER = "15550007001"; // peserta uji sintetis
export const E2E_STRANGER = "15550007999"; // di luar daftar uji
