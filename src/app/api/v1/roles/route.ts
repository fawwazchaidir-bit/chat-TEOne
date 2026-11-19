import { z } from "zod";
import { apiFull, json, readJson } from "@/lib/http";
import { createRole, listRoles } from "@/modules/roles-permissions/service";

export const GET = apiFull(async ({ ctx }) => ({ items: await listRoles(ctx) }));
export const POST = apiFull(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(300).optional(), require2fa: z.boolean().optional() }));
  return json(await createRole(ctx, b), 201);
});
