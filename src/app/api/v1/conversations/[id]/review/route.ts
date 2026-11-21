import { apiFull, idParam } from "@/lib/http";
import { clearReview } from "@/modules/inbox";

export const POST = apiFull(async ({ ctx, params }) => clearReview(ctx, idParam(params)));
