import { and, eq, lt, ne, sql } from "drizzle-orm";
import { roles, sessions, userRoles, users } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { getEnv, isSecureCookies } from "@/lib/env";
import { randomToken, sha256Hex } from "@/modules/shared/crypto";
import type { AuthUser, SessionCtx, SessionStage } from "@/modules/shared/context";

export const SESSION_ABSOLUTE_MS = 12 * 3600_000;
export const SESSION_IDLE_MS = 4 * 3600_000;
/** Sesi yang baru lolos password tetapi belum lolos 2FA hanya berlaku singkat. */
export const SESSION_PENDING_MS = 10 * 60_000;
const TOUCH_EVERY_MS = 60_000;

export const sessionCookieName = () => (isSecureCookies() ? "__Host-teone_session" : "teone_session");

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [`${sessionCookieName()}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (isSecureCookies()) parts.push("Secure");
  return parts.join("; ");
}
export const clearSessionCookie = () => buildSessionCookie("", 0);

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

export function computeStage(u: { totpEnabled: boolean; mustChangePassword: boolean; requires2fa: boolean }, totpVerified: boolean): SessionStage {
  if (u.totpEnabled && !totpVerified) return "totp_required";
  if (!u.totpEnabled && u.requires2fa) return "totp_setup_required";
  if (u.mustChangePassword) return "password_change_required";
  return "full";
}

export async function createSession(userId: string, needsTotp: boolean, meta: { ip: string | null; userAgent: string | null }) {
  const token = randomToken(32);
  const ttl = needsTotp ? SESSION_PENDING_MS : SESSION_ABSOLUTE_MS;
  const db = getDb();
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date()))); // bersihkan yang kedaluwarsa
  await db.insert(sessions).values({
    tokenHash: sha256Hex(token),
    userId,
    csrfToken: randomToken(24),
    expiresAt: new Date(Date.now() + ttl),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, maxAgeSeconds: Math.floor(ttl / 1000) };
}

/** Memvalidasi token session di server. Pengguna nonaktif → session tidak berlaku. */
export async function resolveSession(token: string | null, meta: { ip: string | null; userAgent: string | null; correlationId: string }): Promise<SessionCtx | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const db = getDb();
  const tokenHash = sha256Hex(token);
  const [row] = await db
    .select({
      s: sessions,
      u: users,
      roleRequires2fa: sql<boolean>`exists(select 1 from ${userRoles} ur join ${roles} r on r.id = ur.role_id where ur.user_id = ${users.id} and r.require_2fa)`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash));
  if (!row) return null;
  const now = Date.now();
  const expired = row.s.expiresAt.getTime() <= now || now - row.s.lastSeenAt.getTime() > SESSION_IDLE_MS;
  if (expired || row.u.status !== "active") {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  if (now - row.s.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.tokenHash, tokenHash));
  }
  const requires2fa = row.u.isSuperAdmin || row.u.totpRequired || row.roleRequires2fa;
  const user: AuthUser = {
    id: row.u.id, email: row.u.email, name: row.u.name, isSuperAdmin: row.u.isSuperAdmin,
    mustChangePassword: row.u.mustChangePassword, totpEnabled: row.u.totpEnabled, totpRequired: row.u.totpRequired, requires2fa,
  };
  return {
    user, sessionTokenHash: tokenHash, csrfToken: row.s.csrfToken, stage: computeStage(user, row.s.totpVerifiedAt !== null),
    correlationId: meta.correlationId, ip: meta.ip, userAgent: meta.userAgent,
  };
}

export async function markSessionVerified(tokenHash: string) {
  await getDb().update(sessions).set({ totpVerifiedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS) }).where(eq(sessions.tokenHash, tokenHash));
}

export const destroySession = (tokenHash: string, ex: Executor = getDb()) => ex.delete(sessions).where(eq(sessions.tokenHash, tokenHash));

/** Mencabut semua session pengguna (nonaktif, reset sandi/2FA). `except` = session yang dipertahankan. */
export function destroyUserSessions(userId: string, ex: Executor = getDb(), except?: string) {
  return ex.delete(sessions).where(except ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, except)) : eq(sessions.userId, userId));
}

export function clientIp(req: Request): string | null {
  if (getEnv().TRUST_PROXY !== "true") return null;
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || null;
}
