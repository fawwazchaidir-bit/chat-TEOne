import { PG_ERR, pgErrorCode } from "@/db/client";
import { badRequest, conflict } from "@/lib/errors";

/** Menerjemahkan error database (constraint/trigger) menjadi error aplikasi yang bermakna. Error lain dilempar ulang. */
export function mapDbError(e: unknown, hints: { unique?: Record<string, [string, string]> } = {}): never {
  const code = pgErrorCode(e);
  const detail = String((e as { cause?: { constraint?: string }; constraint?: string })?.cause?.constraint ?? (e as { constraint?: string })?.constraint ?? "");
  if (code === PG_ERR.CHANNEL_LIMIT) throw conflict("CHANNEL_LIMIT", "Batas channel aktif tercapai. Arsipkan channel lain atau naikkan batas di Pengaturan.");
  if (code === PG_ERR.LAST_SUPER_ADMIN) throw conflict("LAST_SUPER_ADMIN", "Super Admin aktif terakhir tidak boleh dinonaktifkan atau diturunkan haknya.");
  if (code === PG_ERR.LIMIT_BELOW_ACTIVE) throw conflict("LIMIT_BELOW_ACTIVE", "Batas channel tidak boleh lebih kecil dari jumlah channel aktif saat ini.");
  if (code === "23505") {
    const hint = hints.unique?.[detail];
    throw conflict(hint?.[0] ?? "DUPLICATE", hint?.[1] ?? "Data dengan nilai yang sama sudah ada.");
  }
  if (code === "23514") throw badRequest("Data melanggar aturan integritas.", { constraint: detail }, "CONSTRAINT_VIOLATION");
  if (code === "23503") throw badRequest("Data merujuk ke objek yang tidak ada.", undefined, "INVALID_REFERENCE");
  throw e;
}
