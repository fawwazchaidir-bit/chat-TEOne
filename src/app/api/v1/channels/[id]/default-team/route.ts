import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { setChannelDefaultTeam } from "@/modules/channels/service";

export const PUT = apiFull(async ({ req, ctx, params }) => setChannelDefaultTeam(ctx, idParam(params), (await readJson(req, z.object({ teamId: z.uuid().nullable() }))).teamId));
