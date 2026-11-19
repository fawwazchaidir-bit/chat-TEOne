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
  PORT: String(E2E_PORT),
  HOSTNAME: "localhost",
};
export const FIXTURE_FILE = ".test-results/e2e-fixtures.json";
