# Alur AI–admin

> **Tidak ada AI sungguhan di Tahap 3.** UI menampilkan **"AI disiapkan — agent belum terhubung"** untuk percakapan berstatus AI Aktif. Job otomatis yang ada adalah **simulasi** (`ai_sim`, teks `[SIMULASI] …`) di balik flag `ai_simulation`, tidak pernah aktif di production, dipakai hanya untuk membuktikan pengambilalihan dan kill switch.

## Status AI per percakapan (kontrak inti #4)
- **AI Aktif** (default) atau **AI Off** dengan alasan: *Admin mengambil alih*, *Admin membalas*, *Eskalasi*, *Balasan dari HP (WhatsApp Business App)*, *Kill switch chat*, *Dimatikan manual*.
- Setiap perubahan **atomik** (baris percakapan dikunci), bernomor **versi**, dan mencatat **aktor, alasan, waktu** (`conversation_ai_events`, append-only) + audit log. Perubahan yang tidak mengubah apa pun tidak menaikkan versi dan tidak menimpa alasan pertama.
- Aksi UI memakai `expectedVersion`: bila status sudah diubah pengguna lain → 409 `AI_VERSION_CONFLICT` + audit.

## Aksi
| Aksi | Efek |
|---|---|
| **Ambil alih** | AI Off, alasan *admin mengambil alih* — tanpa harus membalas |
| **Matikan AI** | AI Off, alasan *manual* |
| **Balas pelanggan** | AI Off, alasan *admin membalas* (tetap Off walau kirim gagal; **tidak** berubah bila balasan diblokir sebelum komit, mis. jendela tertutup) |
| **Aktifkan kembali AI** | Hanya manual, satu per satu, dengan konfirmasi; mencatat **batas** |
| **Eskalasi** | AI Off, alasan *eskalasi*, penanda Eskalasi |
| Kill switch chat | AI Off, alasan *kill switch* |

**AI tidak pernah menyala kembali sendiri** — tidak oleh pesan baru, pemeliharaan, maupun pelepasan kill switch (diuji).

## Aktivasi ulang dan batas
Saat diaktifkan, sistem mencatat `ai_boundary_at = sekarang`. **Hanya pesan pelanggan baru dengan waktu provider setelah batas** yang layak diproses. **Tidak layak:** pesan lama, history, duplikat, event terlambat yang waktunya sebelum/tepat pada batas, pesan keluar/echo. **Waktu tak terbukti** saat AI Aktif → percakapan diberi penanda **"Perlu ditinjau"** (`urutan_tidak_pasti`) dan **tidak diproses** (ragu → jangan kirim). Admin menandai "sudah ditinjau" (teraudit); mengambil alih juga membersihkannya.

## Pencegahan benturan AI–admin
Titik komit pengiriman otomatis dan pengambilalihan admin mengunci **baris percakapan yang sama**, jadi hanya satu yang menang:
1. **Admin lebih dulu** → versi AI berubah → job **dibatalkan** (0 pesan AI terkirim). Job tertunda milik versi lama dibatalkan di transaksi yang sama; pemeriksaan ulang versi/status tepat sebelum kirim adalah lapis kedua.
2. **Job lebih dulu** → pesan AI sudah tercatat (`diproses`) dan dikirim ke Meta. UI menampilkan **"Sedang dikirim / belum pasti"** dan job **"sudah ke Meta, TIDAK dapat dibatalkan"** — tidak pernah dijanjikan dapat dibatalkan. Hasil akhirnya ditampilkan apa adanya (Diterima Meta / Gagal / **BELUM PASTI**, tanpa kirim ulang).
Diuji dengan job simulasi, termasuk balapan 6 putaran dan penahanan panggilan Meta (`mock.hold`).

## Echo dari HP (D-05, ASUMSI)
Pesan keluar **baru** dari WhatsApp Business App (echo) → **AI Off** "balasan dari HP" (aktor sistem). Echo **lama / sebelum batas / tanpa waktu / duplikat** tidak membalik status (audit `conversation.echo_ai_ignored`). Echo dicatat sebagai pesan keluar sumber *WhatsApp Business App*; tidak membuka/memperpanjang jendela layanan; tidak menambah belum dibaca. Identitas admin pengirim **tidak ditebak**.

## Batasan jujur
Pesan AI yang sudah di Meta tidak dapat ditarik. Perilaku coexistence Meta yang sebenarnya (kapan echo tiba, urutan) **belum terbukti** — dasar D-05 adalah asumsi.
