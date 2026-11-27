import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { resolveSyncRequest } from "@/modules/whatsapp-adapter";

/** Penyelesaian MANUAL teraudit untuk permintaan yang hasilnya tidak pasti (tidak pernah otomatis). */
export const POST = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ syncType: z.string().max(40), outcome: z.string().max(20), note: z.string().max(600) }));
  return resolveSyncRequest(ctx, idParam(params), b);
});
