import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { getChannel, updateChannel } from "@/modules/channels/service";

export const GET = apiFull(async ({ ctx, params }) => getChannel(ctx, idParam(params)));
export const PATCH = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({
    name: z.string().trim().min(2).max(80).optional(), functionLabel: z.string().trim().min(2).max(60).optional(), description: z.string().max(300).optional(),
    integrationKind: z.enum(["cloud_api_coexistence", "cloud_api_only"]).optional(), isOperational: z.boolean().optional(),
  }));
  return updateChannel(ctx, idParam(params), b);
});
