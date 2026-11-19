import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { setUserRoles } from "@/modules/users/service";

export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ roleIds: z.array(z.uuid()).max(20) }));
  return { ok: true, ...(await setUserRoles(ctx, idParam(params), b.roleIds)) };
});
