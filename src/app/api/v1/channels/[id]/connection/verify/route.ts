import { apiFull, idParam } from "@/lib/http";
import { verifyConnection } from "@/modules/whatsapp-adapter";

export const POST = apiFull(async ({ ctx, params }) => verifyConnection(ctx, idParam(params)));
