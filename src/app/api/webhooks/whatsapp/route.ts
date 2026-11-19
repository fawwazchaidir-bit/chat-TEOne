import { isFeatureEnabled } from "@/modules/feature-flags";
import { safeErrorLabel } from "@/lib/safe-error";
import { kickProcessing } from "@/modules/conversations-messages";
import { getMetaConfig, normalizePayload, storeEvents, verifyChallenge, verifySignature } from "@/modules/whatsapp-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_BODY = 3 * 1024 * 1024;
const text = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** Verifikasi langganan webhook oleh Meta: hub.mode=subscribe + hub.verify_token. Flag mati → seolah endpoint tidak ada. */
export async function GET(req: Request) {
  if (!(await isFeatureEnabled("whatsapp_connector"))) return text(404, "tidak ditemukan");
  const r = verifyChallenge(new URL(req.url).searchParams, getMetaConfig().verifyToken);
  return r.ok ? text(200, r.challenge) : text(403, "ditolak");
}

/**
 * Urutan WAJIB: (1) flag & secret ada (gagal-tertutup) → (2) baca RAW BODY → (3) validasi X-Hub-Signature-256 → (4) baru parse JSON
 * → (5) SIMPAN event → (6) baru balas 200. Penyimpanan gagal ⇒ BUKAN 200 (Meta akan mengirim ulang). Payload & tanda tangan tidak pernah dicatat.
 */
export async function POST(req: Request) {
  if (!(await isFeatureEnabled("whatsapp_connector"))) return text(404, "tidak ditemukan");
  const secret = getMetaConfig().appSecret;
  if (!secret) return text(503, "konfigurasi belum lengkap"); // tidak pernah menerima tanpa kemampuan memvalidasi
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return text(413, "terlalu besar");
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > MAX_BODY) return text(413, "terlalu besar");
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) return text(401, "tanda tangan tidak valid");
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return text(400, "bukan JSON");
  }
  try {
    const r = await storeEvents(normalizePayload(body));
    kickProcessing();
    return new Response(JSON.stringify({ received: r.received, stored: r.stored, duplicates: r.duplicates, quarantined: r.quarantined }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    console.error(`[webhook] gagal menyimpan event: ${safeErrorLabel(e)}`); // tanpa payload/pesan driver
    return text(500, "gagal menyimpan");
  }
}
