# Status belum dibaca dan penugasan

## Belum dibaca — D-16 (default: per pengguna; **ASUMSI**, keputusan masih Terbuka)
- Setiap pengguna punya penanda baca sendiri per percakapan (`conversation_reads.last_read_at`). Dibaca satu admin **tidak** mengubah admin lain.
- **Jumlah belum dibaca** = pesan pelanggan **langsung** yang baru (`messages.unread_eligible`) dengan waktu terima setelah penanda baca pengguna itu.
- **Tidak menambah jumlah:** webhook **duplikat**, pesan **history** (baru maupun lama, dengan atau tanpa cap waktu), dan **echo** dari WhatsApp Business App.
- Percakapan terbuka ditandai terbaca otomatis (juga saat pesan baru tiba selagi terbuka).
- Hanya mengikuti izin: jumlah di navigasi/daftar tidak memuat percakapan di luar akses.
- Bila pemilik memutuskan "bersama": ubah ekspresi hitung (`unreadExpr` di `src/modules/inbox/list.ts`) dan tabel pembaca; tidak ada konsep lain yang terdampak.

## Penugasan
Lihat [`tim-antrian-routing.md`](tim-antrian-routing.md). Ringkas: tim + PIC chat opsional, `expectedVersion` untuk mendeteksi perubahan bersamaan (409 + audit), dapat dilepas, semuanya teraudit.
