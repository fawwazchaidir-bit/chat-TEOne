import { pgErrorCode } from "@/db/client";
import { AppError } from "@/lib/errors";

/**
 * Label error AMAN untuk log/penyimpanan. Pesan error driver/ORM memuat PARAMETER query (mis. isi chat, hash sandi) —
 * karena itu pesan mentah TIDAK PERNAH dicatat; hanya kode SQLSTATE, kode AppError, atau nama kelas error.
 */
export function safeErrorLabel(e: unknown): string {
  const code = pgErrorCode(e);
  if (code) return `pg:${code}`;
  if (e instanceof AppError) return `app:${e.code}`;
  if (e instanceof Error) return e.name === "Error" ? "Error" : e.name.slice(0, 60);
  return "kesalahan_tidak_dikenal";
}
