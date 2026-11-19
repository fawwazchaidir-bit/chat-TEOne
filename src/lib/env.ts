import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
  DATABASE_MIGRATION_URL: z.string().optional(),
  APP_ENCRYPTION_KEY: z
    .string()
    .min(1, "APP_ENCRYPTION_KEY wajib diisi")
    .refine((v) => Buffer.from(v, "base64").length === 32, "APP_ENCRYPTION_KEY harus 32 byte dalam base64"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

export type Env = z.infer<typeof schema>;
export type AppEnv = Env["APP_ENV"];

let cached: Env | null = null;

/** Validasi lazy: tidak dijalankan saat `next build` (variabel rahasia tidak ada saat build). */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Pesan hanya menyebut nama variabel, tidak pernah nilainya.
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Konfigurasi lingkungan tidak valid — ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCacheForTests() {
  cached = null;
}

export const isNonProduction = () => getEnv().APP_ENV !== "production";
export const isSecureCookies = () => ["staging", "production"].includes(getEnv().APP_ENV);
