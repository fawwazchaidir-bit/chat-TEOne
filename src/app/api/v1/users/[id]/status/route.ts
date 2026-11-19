import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { setUserActive } from "@/modules/users/service";

export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ active: z.boolean() }));
  await setUserActive(ctx, idParam(params), b.active);
  return { ok: true };
});
