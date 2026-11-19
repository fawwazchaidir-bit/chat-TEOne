import { apiSession, json } from "@/lib/http";
import { logout } from "@/modules/auth/service";
import { clearSessionCookie } from "@/modules/auth/session";

export const POST = apiSession(async ({ ctx }) => {
  await logout(ctx);
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
});
