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
