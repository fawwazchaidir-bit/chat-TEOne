import { z } from "zod";
import { apiFull, parseQuery } from "@/lib/http";
import { getOverview } from "@/modules/conversations-messages";

export const GET = apiFull(async ({ req, ctx }) => getOverview(ctx, parseQuery(req, z.object({ channelId: z.uuid() })).channelId));
