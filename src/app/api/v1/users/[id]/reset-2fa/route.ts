import { apiFull, idParam } from "@/lib/http";
import { adminResetTotp } from "@/modules/users/service";

export const POST = apiFull(async ({ ctx, params }) => {
  await adminResetTotp(ctx, idParam(params));
  return { ok: true };
});
