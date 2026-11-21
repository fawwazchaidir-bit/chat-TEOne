import { apiFull, idParam } from "@/lib/http";
import { getConversationDetail } from "@/modules/inbox";

export const GET = apiFull(async ({ ctx, params }) => getConversationDetail(ctx, idParam(params)));
