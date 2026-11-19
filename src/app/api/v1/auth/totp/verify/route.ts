import { z } from "zod";
import { apiSession, readJson } from "@/lib/http";
import { verifyTotpLogin } from "@/modules/auth/service";

export const POST = apiSession(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({ code: z.string().min(6).max(8) }));
  await verifyTotpLogin(ctx, b.code);
  return { ok: true };
});
