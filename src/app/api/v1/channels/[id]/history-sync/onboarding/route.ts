import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { declareOnboarding } from "@/modules/whatsapp-adapter";

/** Menyatakan jam onboarding coexistence (isian admin — bukan bukti Meta). */
export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ onboardedAt: z.string().max(40), reonboarded: z.boolean().optional() }));
  return declareOnboarding(ctx, idParam(params), b);
});
