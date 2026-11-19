import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { setTeamChannels } from "@/modules/teams/service";

export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ channelIds: z.array(z.uuid()).max(100) }));
  await setTeamChannels(ctx, idParam(params), b.channelIds);
  return { ok: true };
});
