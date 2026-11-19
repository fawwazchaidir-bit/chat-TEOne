import { z } from "zod";
import { apiSession, readJson } from "@/lib/http";
import { changePassword } from "@/modules/auth/service";

export const POST = apiSession(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }));
  await changePassword(ctx, b.currentPassword, b.newPassword);
  return { ok: true };
});
