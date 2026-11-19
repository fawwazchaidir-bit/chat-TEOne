import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

const masterKey = () => Buffer.from(getEnv().APP_ENCRYPTION_KEY, "base64");
const b64 = (b: Buffer) => b.toString("base64url");

/** AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext>. Kunci dikelola terpisah dari database (APP_ENCRYPTION_KEY). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${b64(iv)}.${b64(c.getAuthTag())}.${b64(ct)}`;
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Format rahasia terenkripsi tidak dikenal");
  const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** Kode pemulihan berentropi tinggi (80 bit) → HMAC dengan sub-kunci turunan; hanya hash yang disimpan. */
export function hashRecoveryCode(code: string): string {
  const sub = Buffer.from(hkdfSync("sha256", masterKey(), Buffer.alloc(0), "teone/recovery-code/v1", 32));
  return createHmac("sha256", sub).update(normalizeRecoveryCode(code)).digest("hex");
}

export const normalizeRecoveryCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

const RC_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 simbol → tepat 5 bit per karakter
export function generateRecoveryCode(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += RC_ALPHABET[(bytes[i] as number) & 31];
    if (i % 4 === 3 && i < 15) out += "-";
  }
  return out;
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
