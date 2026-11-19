import { z } from "zod";
import { apiSession, readJson } from "@/lib/http";
import { useRecoveryCode } from "@/modules/auth/service";

export const POST = apiSession(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({ code: z.string().min(8).max(40) }));
  return { ok: true, ...(await useRecoveryCode(ctx, b.code)) };
});
