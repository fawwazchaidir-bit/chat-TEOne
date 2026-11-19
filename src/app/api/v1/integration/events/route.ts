import { z } from "zod";
import { apiFull, parseQuery } from "@/lib/http";
import { listProblemEvents } from "@/modules/conversations-messages";

export const GET = apiFull(async ({ req, ctx }) => ({ items: await listProblemEvents(ctx, parseQuery(req, z.object({ channelId: z.uuid() })).channelId) }));
