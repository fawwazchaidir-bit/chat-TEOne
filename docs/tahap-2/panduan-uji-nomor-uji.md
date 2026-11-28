# Panduan uji dengan nomor uji (Tahap 2)

> Status: **Belum dijalankan.** Tidak ada aplikasi Meta, token, nomor uji, atau staging pada pembangunan Tahap 2. Panduan ini dipakai oleh pemilik/penguji saat akses tersedia.
> Semua bukti yang disimpan di repository **wajib disamarkan** (nomor, nama, isi chat, token). **Jangan** menguji pada Admisi (…196319; dulu ditulis "…1119") atau Hotline (…246319; dulu ditulis "…0124"). **Jangan** mengubah aplikasi/webhook Halo AI.
> Hasil dicatat terpisah: **nyata Meta** vs **simulasi** vs **belum dapat diuji** (format `docs/reports/tahap-2.md`).

## A. Persiapan (sekali)
1. Ikuti `konfigurasi-staging.md` §1–§6 sampai `npm run meta:check` menampilkan **META ASLI** dan webhook terverifikasi di dashboard Meta.
2. Pastikan feature flag `whatsapp_connector` **nyala hanya di staging**.
3. Penguji memiliki izin `channel.view`, `channel.manage`, `integration.test` pada channel uji.
4. Di `/integrasi` tambahkan **hanya** nomor peserta uji (milik tim sendiri) ke daftar penerima uji.
5. Siapkan: 1 ponsel peserta uji; (coexistence) ponsel yang menjalankan WhatsApp Business App pada nomor uji; 1 gambar (≤ 5 MB) dan 1 PDF (≤ 16 MB) **tanpa data pribadi**.

## B. Uji Cloud API (API dapat menerima dan mengirim)
| # | Langkah | Hasil yang diharapkan | Bukti (disamarkan) |
|---|---|---|---|
| B1 | Dashboard Meta → verifikasi webhook | Challenge berhasil; `GET` 200 | Tangkapan layar status webhook |
| B2 | Peserta uji kirim teks ke nomor uji | Pesan muncul di `/integrasi` (sumber *Pelanggan*) ≤ beberapa detik; satu kali | Baris pesan + waktu |
| B3 | Kirim ulang/duplikasi: di dashboard Meta kirim uji webhook yang sama berulang (bila tersedia) | Tidak ada pesan ganda; `duplicates` bertambah | Hitungan di alat uji |
| B4 | Balas teks dari `/integrasi` (dalam 24 jam) | Status `diterima_api` → `terkirim` → `diterima` → `dibaca` sesuai yang dilihat di ponsel | Urutan status + tangkapan ponsel |
| B5 | Kirim gambar dan PDF dari `/integrasi`; peserta kirim gambar dan PDF | Terkirim/tampil; media masuk tersimpan privat dan dapat dibuka hanya oleh berizin | Pratinjau (tanpa data pribadi) |
| B6 | Tunggu >24 jam sejak pesan pelanggan terakhir, lalu coba balas teks | **Diblokir** dengan alasan jendela layanan; tidak ada panggilan ke Meta | Pesan penolakan |
| B7 | Kirim ke nomor yang **bukan** penerima uji | Ditolak 403 di server | Pesan penolakan |
| B8 | Dari nomor yang **bukan** peserta uji, kirim pesan ke nomor uji (mode uji aktif) | Tidak diproses; hanya hitungan "Pengirim di luar daftar uji" bertambah; isi **tidak** tersimpan | Hitungan; cek DB: tidak ada pesan/kontak baru |
| B9 | Matikan sementara jaringan keluar server lalu kirim | Status `belum_pasti`, **satu** percobaan; tidak ada retry; selesaikan lewat status webhook atau manual | Status + audit |
| B10 | Cabut/ubah token (mis. token salah) → kirim | `gagal` kategori autentikasi; token tidak tampil di mana pun | Status |
| B11 | Catat kode galat Meta nyata yang muncul | Perbarui `errors.ts` bila berbeda dari pemetaan | Catatan kode (tanpa isi) |
| B12 | Catat bentuk payload nyata (`messages`, `statuses`, `referral` bila iklan CTWA) | Perbarui `normalize.ts` bila berbeda; **simpan contoh yang disamarkan sebagai fixture baru** | Fixture disamarkan |

## C. Uji coexistence (nomor yang sama aktif di WhatsApp Business App dan Cloud API)
Ikuti skenario di `coexistence.md` §6. Tambahan hasil yang diharapkan di TE One:
| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| C1 | Kirim pesan dari HP (WhatsApp Business App) ke peserta uji | Muncul sebagai pesan **keluar**, sumber *WhatsApp Business App*; satu kali (dedup); jendela layanan **tidak** terbuka/terperpanjang; tidak ada pengiriman otomatis |
| C2 | Setujui berbagi riwayat | Pesan lama tampil sebagai *History*; tidak ada unread/hook; tidak menggandakan pesan yang sudah ada |
| C3 | Tolak berbagi riwayat | Tidak ada pesan History; tidak ada galat yang menggagalkan percakapan |
| C4 | Catat semua butir `coexistence.md` §1 | Tabel diisi tautan dokumentasi resmi + tanggal akses |

## D. Setelah uji
1. Hapus nomor peserta uji dari daftar jika uji selesai; jangan menyimpan tangkapan layar yang memuat nomor/isi chat.
2. Isi bagian "nyata Meta" di `docs/reports/tahap-2.md` dengan hasil aktual (termasuk yang **gagal**).
3. Perbarui status golden E2E **G2 (NYATA)** hanya bila B2–B4 dan C1 benar-benar lulus; jangan mengubah placeholder tanpa bukti.
4. Jika ada temuan: catat ID, prioritas, dampak, bukti, tindakan, penanggung jawab.
