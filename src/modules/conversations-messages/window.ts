/**
 * Jendela layanan 24 jam (CCP 2.7). Dihitung HANYA dari pesan pelanggan yang terbukti (waktu provider; bila tak ada, waktu server).
 * History dan echo TIDAK dihitung (kolom `last_customer_message_at` tidak pernah diperbarui oleh keduanya).
 * Tertutup ATAU tidak dapat dipastikan ⇒ pesan bebas diblokir dengan alasan yang jelas.
 */
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type WindowState = { open: boolean; reason: "terbuka" | "belum_ada_pesan_pelanggan" | "tertutup" | "waktu_tidak_valid"; closesAt: Date | null; message: string };

export function evaluateWindow(lastCustomerMessageAt: Date | null, now: Date = new Date()): WindowState {
  if (!lastCustomerMessageAt) return { open: false, reason: "belum_ada_pesan_pelanggan", closesAt: null, message: "Belum ada pesan pelanggan yang terbukti; pesan bebas tidak boleh dikirim (gunakan template — Tahap 6)." };
  const t = lastCustomerMessageAt.getTime();
  if (Number.isNaN(t) || t > now.getTime() + CLOCK_SKEW_MS) return { open: false, reason: "waktu_tidak_valid", closesAt: null, message: "Waktu pesan pelanggan tidak dapat dipastikan; pesan bebas diblokir." };
  const closesAt = new Date(t + WINDOW_MS);
  if (now.getTime() < closesAt.getTime()) return { open: true, reason: "terbuka", closesAt, message: "Jendela layanan terbuka." };
  return { open: false, reason: "tertutup", closesAt, message: "Jendela layanan 24 jam sudah tertutup; pesan bebas diblokir (gunakan template — Tahap 6)." };
}

/**
 * Bukti WAKTU pesan pelanggan (G2-A02). Waktu KEDATANGAN (kapan server menerima webhook) BUKAN bukti kapan pesan dibuat: notifikasi
 * bisa tertunda atau dikirim ulang. Hanya cap waktu provider yang sah — ada, terbaca, dan tidak berada di masa depan melebihi
 * toleransi jam — yang boleh menjadi dasar jendela layanan. Selain itu hasilnya `null` ⇒ dasar jendela TIDAK diperbarui ⇒ pesan bebas diblokir.
 */
export function provenCustomerTime(providerTs: string | null | undefined, now: Date = new Date()): Date | null {
  if (!providerTs) return null;
  const d = new Date(providerTs);
  const t = d.getTime();
  if (Number.isNaN(t) || t > now.getTime() + CLOCK_SKEW_MS) return null;
  return d;
}
