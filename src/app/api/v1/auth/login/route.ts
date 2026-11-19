import { z } from "zod";
import { apiPublic, json, readJson } from "@/lib/http";
import { login } from "@/modules/auth/service";
import { buildSessionCookie } from "@/modules/auth/session";

export const POST = apiPublic(async ({ req, ip, correlationId }) => {
  const body = await readJson(req, z.object({ email: z.string().max(254), password: z.string().min(1).max(200) }));
  const { token, maxAgeSeconds } = await login(body.email, body.password, { ip, userAgent: req.headers.get("user-agent"), correlationId });
  return json({ ok: true }, 200, { "set-cookie": buildSessionCookie(token, maxAgeSeconds) });
});
