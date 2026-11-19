import { apiFull, idParam } from "@/lib/http";
import { setChannelArchived } from "@/modules/channels/service";

export const POST = apiFull(async ({ ctx, params }) => setChannelArchived(ctx, idParam(params), true));
