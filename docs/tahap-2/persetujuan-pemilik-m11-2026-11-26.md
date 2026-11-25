# Persetujuan tertulis pemilik — uji echo M-11 (nomor …6319 → penguji …4062), 26 November 2026

> **Sifat dokumen.** Mencatat **apa adanya** instruksi/izin tertulis pemilik yang disampaikan melalui sesi pengembangan pada 26 Nov 2026. Tanpa tanda tangan formal. **Belum dijalankan.** Pembangun **tidak punya akses** ke staging, akun Meta, atau ponsel dan **tidak dapat menyatakan prasyarat terpenuhi**; yang dapat disiapkan pembangun adalah runbook [`runbook-uji-m11.md`](runbook-uji-m11.md) dan verifikasi dokumentasi [`verifikasi-dokumentasi-meta-2026-11-26.md`](verifikasi-dokumentasi-meta-2026-11-26.md).
> Pemetaan pembangun ke formulir [`prosedur-uji-m11-m12.md`](prosedur-uji-m11-m12.md) §10: **A-2** (jalankan M-11) dan **A-2c** (isolasi ponsel) — pilihan pemilik setara **I-3 (pembekuan ponsel)** dengan syarat yang ia tulis sendiri. **Kotak centang di formulir tidak diisi pembangun**; dokumen ini adalah rekaman keputusan tertulisnya.

## 1. Teks izin (verbatim)

> **Instruksi Uji Echo M-11 — TE One**
> Saya mengizinkan uji echo pada nomor 6319, meskipun WhatsApp Business di ponsel tersebut memiliki chat pelanggan nyata. Uji hanya menggunakan pesan sintetis dari 6319 ke nomor penguji 4062.
>
> **Sebelum uji**
> 1. Pastikan `inbox` dan `ai_simulation` mati, mode uji aktif, dan daftar penerima uji benar.
> 2. Periksa kondisi worker dan antrean, termasuk cara menangani event tertunda.
> 3. Siapkan backup terenkripsi database dan media, salinan terpisah, serta bukti uji restore pada lingkungan terisolasi.
> 4. Verifikasi ke dokumentasi resmi Meta tentang field echo dan kemungkinan cakupan event dari Business App.
> 5. Catat kondisi awal subscription dan jumlah event dalam bentuk teks, tanpa tangkapan layar atau isi chat.
> 6. Tentukan satu operator yang memegang ponsel selama uji dan pastikan tidak ada aktivitas lain pada ponsel selama periode tersebut.
> 7. Jangan mengganti image atau mengubah konfigurasi server sebagai bagian dari izin echo ini. Jika diperlukan, ajukan rencana terpisah.
>
> **Pelaksanaan**
> 1. Aktifkan hanya field `smb_message_echoes` pada aplikasi Meta TE One, setelah prasyarat di atas terpenuhi.
> 2. Kirim satu pesan teks sintetis dari WhatsApp Business App nomor 6319 ke nomor penguji 4062.
> 3. Periksa apakah pesan tercatat di TE One sebagai pesan keluar dari WhatsApp Business App, tidak dianggap pesan pelanggan, dan tidak memperpanjang jendela layanan.
> 4. Setelah pengamatan, kembalikan subscription echo ke kondisi awal dan periksa hasilnya.
> 5. Catat waktu, hasil, commit/image, status antrean, dan batas pengujian dalam bentuk teks tanpa data pelanggan.
>
> **Kontinjensi**
> - Jika ada event atau data di luar rencana, hentikan uji dan nonaktifkan field echo. Catat jumlah dan statusnya tanpa membuka atau membagikan isi chat.
> - Jangan menghapus payload atau melakukan restore ke database staging secara langsung. Siapkan analisis dan opsi pemulihan terlebih dahulu.
> - Jika layanan terganggu, hentikan pengujian, periksa kondisi antrean dan kesehatan aplikasi, lalu laporkan kepada saya.
> - Jika subscription echo tidak dapat dikembalikan ke kondisi awal, hentikan aktivitas uji dan laporkan kepada saya.
> - Risiko data yang sudah mencapai server atau pesan yang terlewat tidak boleh dinyatakan pasti dapat dibatalkan atau dipulihkan.
>
> **Batas izin:** persetujuan ini hanya untuk uji echo M-11. Tidak mencakup history, re-onboarding, pendaftaran ulang nomor, pengujian ke nomor di luar daftar uji, atau perubahan nomor operasional dan Halo AI.

## 2. Yang diizinkan, yang tidak
| Diizinkan (tertulis) | **Tidak** diizinkan (batas izin + syarat) |
|---|---|
| Aktifkan **hanya** `smb_message_echoes` pada aplikasi Meta **TE One**, **setelah** semua prasyarat terpenuhi | Mengaktifkan `history`, `smb_app_state_sync`, atau field lain |
| **Satu** pesan teks **sintetis** dari 6319 ke 4062 | Pesan kedua, pesan ke nomor di luar daftar uji (**kontrol negatif S4 dibatalkan**), media, atau chat pelanggan nyata |
| Mengembalikan subscription ke kondisi awal dan memeriksanya | Re-onboarding, pendaftaran ulang nomor, perubahan konfigurasi coexistence |
| Mencatat hasil dalam bentuk **teks** | Tangkapan layar, isi chat, nomor lengkap non-penguji |
| Membaca (SQL baca-saja, `docker ps`, `meta:check`) | Mengganti image, mengubah konfigurasi server, **menyalakan worker**, menghapus payload, restore langsung ke DB staging |
| — | Menyentuh Admisi (…1119), Hotline (…0124), Halo AI |

## 3. Penyesuaian terhadap prosedur lama karena batas izin
| Bagian prosedur lama | Sekarang |
|---|---|
| S4 (kontrol negatif ke nomor di luar daftar) | **Dibatalkan** — batas izin melarangnya |
| S7 (pesan ketiga untuk membuktikan pembalikan) | **Dibatalkan** — izin = **satu** pesan. Pembalikan dibuktikan dengan **pembacaan status field (teks)** dan **hitungan event yang tidak bertambah** |
| Fase 1 (rebuild/ganti image, §5) | **Tidak dijalankan** — syarat 7. Uji berjalan pada image **`417b30f8…` (tanpa label revisi)**; bukti tetap berstatus "terikat checkout `9c297d3`, bukan image" |
| Menyalakan worker (A-4/W1) | **Tidak dijalankan** — syarat 7 (perubahan konfigurasi server). Penanganan event tertunda: `runbook-uji-m11.md` §6 |
| Perekam bentuk payload (R-1) | **Tidak ada** — tanpa perubahan kode/image. Akibat: bila payload meleset dari normalizer, **hanya alasan karantina** yang tercatat (S-05). Dokumentasi resmi menunjukkan bentuk yang cocok (§2 verifikasi), sehingga kemungkinan ini **rendah, tidak nol** |

## 4. Risiko yang pemilik terima (sebagian dituliskan pemilik) dan catatan pembangun
- **Diterima pemilik:** data yang sudah mencapai server dan pesan yang terlewat **tidak** dinyatakan pasti dapat dibatalkan atau dipulihkan.
- **Catatan pembangun (tidak membatalkan izin):** (1) cakupan echo = **semua** pesan dari Business App **dan perangkat tertaut** ke **siapa pun** (verifikasi resmi V-3), sehingga "tidak ada aktivitas lain" harus mencakup WhatsApp Web/Business Web dan pesan otomatis Business App (sapaan/jauh/balasan cepat) — **tidak terverifikasi** apakah pesan otomatis memicu echo; (2) pesan **masuk** pelanggan nyata tetap tiba lewat field `messages` yang sudah aktif (dikarantina) dan **tidak dapat dikendalikan**; jendela uji dibuat pendek dan di luar jam ramai; (3) **tidak ada penjamin** bahwa retry Meta (hingga 7 hari) untuk event yang sudah terpicu berhenti seketika setelah field dicabut (halaman tidak menjelaskan) — karena itu layanan harus **sehat (200)** selama uji; (4) hasil uji akan terikat ke **image tanpa label**.
- **Status:** **DISETUJUI TERTULIS OLEH PEMILIK — BELUM DIJALANKAN — prasyarat belum diverifikasi.** Tidak ada tag, tidak ada keputusan gate.
