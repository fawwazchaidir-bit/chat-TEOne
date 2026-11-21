import { apiFull, idParam } from "@/lib/http";
import { quickRepliesForConversation } from "@/modules/inbox";

export const GET = apiFull(async ({ ctx, params }) => ({ items: await quickRepliesForConversation(ctx, idParam(params)) }));
