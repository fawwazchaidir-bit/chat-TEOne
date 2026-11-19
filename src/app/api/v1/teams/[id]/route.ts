import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { getTeam, updateTeam } from "@/modules/teams/service";

export const GET = apiFull(async ({ ctx, params }) => getTeam(ctx, idParam(params)));
export const PATCH = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().max(300).optional(), isActive: z.boolean().optional() }));
  return updateTeam(ctx, idParam(params), b);
});
