import { z } from "zod";
import { apiFull, readJson } from "@/lib/http";
import { getOrgSettings, updateOrgSettings } from "@/modules/org-settings/service";

export const GET = apiFull(async () => getOrgSettings());
export const PATCH = apiFull(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({ maxChannels: z.number().int().min(1).max(100).optional(), timezone: z.string().min(3).max(60).optional() }));
  return updateOrgSettings(ctx, b);
});
