import { z } from "zod";
import { apiFull, json, readJson } from "@/lib/http";
import { createQuickReply, listQuickReplies } from "@/modules/inbox";

const body = z.object({ title: z.string().max(80), body: z.string().max(1000), channelId: z.uuid().nullable().optional(), teamId: z.uuid().nullable().optional() });
export const GET = apiFull(async ({ ctx }) => ({ items: await listQuickReplies(ctx) }));
export const POST = apiFull(async ({ req, ctx }) => json(await createQuickReply(ctx, await readJson(req, body)), 201));
