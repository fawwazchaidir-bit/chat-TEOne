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
  // ── Tahap 2: Meta WhatsApp Cloud API. Seluruhnya opsional di level skema (fitur di balik feature flag);
  //    modul adapter gagal-tertutup bila nilai wajib untuk suatu operasi tidak ada. TIDAK PERNAH dicatat di log.
  META_APP_SECRET: z.string().min(8).optional(),
  META_VERIFY_TOKEN: z.string().min(8).optional(),
  META_ACCESS_TOKEN: z.string().min(8).optional(),
  /** ID aplikasi Meta milik TE One (bukan rahasia). Dipakai agar langganan webhook dapat DIKONFIRMASI sebagai aplikasi yang benar (G2-A05). */
  META_APP_ID: z.string().regex(/^\d{5,30}$/, "META_APP_ID harus berupa angka").optional(),
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  META_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  /** Direktori media privat (di luar webroot). */
  MEDIA_DIR: z.string().min(1).default(".data/media"),
  /** true = webhook memicu pemrosesan segera di proses yang sama; worker terpisah tetap aman (SKIP LOCKED). */
  WORKER_INLINE: z.enum(["true", "false"]).default("true"),
  /** Tahap 3: jeda (ms) sebelum job AI SIMULASI dijalankan — hanya untuk uji kill switch/pengambilalihan; 0 = langsung. */
  AI_SIM_DELAY_MS: z.coerce.number().int().min(0).max(600000).default(0),
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

/** Apakah URL basis Graph API menunjuk Meta ASLI (graph.facebook.com)? URL tak terbaca → dianggap NYATA (gagal-aman). Satu-satunya definisi untuk modul non-adapter. */
export const isRealGraphBaseUrl = (url: string): boolean => { try { return new URL(url).hostname === "graph.facebook.com"; } catch { return true; } };
