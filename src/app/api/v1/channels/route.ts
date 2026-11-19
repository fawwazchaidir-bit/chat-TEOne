import { z } from "zod";
import { apiFull, json, parseQuery, readJson } from "@/lib/http";
import { createChannel, listChannels } from "@/modules/channels/service";

const channelBody = z.object({
  name: z.string().trim().min(2).max(80), functionLabel: z.string().trim().min(2).max(60), description: z.string().max(300).optional(),
  integrationKind: z.enum(["cloud_api_coexistence", "cloud_api_only"]), isOperational: z.boolean().optional(),
});

export const GET = apiFull(async ({ req, ctx }) => {
  const q = parseQuery(req, z.object({ includeArchived: z.enum(["true", "false"]).optional() }));
  return { items: await listChannels(ctx, { includeArchived: q.includeArchived === "true" }) };
});
export const POST = apiFull(async ({ req, ctx }) => json(await createChannel(ctx, await readJson(req, channelBody)), 201));
