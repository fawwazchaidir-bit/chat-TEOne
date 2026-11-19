import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { setTeamMembers } from "@/modules/teams/service";

export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ userIds: z.array(z.uuid()).max(200) }));
  await setTeamMembers(ctx, idParam(params), b.userIds);
  return { ok: true };
});
