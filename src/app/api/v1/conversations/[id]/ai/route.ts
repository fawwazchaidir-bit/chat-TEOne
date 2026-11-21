import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { aiAction } from "@/modules/inbox";

export const POST = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ action: z.enum(["ambil_alih", "matikan", "aktifkan", "eskalasi", "kill_switch"]), expectedVersion: z.number().int().min(0).nullable().optional() }));
  return aiAction(ctx, idParam(params), b.action, b.expectedVersion ?? null);
});
