import { z } from "zod";
import { apiFull, parseQuery } from "@/lib/http";
import { inboxChanges } from "@/modules/inbox";

/** Umpan perubahan (polling). Izin diperiksa pada setiap panggilan; klien memakai jendela tumpang-tindih dan menggabung per id+versi (ADR-0009). */
export const GET = apiFull(async ({ req, ctx }) => {
  const { since } = parseQuery(req, z.object({ since: z.string().max(40).optional() }));
  return inboxChanges(ctx, since ?? null);
});
