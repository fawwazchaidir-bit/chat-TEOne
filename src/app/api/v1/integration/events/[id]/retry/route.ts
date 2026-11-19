import { z } from "zod";
import { apiFull } from "@/lib/http";
import { badRequest } from "@/lib/errors";
import { retryEvent } from "@/modules/conversations-messages";

export const POST = apiFull(async ({ ctx, params }) => {
  const id = z.coerce.number().int().positive().safeParse(params.id);
  if (!id.success) throw badRequest("ID event tidak valid.", undefined, "VALIDATION_ERROR");
  return retryEvent(ctx, id.data);
});
