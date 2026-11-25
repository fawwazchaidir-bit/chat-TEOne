# Matriks uji coexistence nyata terkontrol (Gate 2 — CCP 2.8, 2.9, 2.10)

> **Status: DISIAPKAN, BELUM DIJALANKAN** (kecuali baris yang tertulis "dilaporkan lulus", yang berasal dari laporan operator 25 Nov 2026 — lihat [`bukti-uji-staging-2026-11-25.md`](bukti-uji-staging-2026-11-25.md); bukti belum terlampir). Pembangun **tidak memiliki akses** ke akun Meta, ponsel uji, maupun staging; matriks ini adalah **rencana yang dapat dijalankan operator**, bukan hasil.
> Baca juga [`panduan-uji-nomor-uji.md`](panduan-uji-nomor-uji.md) dan [`coexistence.md`](coexistence.md) (catatan coexistence **belum terverifikasi** ke dokumentasi Meta resmi — T2-F05, A7).
> **Aturan keras:** hanya **data sintetis** dan **nomor uji yang disetujui** (penguji **…4062**, nomor bisnis uji **…6319**). **Jangan** menyentuh Admisi (…1119), Hotline (…0124), maupun Halo AI. **Jangan** mengaktifkan history/echo, melakukan re-onboarding, mendaftarkan ulang nomor, atau mengubah konfigurasi coexistence yang berdampak pada akun **tanpa persetujuan tertulis pemilik atas langkah dan dampaknya** (kolom *Gerbang* di bawah).

## 0. Kondisi awal yang HARUS dicatat operator sebelum menjalankan apa pun (pembangun tidak mengetahuinya)
| Hal | Nilai | Dicatat oleh / tanggal |
|---|---|---|
| Apakah …6319 terhubung sebagai **coexistence** (WhatsApp Business App **dan** Cloud API aktif bersama) atau **Cloud API saja**? | _belum diketahui_ | |
| Versi WhatsApp Business App di ponsel uji; negara nomor | _belum diketahui_ | |
| Saat onboarding: apakah **sinkronisasi riwayat dipilih/ditolak**? (tidak dapat diulang tanpa re-onboarding) | _belum diketahui_ | |
| Field webhook yang **sedang disubscribe** (mis. `messages`; field echo/history bila ada) — **verifikasi nama field ke dokumentasi Meta** | _belum diketahui_ | |
| Flag staging: `whatsapp_connector` menyala; `inbox` & `ai_simulation` **mati** | _periksa di halaman Kill switch & flag_ | |
| Mode uji channel aktif; daftar penerima uji hanya …4062 | _periksa di panel koneksi_ | |

## 1. Matriks
Hasil hanya boleh: **lulus** · **gagal** · **belum dapat diuji** (dengan alasan). Kolom *Bukti* diisi dengan rujukan berkas **disamarkan** di `docs/reports/bukti/`.

| ID | Skenario | Hasil yang diharapkan (kriteria lulus) | Gerbang pemilik | Dampak ke akun | Status | Bukti / batas |
|---|---|---|---|---|---|---|
| M-01 | Pesan **teks masuk** dari …4062 | Tersimpan di channel Kemitraan Uji, satu kali; jendela layanan terbuka dari **waktu provider** | Tidak perlu | Tidak ada | **Dilaporkan lulus** (25 Nov) | Bukti belum terlampir |
| M-02 | **Teks keluar** dari TE One ke …4062 | Diterima penerima; tercatat `te_one`; AI/otomatisasi **tidak** terlibat | Tidak perlu | Tidak ada | **Dilaporkan lulus** (25 Nov) | Bukti belum terlampir |
| M-03 | Status **Diterima** (`delivered`) | Status pesan keluar berubah via webhook | Tidak perlu | Tidak ada | **Dilaporkan lulus** (25 Nov) | Bukti belum terlampir |
| M-04 | Status **Dibaca** (`read`) | Status → Dibaca setelah penerima membuka pesan (tanda baca aktif) | Tidak perlu | Tidak ada | **Belum dapat diuji** — belum dicoba | Perlu penerima membuka pesan |
| M-05 | Pengirim **di luar daftar uji** | Dikarantina, tidak membuat kontak/percakapan, hanya dihitung | Tidak perlu (pakai nomor tim lain yang disetujui) | Tidak ada | **Dilaporkan lulus** (25 Nov) | Identitas pengirim uji belum dicatat |
| M-06 | Webhook **ditolak** (tanda tangan salah) | HTTP 401; **tidak ada** data tersimpan; tidak ada kebocoran isi | Tidak perlu | Tidak ada | **Dilaporkan terjadi** (App Secret keliru, butir 8) lalu diperbaiki | Disengaja dengan secret salah **hanya di staging** bila ingin bukti terencana |
| M-07 | **Webhook duplikat** dari Meta (retry nyata) | Tidak menggandakan pesan | Tidak perlu | Tidak ada | **Belum dapat diuji** — tidak dapat dipicu sesuka hati; amati bila terjadi (simulasi: terbukti) | Cari event ID ganda di log |
| M-08 | Kirim **di luar jendela 24 jam** | Ditolak server dengan alasan; **0** panggilan Meta | Tidak perlu | Tidak ada | **Belum dapat diuji** — butuh menunggu >24 jam sejak pesan terakhir …4062 | Simulasi: terbukti |
| M-09 | **Gambar** masuk dan keluar | Tersimpan privat, MIME disniff, izin media; keluar diterima | Tidak perlu | Tidak ada | **Belum dapat diuji** | Gunakan gambar sintetis |
| M-10 | **PDF** masuk dan keluar | Idem | Tidak perlu | Tidak ada | **Belum dapat diuji** | PDF sintetis |
| M-11 | **Echo**: pesan dikirim dari **WhatsApp Business App di ponsel** (…6319) ke …4062 | Dicatat sebagai pesan **keluar** sumber "WhatsApp Business App"; **bukan** pesan pelanggan; **tidak** membuka jendela | **YA — pemilik harus menyetujui** langkah: hanya jika …6319 sudah coexistence (lihat §0). **Jangan** mengaktifkan/ubah apa pun untuk memunculkannya | Mengirim pesan nyata dari aplikasi ponsel (tidak mengubah konfigurasi bila coexistence sudah aktif) | **Belum dapat diuji** — status coexistence …6319 tidak diketahui | Simulasi: terbukti. Nama field echo **belum diverifikasi** (T2-F02) |
| M-12 | **History / sinkronisasi riwayat** | Ditandai history; **tidak** memicu otomatisasi/belum dibaca; tidak memperbarui jendela | **YA — WAJIB persetujuan pemilik.** History hanya tersedia bila dipilih saat onboarding; memicunya berarti **re-onboarding** (berdampak ke akun) — **dilarang tanpa penjelasan dampak** | **Tinggi** bila memerlukan re-onboarding | **Belum dapat diuji — jangan dipicu** | Terbukti hanya simulasi; hanya diuji bila sinkronisasi sudah terjadi alami |
| M-13 | **Kirim gagal / hasil belum pasti nyata** | "Gagal" atau "Belum pasti" jujur; **1** panggilan; tanpa retry buta | Tidak perlu | Tidak ada | **Belum dapat diuji** — tidak dapat dipicu aman (simulasi: terbukti). Error `10` (butir 7) adalah contoh **gagal nyata**: dilaporkan, bukan hasil uji terencana | Jangan memutus jaringan produksi untuk menguji |
| M-14 | **Klik ganda kirim** (idempotensi) di UI nyata | 1 pesan, 1 panggilan Meta | Tidak perlu | Tidak ada | **Belum dapat diuji** di UI nyata (alat uji integrasi) | Simulasi + E2E: terbukti |
| M-15 | **Rate limit** nyata | Ditangani eksplisit | — | Berisiko memicu pembatasan akun | **Belum dapat diuji — jangan dipicu** | Batas Meta belum diverifikasi |
| M-16 | **Template** (di luar jendela) | — | — | — | **Di luar lingkup** Tahap 2 (fungsi dibuat, tidak terhubung UI; Tahap 6) | — |

## 2. Cara mencatat hasil
Untuk tiap baris yang dijalankan: tanggal/jam, commit (`git rev-parse HEAD` di server) + tag image, hasil, bukti disamarkan, dan **batas pembuktian** (apa yang tidak dibuktikan). Kesimpulan CCP:
- **CCP 2.8 (echo)** lulus **hanya** bila M-11 lulus nyata. **CCP 2.9 nyata (history)** hanya bila M-12 teramati. **CCP 2.10 (coexistence nyata)** tidak boleh dinyatakan lulus dari M-01…M-03 saja.
- Selama M-11/M-12 "belum dapat diuji", Tahap 2 tetap **"belum lulus penuh"** (sesuai CCP 2.10: "terbukti dengan nomor uji, **atau** tahap dinyatakan belum lulus penuh").
