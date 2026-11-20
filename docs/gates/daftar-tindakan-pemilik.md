# Daftar tindakan pemilik — Tahap 1 & Tahap 2

> Disusun pembangun dari audit Gate 1 (awal + ulang), audit Gate 2, `decisions.md`, dan `jalur-0.md`. Isinya hanya hal yang **tidak bisa dikerjakan pembangun** (keputusan, akun, server, tanda tangan gate).
> Urutan = **yang paling banyak membuka blokir dulu**. Status per 21 Nov 2026. Bukan keputusan gate; tidak mengubah rekomendasi auditor (**TAHAN** untuk Gate 1 dan Gate 2).

## Posisi sekarang (ringkas)
- **Kode & simulasi:** Tahap 1 dan 2 selesai dan teruji di mock/lokal/CI (281 test, E2E simulasi). Semua temuan audit yang bisa diselesaikan dengan kode **sudah diperbaiki** dan menunggu verifikasi ulang auditor.
- **Yang menghalangi "lulus":** (1) **uji nyata Meta/coexistence belum ada** → Tahap 2 tidak bisa lulus penuh; (2) **staging + backup di server belum ada** → Gate 1 tidak bisa diterima penuh; (3) **keputusan bisnis masih Terbuka**; (4) **audit ulang** di lingkungan lengkap belum selesai.
- **Semua ini ada di tangan Anda / infrastruktur** — bukan di kode.

---

## A. Blokir terbesar — kerjakan dulu (membuka uji nyata Tahap 2 dan Gate 1)

| # | Tindakan | Membuka apa | Bukti yang harus ada | Target |
|---|---|---|---|---|
| A1 | **Putuskan D-02** (jalur akses Meta): ajukan Tech Provider sendiri, atau pakai BSP resmi untuk uji. Catat di `decisions.md` (Keputusan akhir + Oleh/tanggal) | Seluruh uji nyata Tahap 2 | Baris D-02 terisi | ±1 Des 2026 (cadangan BSP bila belum disetujui per 15 Des) |
| A2 | **Putuskan D-03**: nomor uji = Kemitraan (usulan), **belum dipublikasikan**; siapkan 2–3 nomor peserta uji milik tim sendiri | Uji kirim/terima, echo, history | Baris D-03 terisi + daftar penerima uji | ±1 Des 2026 |
| A3 | **Siapkan akses Meta milik TE One** (bukan Halo AI): Meta Business, aplikasi Meta baru, WABA uji, **token system user**, App Secret, App ID, dan karang sendiri Verify Token. Simpan rahasia di secret store server (jangan di repo/chat) | `npm run meta:check` nyata, webhook, uji coexistence | `meta:check` bersih bertanda **META ASLI**; tangkapan layar disamarkan | setelah A1 |
| A4 | **Cek kelayakan coexistence nomor uji**: versi WhatsApp Business App di HP, negara/nomor didukung, status Meta Business | Menghindari buang waktu uji | Catatan hasil cek | setelah A2 |
| A5 | **Siapkan server staging** terpisah dari HRIS/keuangan: subdomain + HTTPS, firewall (80/443; 22 hanya IP admin), PostgreSQL tidak terbuka, pita STAGING, rahasia & DB terpisah. Isi `/etc/teone/staging.env` (`docs/tahap-2/konfigurasi-staging.md`) | Webhook Meta (butuh URL publik), G1 di staging, bukti backup di server | Daftar verifikasi `docs/staging.md` §6 terisi | _tetapkan tanggal_ |
| A6 | **Backup & restore di server**: terenkripsi, kunci terpisah, salinan di lokasi/akun berbeda, **restore diuji** (DB **dan media**). Tunjuk **PIC pembuat** dan **PIC pemeriksa terpisah** | Menutup G1-A05; data nyata boleh dipakai | Waktu, ukuran, lokasi, checksum, hasil restore | sebelum data operasional |
| A7 | **Buka akses dokumentasi Meta** untuk pembangun: izinkan host `developers.facebook.com` di jaringan sesi, **atau** tempel isi halaman *onboarding coexistence* dan *Message History Events API* | Mengganti `docs/tahap-2/coexistence.md` dari "BELUM TERVERIFIKASI" menjadi terverifikasi; mengoreksi payload/kode galat | Dokumen terverifikasi + tanggal akses | sebelum uji nyata |

## B. Keputusan bisnis yang masih Terbuka (hanya Anda yang bisa)

| # | Keputusan | Kenapa sekarang | Usulan default (bisa diterima/diubah) |
|---|---|---|---|
| B1 | **D-04** cakupan go-live & jadwal | Dibutuhkan untuk Gate 1 (±2 Des) | lihat rincian di `decisions.md` |
| B2 | **D-12** target RPO/RTO | Menentukan desain backup (harian saja ≠ RPO 1 jam) | RPO ≤ 1 jam, RTO ≤ 4 jam kerja — **nilai biayanya dulu** |
| B3 | **D-18** retensi data & UU PDP (dengan **penasihat hukum**) | Data pelanggan mulai tersimpan di Tahap 2; angka sekarang cuma usulan | payload mentah ≤ 30 hari, log ≤ 90 hari, chat/media 2 tahun, permintaan ≤ 14 hari kerja |
| B4 | **D-19** server production & lokasi data | Dibutuhkan sebelum Tahap 8 | VPS tersendiri; catat lokasi |
| B5 | **D-01** grup WhatsApp lama | Dibutuhkan sebelum Tahap 3 (±22 Des) | Opsi A (grup tetap di app; tidak terlihat di TE One) |
| B6 | **D-05** pesan dari HP mematikan AI? | Tahap 3 (echo sudah tercatat di Tahap 2) | Ya, AI Off pada chat terkait |
| B7 | **Asumsi teknis Tahap 2** yang butuh persetujuan: ambang kelayakan otomatisasi **10 menit** (T2-F16) dan aturan "event langsung bercap waktu terbukti ≤ 24 jam membuka jendela" (ADR-0006) | Mengikat perilaku AI Tahap 3–4 | terima, atau tetapkan angka lain |
| B8 | **Tinjau & setujui/tolak ADR-0004, 0005, 0006** serta perubahan transparan pada test Tahap 1 (`permission-engine`, `architecture`, fixture `guards`) | Auditor meminta penilaian pemilik | — |

## C. Gate & audit (proses)

| # | Tindakan | Catatan |
|---|---|---|
| C1 | **Lengkapi `docs/jalur-0.md`** (draf sudah ada): isi PIC, target, bukti. Status hanya berubah dengan bukti | Menjawab G1-A04; jujur: "belum tersedia/belum diputuskan" bila memang begitu |
| C2 | **Siapkan lingkungan audit** setara CI: Node 22, PostgreSQL 16, klien PostgreSQL (`psql`, `pg_dump`, `pg_restore`), `gpg`, Chromium yang boleh membuat socket, gitleaks (`bash scripts/install-gitleaks.sh`). Jalankan `bash scripts/verify-all.sh` — target: **tidak ada langkah "TIDAK DAPAT DIJALANKAN"** | Dua audit terakhir tertahan di sini (E2E & drill) |
| C3 | **Jalankan CI pada commit final** (tombol *Run workflow*) dan simpan tautan run + hash commit | Auditor mencatat CI pada commit yang diaudit belum terverifikasi |
| C4 | **Audit ulang Gate 2** (yang akan Anda jalankan) pada commit final — perbaikan A01–A06 menunggu verifikasi independen | Hasil hijau test **tidak** otomatis menutup temuan |
| C5 | **Isi formulir keputusan Gate 1 lalu Gate 2** (LANJUT / LANJUT TERBATAS / TAHAN) setelah membaca bukti. Jangan menyebut "diterima" sebelum LANJUT tercatat | Hanya Anda yang berwenang |
| C6 | **Setelah (dan hanya setelah) LANJUT Gate 1:** tentukan commit persis; putuskan pendekatan tag; buat backup titik-kembali terenkripsi yang sudah diuji restore | Lihat catatan tag di bawah |

**Catatan pendekatan tag (keputusan Anda):** kode HEAD sudah memuat Tahap 2, tetapi fitur Tahap 2 berada di balik flag `whatsapp_connector` yang **default mati**, sehingga perilaku efektif = Tahap 1 selama flag mati. Opsi: **(a)** beri tag pada commit yang diterima dan catat jelas bahwa kode Tahap 2 ikut tetapi **tidak** berarti Gate 2 diterima; **(b)** buat cabang baseline Tahap 1-murni bila butuh rollback murni (perlu kerja tambahan). Tetapkan sebelum membuat tag. Pembangun **tidak** membuat tag sendiri.

## D. Uji nyata Tahap 2 (setelah A1–A5, A7)
1. Jalankan `docs/tahap-2/panduan-uji-nomor-uji.md`: **uji Cloud API** (B1–B12) lalu **uji coexistence** (C1–C4 di panduan). Kumpulkan bukti **disamarkan**.
2. Isi `docs/tahap-2/coexistence.md` dari dokumentasi Meta resmi + hasil uji; implikasi per nomor (Kemitraan, Admisi, Hotline).
3. Ganti placeholder Golden E2E **G2 (NYATA)** hanya bila B2–B4 dan C1 benar-benar lulus.
4. Sesudah itu baru audit Gate 2 dapat menilai CCP **2.8 (echo nyata)** dan **2.10 (coexistence nyata)**.

## E. Larangan (tetap berlaku sampai Tahap 9 dan GO tertulis)
- **Jangan** menghubungkan, memutus, memindahkan, atau mengubah nomor **Admisi (…1119)** dan **Hotline (…0124)**; **jangan** mengubah koneksi/webhook/aplikasi Meta **Halo AI**.
- **Jangan** memakai WAHA/Baileys/whatsapp-web.js atau konektor tidak resmi (kecuali keputusan D-01 Opsi B eksplisit + isolasi).
- **Jangan** menaruh token/secret/kunci/OTP di repository, chat, issue, atau screenshot; **jangan** memakai data pelanggan asli untuk uji.
- **Jangan** mempublikasikan nomor Kemitraan sebelum GO.
- **Jangan** merge ke `main`, membuat tag `tahap-N-diterima`, atau menyebut gate diterima sebelum keputusan tertulis Anda.

## Ringkasan urutan kerja yang disarankan
1. **Minggu ini:** A1, A2 (keputusan) → A3, A4 (akses Meta + cek nomor) → A7 (akses dokumentasi) → C1 (jalur-0).
2. **Paralel:** A5, A6 (server + backup) dan C2 (lingkungan audit).
3. **Setelah akses & server siap:** D (uji nyata) → C3, C4 (CI commit final + audit ulang Gate 2).
4. **Setelah bukti cukup:** B1–B8 → C5 (formulir keputusan) → C6 (tag + backup titik-kembali).
