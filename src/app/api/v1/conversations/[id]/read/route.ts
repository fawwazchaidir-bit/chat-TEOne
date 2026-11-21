import { apiFull, idParam } from "@/lib/http";
import { markRead } from "@/modules/inbox";

export const POST = apiFull(async ({ ctx, params }) => markRead(ctx, idParam(params)));
