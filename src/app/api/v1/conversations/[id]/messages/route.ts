import { z } from "zod";
import { apiFull, idParam, parseQuery } from "@/lib/http";
import { listConversationMessages } from "@/modules/inbox";

export const GET = apiFull(async ({ req, ctx, params }) => {
  const q = parseQuery(req, z.object({ before: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }));
  return listConversationMessages(ctx, idParam(params), q);
});
