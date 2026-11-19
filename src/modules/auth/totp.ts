import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const PERIOD = 30;
const make = (secretBase32: string, label: string) =>
  new OTPAuth.TOTP({ issuer: "TE One", label, algorithm: "SHA1", digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secretBase32) });

export const generateTotpSecret = () => new OTPAuth.Secret({ size: 20 }).base32;
export const totpUri = (secretBase32: string, label: string) => make(secretBase32, label).toString();
export const totpQrDataUrl = (uri: string) => QRCode.toDataURL(uri, { margin: 1, width: 220 });

/** Mengembalikan nomor langkah waktu (untuk proteksi replay) bila kode valid pada jendela ±1 langkah; selain itu null. */
export function verifyTotp(secretBase32: string, token: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const delta = make(secretBase32, "x").validate({ token, window: 1, timestamp: nowMs });
  return delta === null ? null : Math.floor(nowMs / 1000 / PERIOD) + delta;
}

/** Hanya untuk test/CLI: kode yang sedang berlaku. */
export const currentTotp = (secretBase32: string, nowMs = Date.now()) => make(secretBase32, "x").generate({ timestamp: nowMs });
