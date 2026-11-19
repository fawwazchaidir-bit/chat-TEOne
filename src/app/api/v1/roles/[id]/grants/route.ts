import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { grantSchema } from "@/modules/roles-permissions/grants";
import { setRoleGrants } from "@/modules/roles-permissions/service";

export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ grants: z.array(grantSchema).max(100) }));
  await setRoleGrants(ctx, idParam(params), b.grants);
  return { ok: true };
});
