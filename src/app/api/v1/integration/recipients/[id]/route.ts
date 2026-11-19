import { apiFull, idParam } from "@/lib/http";
import { removeRecipient } from "@/modules/conversations-messages";

export const DELETE = apiFull(async ({ ctx, params }) => {
  await removeRecipient(ctx, idParam(params));
  return { ok: true };
});
