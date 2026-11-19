import { apiFull } from "@/lib/http";
import { listToolChannels } from "@/modules/conversations-messages";

export const GET = apiFull(async ({ ctx }) => ({ items: (await listToolChannels(ctx)).map((c) => ({ id: c.id, name: c.name, functionLabel: c.functionLabel })) }));
