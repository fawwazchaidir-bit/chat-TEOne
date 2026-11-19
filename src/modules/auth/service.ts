import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { recoveryCodes, users } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, conflict, unauthorized } from "@/lib/errors";
import { writeAudit, auditFor } from "@/modules/audit";
import type { SessionCtx } from "@/modules/shared/context";
import { decryptSecret, encryptSecret, generateRecoveryCode, hashRecoveryCode } from "@/modules/shared/crypto";
import { assertPasswordPolicy, burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import { assertNotLocked, recordAttempt } from "./rate-limit";
import { createSession, destroySession, destroyUserSessions, markSessionVerified } from "./session";
import { generateTotpSecret, totpQrDataUrl, totpUri, verifyTotp } from "./totp";

export type Meta = { ip: string | null; userAgent: string | null; correlationId: string };
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const RECOVERY_CODE_COUNT = 10;

export async function login(emailRaw: string, password: string, meta: Meta) {
  const email = normalizeEmail(emailRaw);
  const ip = meta.ip ?? "unknown";
  const db = getDb();
  try {
    await assertNotLocked(email, ip);
  } catch (e) {
    await writeAudit(db, { actorLabel: email, action: "auth.login_blocked", result: "denied", correlationId: meta.correlationId, ip: meta.ip });
    throw e;
  }
  const [u] = await db.select().from(users).where(eq(users.email, email));
  let ok = false;
  if (u && u.status === "active") ok = await verifyPassword(u.passwordHash, password);
  else await burnPasswordCheck(password);

  if (!u || !ok) {
    await recordAttempt(email, ip, "password", false);
    await writeAudit(db, {
      actorLabel: email, action: "auth.login_failed", result: "failure", correlationId: meta.correlationId, ip: meta.ip,
      metadata: { reason: !u ? "unknown_user" : u.status !== "active" ? "user_disabled" : "bad_password" },
    });
    // Pesan generik: tidak membedakan akun tidak ada / nonaktif / sandi salah.
    throw unauthorized("Email atau kata sandi salah.", "INVALID_CREDENTIALS");
  }
  await recordAttempt(email, ip, "password", true);
  const { token, maxAgeSeconds } = await createSession(u.id, u.totpEnabled, meta);
  await writeAudit(db, { actor: { id: u.id, email: u.email }, action: "auth.login", objectType: "user", objectId: u.id, correlationId: meta.correlationId, ip: meta.ip, metadata: { totpPending: u.totpEnabled } });
  return { token, maxAgeSeconds };
}

export async function logout(ctx: SessionCtx) {
  await destroySession(ctx.sessionTokenHash);
  await writeAudit(getDb(), { ...auditFor(ctx), action: "auth.logout", objectType: "user", objectId: ctx.user.id });
}

async function failTotp(ctx: SessionCtx, kind: "totp" | "recovery", reason: string): Promise<never> {
  await recordAttempt(ctx.user.email, ctx.ip ?? "unknown", kind, false);
  await writeAudit(getDb(), { ...auditFor(ctx), action: `auth.${kind}_failed`, result: "failure", objectType: "user", objectId: ctx.user.id, metadata: { reason } });
  throw unauthorized(kind === "totp" ? "Kode 2FA tidak valid." : "Kode pemulihan tidak valid atau sudah dipakai.", kind === "totp" ? "INVALID_TOTP" : "INVALID_RECOVERY_CODE");
}

export async function verifyTotpLogin(ctx: SessionCtx, code: string) {
  if (ctx.stage !== "totp_required") throw badRequest("Verifikasi 2FA tidak sedang diminta untuk sesi ini.", undefined, "NOT_REQUIRED");
  await assertNotLocked(ctx.user.email, ctx.ip ?? "unknown");
  const db = getDb();
  const [u] = await db.select({ enc: users.totpSecretEnc }).from(users).where(eq(users.id, ctx.user.id));
  if (!u?.enc) return failTotp(ctx, "totp", "no_secret");
  const step = verifyTotp(decryptSecret(u.enc), code.trim());
  if (step === null) return failTotp(ctx, "totp", "bad_code");
  // Proteksi replay: satu langkah waktu hanya dapat dipakai sekali (atomik).
  const claimed = await db
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, ctx.user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id });
  if (claimed.length === 0) return failTotp(ctx, "totp", "replay");
  await recordAttempt(ctx.user.email, ctx.ip ?? "unknown", "totp", true);
  await markSessionVerified(ctx.sessionTokenHash);
  await writeAudit(db, { ...auditFor(ctx), action: "auth.totp_verified", objectType: "user", objectId: ctx.user.id });
}

export async function useRecoveryCode(ctx: SessionCtx, code: string) {
  if (ctx.stage !== "totp_required") throw badRequest("Verifikasi 2FA tidak sedang diminta untuk sesi ini.", undefined, "NOT_REQUIRED");
  await assertNotLocked(ctx.user.email, ctx.ip ?? "unknown");
  const db = getDb();
  // Atomik: hanya satu permintaan yang dapat menandai kode ini terpakai (CCP: kode pemulihan sekali pakai).
  const used = await db
    .update(recoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(recoveryCodes.userId, ctx.user.id), eq(recoveryCodes.codeHash, hashRecoveryCode(code)), isNull(recoveryCodes.usedAt)))
    .returning({ id: recoveryCodes.id });
  if (used.length === 0) return failTotp(ctx, "recovery", "bad_or_used");
  await recordAttempt(ctx.user.email, ctx.ip ?? "unknown", "recovery", true);
  await markSessionVerified(ctx.sessionTokenHash);
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(recoveryCodes).where(and(eq(recoveryCodes.userId, ctx.user.id), isNull(recoveryCodes.usedAt)));
  await writeAudit(db, { ...auditFor(ctx), action: "auth.recovery_code_used", objectType: "user", objectId: ctx.user.id, metadata: { remaining: r?.n ?? 0 } });
  return { remaining: r?.n ?? 0 };
}

export async function beginTotpSetup(ctx: SessionCtx) {
  if (ctx.user.totpEnabled) throw conflict("TOTP_ALREADY_ENABLED", "2FA sudah aktif. Minta administrator mereset 2FA bila perlu.");
  if (ctx.stage === "totp_required") throw conflict("TOTP_ALREADY_ENABLED", "2FA sudah aktif.");
  const secret = generateTotpSecret();
  const db = getDb();
  await db.update(users).set({ totpSecretEnc: encryptSecret(secret), updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
  await writeAudit(db, { ...auditFor(ctx), action: "auth.totp_setup_started", objectType: "user", objectId: ctx.user.id });
  const uri = totpUri(secret, ctx.user.email);
  return { secret, otpauthUri: uri, qrDataUrl: await totpQrDataUrl(uri) };
}

export async function confirmTotpSetup(ctx: SessionCtx, code: string) {
  if (ctx.user.totpEnabled) throw conflict("TOTP_ALREADY_ENABLED", "2FA sudah aktif.");
  await assertNotLocked(ctx.user.email, ctx.ip ?? "unknown");
  const db = getDb();
  const [u] = await db.select({ enc: users.totpSecretEnc }).from(users).where(eq(users.id, ctx.user.id));
  if (!u?.enc) throw badRequest("Mulai penyiapan 2FA terlebih dahulu.", undefined, "SETUP_NOT_STARTED");
  const step = verifyTotp(decryptSecret(u.enc), code.trim());
  if (step === null) return failTotp(ctx, "totp", "setup_bad_code");
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnabled: true, totpLastStep: step, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, ctx.user.id));
    await tx.insert(recoveryCodes).values(codes.map((c) => ({ userId: ctx.user.id, codeHash: hashRecoveryCode(c) })));
    await writeAudit(tx, { ...auditFor(ctx), action: "auth.totp_enabled", objectType: "user", objectId: ctx.user.id });
  });
  await markSessionVerified(ctx.sessionTokenHash);
  // Kode pemulihan ditampilkan SEKALI; di database hanya tersimpan hash-nya.
  return { recoveryCodes: codes };
}

export async function changePassword(ctx: SessionCtx, current: string, next: string) {
  if (ctx.stage === "totp_required" || ctx.stage === "totp_setup_required") throw unauthorized("Selesaikan verifikasi 2FA terlebih dahulu.", ctx.stage.toUpperCase());
  const db = getDb();
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, ctx.user.id));
  if (!u || !(await verifyPassword(u.hash, current))) {
    await writeAudit(db, { ...auditFor(ctx), action: "auth.password_change_failed", result: "failure", objectType: "user", objectId: ctx.user.id });
    throw unauthorized("Kata sandi saat ini salah.", "INVALID_CREDENTIALS");
  }
  if (current === next) throw badRequest("Kata sandi baru harus berbeda dari yang lama.", undefined, "WEAK_PASSWORD");
  assertPasswordPolicy(next, ctx.user.email);
  const newHash = await hashPassword(next);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: newHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
    await destroyUserSessions(ctx.user.id, tx, ctx.sessionTokenHash);
    await writeAudit(tx, { ...auditFor(ctx), action: "auth.password_changed", objectType: "user", objectId: ctx.user.id });
  });
}
