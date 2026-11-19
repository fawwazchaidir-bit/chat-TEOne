import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { resolveUncertainManually } from "@/modules/conversations-messages";

export const POST = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ outcome: z.enum(["terkirim", "gagal"]), note: z.string().trim().min(1).max(300) }));
  await resolveUncertainManually(ctx, idParam(params), b.outcome, b.note);
  return { ok: true };
});
