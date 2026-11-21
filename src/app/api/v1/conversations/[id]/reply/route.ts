import { z } from "zod";
import { apiFull, idParam, json } from "@/lib/http";
import { badRequest } from "@/lib/errors";
import { replyToConversation } from "@/modules/inbox";

const fields = z.object({ kind: z.enum(["text", "image", "document"]), idempotencyKey: z.string().min(8).max(100), text: z.string().max(4096).optional(), caption: z.string().max(1024).optional() });
const MAX_FILE = 16 * 1024 * 1024;

/** multipart/form-data. Penerima TIDAK diterima dari klien: selalu diambil dari percakapan di server. */
export const POST = apiFull(async ({ req, ctx, params }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest("Isi permintaan harus multipart/form-data.", undefined, "VALIDATION_ERROR");
  const f = fields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!f.success) throw badRequest("Data tidak valid.", f.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })), "VALIDATION_ERROR");
  let file: { bytes: Uint8Array; mime: string; filename: string } | undefined;
  const raw = form.get("file");
  if (raw instanceof File) {
    if (raw.size > MAX_FILE) throw badRequest("Berkas terlalu besar.", undefined, "FILE_TOO_LARGE");
    file = { bytes: new Uint8Array(await raw.arrayBuffer()), mime: raw.type, filename: raw.name };
  }
  return json(await replyToConversation(ctx, idParam(params), { ...f.data, file }), 200);
});
