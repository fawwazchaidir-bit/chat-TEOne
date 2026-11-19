import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { getUser, updateUser } from "@/modules/users/service";

export const GET = apiFull(async ({ ctx, params }) => getUser(ctx, idParam(params)));
export const PATCH = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ name: z.string().trim().min(2).max(120).optional(), email: z.email().max(254).optional(), totpRequired: z.boolean().optional() }));
  return updateUser(ctx, idParam(params), b);
});
