import { z } from "zod";
import { apiFull, readJson } from "@/lib/http";
import { AUTOMATION_FEATURES, listKillSwitches, setKillSwitch } from "@/modules/kill-switch";

export const GET = apiFull(async ({ ctx }) => ({ items: await listKillSwitches(ctx), features: AUTOMATION_FEATURES }));
export const PUT = apiFull(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({
    scope: z.discriminatedUnion("type", [z.object({ type: z.literal("global") }), z.object({ type: z.enum(["channel", "feature", "chat"]), ref: z.string().min(1).max(80) })]),
    engaged: z.boolean(), reason: z.string().max(300).default(""),
  }));
  await setKillSwitch(ctx, b.scope, b.engaged, b.reason);
  return { ok: true };
});
