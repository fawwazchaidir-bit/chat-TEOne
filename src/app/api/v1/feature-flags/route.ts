import { z } from "zod";
import { apiFull, readJson } from "@/lib/http";
import { listFlags, setFlag } from "@/modules/feature-flags";

export const GET = apiFull(async ({ ctx }) => ({ items: await listFlags(ctx) }));
export const PUT = apiFull(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({ key: z.string().min(1).max(60), enabled: z.boolean() }));
  await setFlag(ctx, b.key, b.enabled);
  return { ok: true };
});
