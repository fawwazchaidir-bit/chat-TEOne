import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { deleteRole, updateRole } from "@/modules/roles-permissions/service";

export const PATCH = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().max(300).optional(), require2fa: z.boolean().optional() }));
  return updateRole(ctx, idParam(params), b);
});
export const DELETE = apiFull(async ({ ctx, params }) => {
  await deleteRole(ctx, idParam(params));
  return { ok: true };
});
