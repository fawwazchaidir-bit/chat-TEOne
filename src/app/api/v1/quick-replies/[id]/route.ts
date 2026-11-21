import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { updateQuickReply } from "@/modules/inbox";

export const PATCH = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ title: z.string().max(80).optional(), body: z.string().max(1000).optional(), isActive: z.boolean().optional() }));
  return updateQuickReply(ctx, idParam(params), b);
});
