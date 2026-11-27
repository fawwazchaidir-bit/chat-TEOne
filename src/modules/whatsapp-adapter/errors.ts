/**
 * Pemetaan kode galat Meta → kategori operasional (Indonesia).
 * STATUS: pemetaan disusun dari sumber SEKUNDER (blog/dokumen vendor) dan pengetahuan umum — BELUM diverifikasi ke tabel
 * kode galat resmi Meta (host dokumentasi diblokir di sesi pembangunan). Kode tak dikenal → `tidak_dikenal` (aman).
 */
export type MetaErrorCategory =
  | "autentikasi" | "izin" | "rate_limit" | "jendela_layanan" | "penerima_tidak_valid" | "media" | "template"
  | "parameter" | "server_meta" | "tipe_tidak_didukung" | "tidak_dikenal";

export function categorizeMetaError(code?: number | null, httpStatus?: number | null): MetaErrorCategory {
  if (code === 190 || code === 102) return "autentikasi";
  if (code === 10 || code === 3 || code === 133010 || (code !== undefined && code !== null && code >= 200 && code <= 299)) return "izin";
  if (code === 4 || code === 80007 || code === 130429 || code === 131048 || code === 131056) return "rate_limit";
  if (code === 131047) return "jendela_layanan";
  if (code === 131026 || code === 131021) return "penerima_tidak_valid";
  if (code === 131052 || code === 131053) return "media";
  if (code === 131051) return "tipe_tidak_didukung";
  if (code !== undefined && code !== null && code >= 132000 && code <= 132999) return "template";
  if (code === 100) return "parameter";
  if (code === 1 || code === 2 || code === 131000 || code === 131016) return "server_meta";
  if (httpStatus === 429) return "rate_limit";
  if (httpStatus === 401) return "autentikasi";
  if (httpStatus === 403) return "izin";
  if (httpStatus !== undefined && httpStatus !== null && httpStatus >= 500) return "server_meta";
  return "tidak_dikenal";
}

export const CATEGORY_LABEL: Record<MetaErrorCategory | "timeout" | "jaringan" | "media_upload" | "konfigurasi", string> = {
  autentikasi: "Token akses Meta ditolak/kedaluwarsa",
  izin: "Izin/akun WhatsApp Business tidak memadai",
  rate_limit: "Batas kecepatan/kuota Meta tercapai",
  jendela_layanan: "Di luar jendela layanan 24 jam (butuh template)",
  penerima_tidak_valid: "Penerima tidak valid / tidak dapat dikirimi pesan",
  media: "Masalah media",
  template: "Masalah template",
  parameter: "Parameter permintaan tidak valid",
  server_meta: "Gangguan di sisi Meta",
  tipe_tidak_didukung: "Jenis pesan tidak didukung",
  tidak_dikenal: "Kesalahan Meta tidak dikenal",
  timeout: "Waktu tunggu habis — hasil belum pasti",
  jaringan: "Gangguan jaringan — hasil belum pasti",
  media_upload: "Gagal mengunggah media (pesan belum dikirim)",
  konfigurasi: "Konfigurasi Meta belum lengkap",
};

// ───────────── Sinkronisasi kontak & riwayat (S-12) ─────────────
/** Kode pada webhook `history` bila pemilik bisnis menolak berbagi riwayat (dokumentasi resmi Meta, dibaca 26 Nov 2026). */
export const HISTORY_SHARING_DECLINED_CODE = 2593109;
export const HISTORY_DECLINED_LABEL = "Pemilik bisnis menolak berbagi riwayat (kode 2593109) — Meta tidak akan mengirim riwayat";

/** Hasil panggilan SMB App Data API yang sudah DIKLASIFIKASI. `belum_pasti` = Meta mungkin sudah memproses: tidak boleh dicoba ulang. */
export type SmbSyncClassified =
  | { status: "diterima_meta"; requestId: string }
  | { status: "gagal"; failureKind: "http" | "tidak_dikirim"; httpStatus: number | null; metaCode: number | null; metaSubcode: number | null; label: string }
  | { status: "belum_pasti"; failureKind: "timeout" | "jaringan" | "http" | "respons_tak_dikenal"; httpStatus: number | null; metaCode: number | null; metaSubcode: number | null; label: string };

type SyncCall =
  | { ok: true; status: number; data: unknown }
  | { ok: false; kind: "konfigurasi"; detail: string }
  | { ok: false; kind: "timeout" | "jaringan" }
  | { ok: false; kind: "http"; status: number; meta: { code: number | null; subcode: number | null } };

/**
 * Klasifikasi eksplisit (tanpa ketergantungan pada teks pesan Meta):
 *  - 2xx dengan `messaging_product="whatsapp"` DAN `request_id` berupa teks → `diterima_meta`. 2xx dengan bentuk lain → `belum_pasti` (TIDAK pernah dinyatakan diterima tanpa respons yang sah).
 *  - timeout/jaringan → `belum_pasti`. HTTP ≥ 500 atau kategori `server_meta` → `belum_pasti` (server mungkin sudah memproses).
 *  - HTTP 4xx lain (termasuk rate limit 429/kode 4/80007/130429) → `gagal`: Meta menjawab menolak. Kategorinya dicatat; TIDAK ada percobaan ulang otomatis.
 */
export function classifySmbSyncResult(r: SyncCall): SmbSyncClassified {
  if (r.ok) {
    const d = (typeof r.data === "object" && r.data !== null ? r.data : {}) as { messaging_product?: unknown; request_id?: unknown };
    if (d.messaging_product === "whatsapp" && typeof d.request_id === "string" && d.request_id.length > 0 && d.request_id.length <= 200) return { status: "diterima_meta", requestId: d.request_id };
    return { status: "belum_pasti", failureKind: "respons_tak_dikenal", httpStatus: r.status, metaCode: null, metaSubcode: null, label: "Meta menjawab sukses tetapi bentuk respons tidak dikenal — hasil belum pasti" };
  }
  if (r.kind === "konfigurasi") return { status: "gagal", failureKind: "tidak_dikirim", httpStatus: null, metaCode: null, metaSubcode: null, label: `${CATEGORY_LABEL.konfigurasi} (tidak dikirim)` };
  if (r.kind === "timeout" || r.kind === "jaringan") return { status: "belum_pasti", failureKind: r.kind, httpStatus: null, metaCode: null, metaSubcode: null, label: CATEGORY_LABEL[r.kind] };
  if (r.kind !== "http") return { status: "belum_pasti", failureKind: "respons_tak_dikenal", httpStatus: null, metaCode: null, metaSubcode: null, label: "Hasil tidak dikenal — belum pasti" };
  const cat = categorizeMetaError(r.meta.code, r.status);
  const label = CATEGORY_LABEL[cat];
  if (r.status >= 500 || cat === "server_meta") return { status: "belum_pasti", failureKind: "http", httpStatus: r.status, metaCode: r.meta.code, metaSubcode: r.meta.subcode, label: `${label} — hasil belum pasti` };
  return { status: "gagal", failureKind: "http", httpStatus: r.status, metaCode: r.meta.code, metaSubcode: r.meta.subcode, label };
}
