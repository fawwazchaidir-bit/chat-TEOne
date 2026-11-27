import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { getHistorySyncView, requestHistorySync } from "@/modules/whatsapp-adapter";

export const GET = apiFull(async ({ ctx, params }) => getHistorySyncView(ctx, idParam(params)));
/** Memicu Step 1/2 SMB App Data API. SEKALI per channel + jenis + versi pemetaan; semua penjagaan ditegakkan di server. */
export const POST = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ syncType: z.string().max(40), confirmSubscribed: z.boolean(), confirmOnce: z.boolean() }));
  return requestHistorySync(ctx, idParam(params), b);
});
