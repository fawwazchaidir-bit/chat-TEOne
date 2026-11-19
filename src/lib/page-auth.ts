import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { readCookie, resolveSession, sessionCookieName } from "@/modules/auth/session";
import { loadPermissionSet } from "@/modules/roles-permissions/loader";
import type { Ctx, SessionCtx, SessionStage } from "@/modules/shared/context";

export const STAGE_PATH: Record<SessionStage, string> = {
  totp_required: "/login/2fa",
  totp_setup_required: "/login/2fa-setup",
  password_change_required: "/login/ganti-sandi",
  full: "/dashboard",
};

/** Sesi dari cookie (server component). Validasi sepenuhnya di server — sama persis dengan jalur API. */
export async function currentSession(): Promise<SessionCtx | null> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const token = c.get(sessionCookieName())?.value ?? readCookie(h.get("cookie"), sessionCookieName());
  const ip = getEnv().TRUST_PROXY === "true" ? (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null) : null;
  return resolveSession(token, { ip, userAgent: h.get("user-agent"), correlationId: crypto.randomUUID() });
}

/** Halaman aplikasi: hanya sesi LENGKAP (password + 2FA + sandi sudah diganti). */
export async function requireFull(): Promise<Ctx> {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.stage !== "full") redirect(STAGE_PATH[s.stage]);
  return { ...s, stage: "full", perms: await loadPermissionSet(getDb(), s.user.id, s.user.isSuperAdmin) };
}

/** Halaman langkah login: hanya sesi pada stage tertentu. */
export async function requireStage(stage: Exclude<SessionStage, "full">): Promise<SessionCtx> {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.stage !== stage) redirect(STAGE_PATH[s.stage]);
  return s;
}
