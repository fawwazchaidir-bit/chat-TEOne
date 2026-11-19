import { z } from "zod";
import { apiFull, json, readJson } from "@/lib/http";
import { createUser, listUsers } from "@/modules/users/service";

export const GET = apiFull(async ({ ctx }) => ({ items: await listUsers(ctx) }));
export const POST = apiFull(async ({ req, ctx }) => {
  const b = await readJson(req, z.object({
    email: z.email().max(254), name: z.string().trim().min(2).max(120), password: z.string().min(1).max(200),
    roleIds: z.array(z.uuid()).max(20).optional(), totpRequired: z.boolean().optional(),
  }));
  return json(await createUser(ctx, b), 201);
});
