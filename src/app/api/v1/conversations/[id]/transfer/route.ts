import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { transferConversation } from "@/modules/inbox";

export const POST = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ teamId: z.uuid(), strayLead: z.boolean().optional(), note: z.string().max(300).optional(), expectedVersion: z.number().int().min(0) }));
  return transferConversation(ctx, idParam(params), b);
});
