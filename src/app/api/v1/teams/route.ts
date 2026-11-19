import { z } from "zod";
import { apiFull, json, readJson } from "@/lib/http";
import { createTeam, listTeams } from "@/modules/teams/service";

export const GET = apiFull(async ({ ctx }) => ({ items: await listTeams(ctx) }));
export const POST = apiFull(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(300).optional() }));
  return json(await createTeam(ctx, b), 201);
});
