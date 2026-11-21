import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { setStrayLead } from "@/modules/inbox";

export const POST = apiFull(async ({ req, ctx, params }) => setStrayLead(ctx, idParam(params), (await readJson(req, z.object({ value: z.boolean() }))).value));
