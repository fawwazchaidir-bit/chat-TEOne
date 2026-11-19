import { hash, verify } from "@node-rs/argon2";
import { badRequest } from "@/lib/errors";

// Argon2id (algoritma bawaan @node-rs/argon2), parameter minimum OWASP: m=19 MiB, t=2, p=1.
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, OPTS);

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/** Menyamakan waktu respons saat pengguna tidak ada/nonaktif (mengurangi enumerasi akun lewat timing). */
export async function burnPasswordCheck(plain: string) {
  dummy ??= hashPassword("dummy-password-for-timing-only");
  await verifyPassword(await dummy, plain);
}

export const PASSWORD_MIN = 12;
export function assertPasswordPolicy(password: string, email?: string) {
  if (password.length < PASSWORD_MIN) throw badRequest(`Kata sandi minimal ${PASSWORD_MIN} karakter.`, undefined, "WEAK_PASSWORD");
  if (password.length > 128) throw badRequest("Kata sandi maksimal 128 karakter.", undefined, "WEAK_PASSWORD");
  if (email && password.toLowerCase().includes(email.split("@")[0]!.toLowerCase()) && email.split("@")[0]!.length >= 4)
    throw badRequest("Kata sandi tidak boleh memuat nama akun email.", undefined, "WEAK_PASSWORD");
  if (/^(.)\1+$/.test(password)) throw badRequest("Kata sandi terlalu mudah ditebak.", undefined, "WEAK_PASSWORD");
}
