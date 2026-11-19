import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { adminResetPassword } from "@/modules/users/service";

export const POST = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ newPassword: z.string().min(1).max(200) }));
  await adminResetPassword(ctx, idParam(params), b.newPassword);
  return { ok: true };
});
