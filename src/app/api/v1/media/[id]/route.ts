import { apiFull, idParam } from "@/lib/http";
import { readMediaForUser } from "@/modules/conversations-messages";

/** Media privat: SELALU lewat pemeriksaan izin channel. Tanpa cache; CSP sandbox + nosniff; dokumen diunduh, gambar inline. */
export const GET = apiFull(async ({ ctx, params }) => {
  const m = await readMediaForUser(ctx, idParam(params));
  return new Response(new Uint8Array(m.bytes), {
    status: 200,
    headers: {
      "content-type": m.mime, "content-length": String(m.bytes.byteLength), "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox", "content-disposition": m.kind === "image" ? "inline" : 'attachment; filename="dokumen.pdf"',
    },
  });
});
