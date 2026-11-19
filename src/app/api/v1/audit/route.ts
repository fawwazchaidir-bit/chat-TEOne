import { z } from "zod";
import { apiFull, parseQuery } from "@/lib/http";
import { listAudit } from "@/modules/audit";

export const GET = apiFull(async ({ req, ctx }) => {
  const q = parseQuery(req, z.object({
    action: z.string().max(60).optional(), actor: z.string().max(120).optional(),
    from: z.coerce.date().optional(), to: z.coerce.date().optional(),
    beforeId: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(200).optional(),
  }));
  return listAudit(ctx, q);
});
