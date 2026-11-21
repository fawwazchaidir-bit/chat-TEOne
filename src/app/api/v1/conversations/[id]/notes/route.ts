import { z } from "zod";
import { apiFull, idParam, readJson } from "@/lib/http";
import { addNote } from "@/modules/inbox";

export const POST = apiFull(async ({ req, ctx, params }) => addNote(ctx, idParam(params), (await readJson(req, z.object({ body: z.string().max(2000) }))).body));
