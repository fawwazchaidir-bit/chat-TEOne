import { createHmac, timingSafeEqual } from "node:crypto";
import { safeEqual } from "@/modules/shared/crypto";

/**
 * Validasi `X-Hub-Signature-256` terhadap RAW BODY (byte persis seperti diterima), SEBELUM parsing.
 * Format header: `sha256=<hex HMAC-SHA256 dengan app secret>`. Perbandingan konstan-waktu. Tanpa secret/header → ditolak.
 */
export function verifySignature(raw: Uint8Array, header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(header.trim());
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const got = Buffer.from(m[1] as string, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Hanya untuk test/skrip uji: membuat header tanda tangan yang sah. */
export const signBody = (raw: Uint8Array | string, secret: string) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

/** Verifikasi langganan webhook (GET): `hub.mode=subscribe` + `hub.verify_token` cocok → balas `hub.challenge`. */
export function verifyChallenge(q: URLSearchParams, expectedToken: string | undefined): { ok: true; challenge: string } | { ok: false } {
  const token = q.get("hub.verify_token");
  const challenge = q.get("hub.challenge");
  if (!expectedToken || q.get("hub.mode") !== "subscribe" || !token || !challenge) return { ok: false };
  if (!safeEqual(token, expectedToken)) return { ok: false };
  if (!/^[\w.-]{1,200}$/.test(challenge)) return { ok: false }; // cegah refleksi karakter aneh (XSS/header injection)
  return { ok: true, challenge };
}
