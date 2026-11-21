import { z } from "zod";
import { apiFull, parseQuery } from "@/lib/http";
import { listConversations } from "@/modules/inbox";

const bool = z.enum(["1", "true"]).optional().transform((v) => !!v);
const q = z.object({
  channelId: z.string().optional(), teamId: z.string().optional(), assignee: z.string().optional(), unread: bool, aiStatus: z.enum(["aktif", "off"]).optional(),
  escalated: bool, strayLead: bool, review: bool, q: z.string().max(100).optional(), cursor: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const GET = apiFull(async ({ req, ctx }) => {
  const { cursor, limit, ...f } = parseQuery(req, q);
  return listConversations(ctx, f, { cursor, limit });
});
