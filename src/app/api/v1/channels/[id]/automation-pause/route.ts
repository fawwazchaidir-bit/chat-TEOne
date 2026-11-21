import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { setChannelKillSwitch } from "@/modules/kill-switch";

/** "Jeda otomatisasi channel": menghentikan semua pengiriman otomatis pada channel ini. Tidak pernah melepas sendiri. */
export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ engaged: z.boolean(), reason: z.string().max(300).default("") }));
  await setChannelKillSwitch(ctx, idParam(params), b.engaged, b.reason);
  return { ok: true, engaged: b.engaged };
});
