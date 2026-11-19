import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { getConnectionView, saveConnection, setTestMode } from "@/modules/whatsapp-adapter";

export const GET = apiFull(async ({ ctx, params }) => getConnectionView(ctx, idParam(params)));
export const PUT = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ wabaId: z.string().trim().min(5).max(30), phoneNumberId: z.string().trim().min(5).max(30) }));
  return saveConnection(ctx, idParam(params), b);
});
export const PATCH = apiFull(async ({ req, ctx, params }) => {
  const b = await readJson(req, z.object({ testMode: z.boolean() }));
  await setTestMode(ctx, idParam(params), b.testMode);
  return { ok: true };
});
