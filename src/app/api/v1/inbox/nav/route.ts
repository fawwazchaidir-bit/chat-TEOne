import { apiFull } from "@/lib/http";
import { inboxNav } from "@/modules/inbox";

export const GET = apiFull(async ({ ctx }) => inboxNav(ctx));
