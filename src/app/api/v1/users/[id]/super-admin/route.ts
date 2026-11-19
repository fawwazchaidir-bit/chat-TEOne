import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { setSuperAdmin } from "@/modules/users/service";

export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ value: z.boolean() }));
  await setSuperAdmin(ctx, idParam(params), b.value);
  return { ok: true };
});
