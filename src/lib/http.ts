import { z } from "zod";
import { getEnv } from "@/lib/env";
import { AppError, badRequest, forbidden, unauthorized } from "@/lib/errors";
import { safeErrorLabel } from "@/lib/safe-error";
import { clientIp, readCookie, resolveSession, sessionCookieName } from "@/modules/auth/session";
import { loadPermissionSet } from "@/modules/roles-permissions/loader";
import { getDb } from "@/db/client";
import type { Ctx, SessionCtx } from "@/modules/shared/context";
import { safeEqual } from "@/modules/shared/crypto";

type RouteParams = { params: Promise<Record<string, string>> };
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_BODY = 100_000;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

function checkOrigin(req: Request) {
  if (!MUTATING.has(req.method)) return;
  const allowed = new URL(getEnv().APP_BASE_URL).origin;
  const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer") as string).origin : null);
  if (!origin || origin !== allowed) throw forbidden("Asal permintaan tidak diizinkan.", "BAD_ORIGIN");
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Isi permintaan terlalu besar.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("Isi permintaan bukan JSON yang valid.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw badRequest("Data tidak valid.", r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })), "VALIDATION_ERROR");
  return r.data;
}

export const parseQuery = <S extends z.ZodType>(req: Request, schema: S): z.infer<S> => {
  const r = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!r.success) throw badRequest("Parameter tidak valid.", r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })), "VALIDATION_ERROR");
  return r.data;
};

export const idParam = (params: Record<string, string>, key = "id") => {
  const r = z.uuid().safeParse(params[key]);
  if (!r.success) throw badRequest("ID tidak valid.", undefined, "VALIDATION_ERROR");
  return r.data;
};

type Mode = "public" | "session" | "full";
type Args<C> = { req: Request; ctx: C; params: Record<string, string>; correlationId: string; ip: string | null };
type Result = Response | Record<string, unknown> | unknown[] | null;

async function run<C>(mode: Mode, req: Request, routeCtx: RouteParams, handler: (a: Args<C>) => Promise<Result>): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const baseHeaders = { "x-correlation-id": correlationId };
  try {
    checkOrigin(req);
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");
    let ctx: unknown = null;
    if (mode !== "public") {
      const s = await resolveSession(readCookie(req.headers.get("cookie"), sessionCookieName()), { ip, userAgent, correlationId });
      if (!s) throw unauthorized();
      if (MUTATING.has(req.method)) {
        const sent = req.headers.get("x-csrf-token");
        if (!sent || !safeEqual(sent, s.csrfToken)) throw forbidden("Token CSRF tidak valid.", "BAD_CSRF");
      }
      if (mode === "full") {
        if (s.stage !== "full") throw new AppError(403, s.stage.toUpperCase(), "Selesaikan langkah keamanan akun terlebih dahulu.");
        ctx = { ...s, stage: "full" as const, perms: await loadPermissionSet(getDb(), s.user.id, s.user.isSuperAdmin) } satisfies Ctx;
      } else ctx = s;
    }
    const out = await handler({ req, ctx: ctx as C, params: await routeCtx.params, correlationId, ip });
    if (out instanceof Response) {
      out.headers.set("x-correlation-id", correlationId);
      return out;
    }
    return json(out ?? { ok: true }, 200, baseHeaders);
  } catch (e) {
    if (e instanceof AppError) {
      const headers: Record<string, string> = { ...baseHeaders };
      const retry = (e.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      if (e.status === 429 && retry) headers["retry-after"] = String(retry);
      return json({ error: { code: e.code, message: e.message, details: e.details }, correlationId }, e.status, headers);
    }
    // Jangan bocorkan detail internal; cukup pesan error + ID korelasi di log server.
    console.error(`[${correlationId}] error tak terduga: ${safeErrorLabel(e)}`);
    return json({ error: { code: "INTERNAL", message: "Terjadi kesalahan pada server." }, correlationId }, 500, baseHeaders);
  }
}

/** Endpoint tanpa sesi (mis. login, health). */
export const apiPublic = (h: (a: Args<null>) => Promise<Result>) => (req: Request, rc: RouteParams) => run<null>("public", req, rc, h);
/** Sesi valid tetapi boleh belum lengkap (2FA, ganti sandi). */
export const apiSession = (h: (a: Args<SessionCtx>) => Promise<Result>) => (req: Request, rc: RouteParams) => run<SessionCtx>("session", req, rc, h);
/** Sesi lengkap (password + 2FA + sandi sudah diganti). Satu-satunya jalur ke layanan berizin. */
export const apiFull = (h: (a: Args<Ctx>) => Promise<Result>) => (req: Request, rc: RouteParams) => run<Ctx>("full", req, rc, h);
