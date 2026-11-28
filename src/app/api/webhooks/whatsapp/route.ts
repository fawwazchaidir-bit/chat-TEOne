import { isFeatureEnabled } from "@/modules/feature-flags";
import { safeErrorLabel } from "@/lib/safe-error";
import { kickProcessing } from "@/modules/conversations-messages";
import { getMetaConfig, normalizePayload, recordWebhookOutcome, storeEvents, verifyChallenge, verifySignature, type WebhookOutcome } from "@/modules/whatsapp-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_BODY = 3 * 1024 * 1024;
const text = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
/** Mencatat SATU baris log terstruktur (tanpa payload/tanda tangan/nomor — lihat webhook-log.ts) lalu mengembalikan respons apa adanya. */
const done = <R extends Response>(o: WebhookOutcome, res: R): R => {
  recordWebhookOutcome(o);
  return res;
};

/** Verifikasi langganan webhook oleh Meta: hub.mode=subscribe + hub.verify_token. Flag mati → seolah endpoint tidak ada. */
export async function GET(req: Request) {
  if (!(await isFeatureEnabled("whatsapp_connector"))) return done({ method: "GET", reason: "flag_off" }, text(404, "tidak ditemukan"));
  const r = verifyChallenge(new URL(req.url).searchParams, getMetaConfig().verifyToken);
  return r.ok ? done({ method: "GET", reason: "challenge_ok" }, text(200, r.challenge)) : done({ method: "GET", reason: "challenge_rejected" }, text(403, "ditolak"));
}

/**
 * Urutan WAJIB: (1) flag & secret ada (gagal-tertutup) → (2) baca RAW BODY → (3) validasi X-Hub-Signature-256 → (4) baru parse JSON
 * → (5) SIMPAN event → (6) baru balas 200. Penyimpanan gagal ⇒ BUKAN 200 (Meta akan mengirim ulang). Payload & tanda tangan tidak pernah dicatat.
 * Setiap cabang menghasilkan tepat satu baris log `[webhook]` (G3-T01).
 */
export async function POST(req: Request) {
  if (!(await isFeatureEnabled("whatsapp_connector"))) return done({ method: "POST", reason: "flag_off" }, text(404, "tidak ditemukan"));
  const secret = getMetaConfig().appSecret;
  if (!secret) return done({ method: "POST", reason: "secret_missing" }, text(503, "konfigurasi belum lengkap")); // tidak pernah menerima tanpa kemampuan memvalidasi
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return done({ method: "POST", reason: "too_large", bytes: declared }, text(413, "terlalu besar"));
  const raw = new Uint8Array(await req.arrayBuffer());
  const bytes = raw.byteLength;
  if (bytes > MAX_BODY) return done({ method: "POST", reason: "too_large", bytes }, text(413, "terlalu besar"));
  const sigHeader = req.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, sigHeader, secret)) return done({ method: "POST", reason: sigHeader ? "signature_invalid" : "signature_missing", bytes }, text(401, "tanda tangan tidak valid"));
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return done({ method: "POST", reason: "not_json", bytes }, text(400, "bukan JSON"));
  }
  try {
    const r = await storeEvents(normalizePayload(body));
    kickProcessing();
    const counts = { received: r.received, stored: r.stored, duplicates: r.duplicates, quarantined: r.quarantined };
    return done({ method: "POST", reason: "ok", bytes, counts }, new Response(JSON.stringify(counts), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }));
  } catch (e) {
    return done({ method: "POST", reason: "store_failed", bytes, error: safeErrorLabel(e) }, text(500, "gagal menyimpan")); // tanpa payload/pesan driver
  }
}
