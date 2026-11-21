import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { assignConversation } from "@/modules/inbox";

export const POST = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ teamId: z.uuid().nullable().optional(), assigneeId: z.uuid().nullable().optional(), expectedVersion: z.number().int().min(0) }));
  return assignConversation(ctx, idParam(params), b);
});
