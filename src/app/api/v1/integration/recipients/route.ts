import { z } from "zod";
import { apiFull, json, readJson } from "@/lib/http";
import { addRecipient, listRecipients } from "@/modules/conversations-messages";

export const GET = apiFull(async ({ ctx }) => ({ items: await listRecipients(ctx) }));
export const POST = apiFull(async ({ req, ctx }) => json(await addRecipient(ctx, await readJson(req, z.object({ label: z.string().trim().min(1).max(80), identity: z.string().trim().min(7).max(30) }))), 201));
