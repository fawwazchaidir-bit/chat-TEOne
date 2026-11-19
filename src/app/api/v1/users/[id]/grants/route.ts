import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { userGrantSchema } from "@/modules/roles-permissions/grants";
import { setUserGrants } from "@/modules/users/service";

export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ grants: z.array(userGrantSchema).max(100) }));
  await setUserGrants(ctx, idParam(params), b.grants);
  return { ok: true };
});
