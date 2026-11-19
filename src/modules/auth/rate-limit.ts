import { and, eq, gte, sql } from "drizzle-orm";
import { loginAttempts } from "@/db/schema";
import { getDb } from "@/db/client";
import { tooMany } from "@/lib/errors";

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_ACCOUNT = 5;
export const MAX_FAILURES_PER_IP = 30;

const since = () => new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);

/**
 * Pembatasan percobaan login (CCP): ≥5 kegagalan/15 menit per akun, atau ≥30 per IP → ditolak sementara.
 * Kegagalan password, TOTP, dan kode pemulihan dihitung bersama. Trade-off: penyerang dapat mengunci akun
 * korban sementara (DoS terbatas 15 menit); kami memilih keamanan di atas ketersediaan akun untuk 10 pengguna.
 */
export async function assertNotLocked(identifier: string, ip: string) {
  const db = getDb();
  const [a] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.identifier, identifier), eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since())));
  // Bila IP klien tidak diketahui (TRUST_PROXY=false), semua klien akan berbagi satu bucket "unknown" — satu penyerang
  // lalu dapat mengunci login SEMUA orang. Karena itu batas per-IP dilewati; batas per-akun tetap berlaku.
  const ipKnown = ip !== "unknown";
  const [b] = ipKnown
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since())))
    : [{ n: 0 }];
  if ((a?.n ?? 0) >= MAX_FAILURES_PER_ACCOUNT || (b?.n ?? 0) >= MAX_FAILURES_PER_IP) {
    throw tooMany("Terlalu banyak percobaan gagal. Coba lagi beberapa menit lagi.", LOGIN_WINDOW_MINUTES * 60);
  }
}

export async function recordAttempt(identifier: string, ip: string, kind: "password" | "totp" | "recovery", success: boolean) {
  await getDb().insert(loginAttempts).values({ identifier, ip, kind, success });
}
