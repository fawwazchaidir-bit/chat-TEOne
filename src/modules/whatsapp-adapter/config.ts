import { getEnv } from "@/lib/env";

export type MetaConfig = {
  graphBaseUrl: string;
  apiVersion: string;
  appSecret: string | undefined;
  verifyToken: string | undefined;
  accessToken: string | undefined;
  timeoutMs: number;
};

/** Kredensial hanya dari environment (secret store per lingkungan). Tidak pernah dicatat, dikembalikan ke UI, atau disimpan di DB. */
export function getMetaConfig(): MetaConfig {
  const e = getEnv();
  return {
    graphBaseUrl: e.META_GRAPH_BASE_URL.replace(/\/+$/, ""),
    apiVersion: e.META_GRAPH_API_VERSION,
    appSecret: e.META_APP_SECRET,
    verifyToken: e.META_VERIFY_TOKEN,
    accessToken: e.META_ACCESS_TOKEN,
    timeoutMs: e.META_HTTP_TIMEOUT_MS,
  };
}

/** Hanya `graph.facebook.com` yang dihitung sebagai Meta asli. Basis lain (mock) → hasil pemeriksaan ditandai SIMULASI. */
export const isRealMetaEndpoint = (c: MetaConfig = getMetaConfig()) => new URL(c.graphBaseUrl).hostname === "graph.facebook.com";

/**
 * Pengaman SSRF/kebocoran token: token akses hanya boleh dikirim ke Meta asli (https), atau ke localhost
 * (mock) di lingkungan NON-production. Di production basis URL selain Meta ditolak.
 */
export function assertSafeBaseUrl(c: MetaConfig = getMetaConfig()): void {
  const u = new URL(c.graphBaseUrl);
  if (u.hostname === "graph.facebook.com") {
    if (u.protocol !== "https:") throw new Error("Basis URL Meta wajib https");
    return;
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
  if (getEnv().APP_ENV === "production" || !local) throw new Error("Basis URL Graph API tidak diizinkan di lingkungan ini");
}
