# Daftar tindakan pemilik — Tahap 1, 2 & 3

> Disusun pembangun dari audit Gate 1 (awal + ulang), audit Gate 2, `decisions.md`, dan `jalur-0.md`. Isinya hanya hal yang **tidak bisa dikerjakan pembangun** (keputusan, akun, server, tanda tangan gate).
> Urutan = **yang paling banyak membuka blokir dulu**. Status per 21 Nov 2026. Bukan keputusan gate; tidak mengubah rekomendasi auditor (**TAHAN** untuk Gate 1 dan Gate 2).

## Posisi sekarang (ringkas)
- **Kode & simulasi:** Tahap 1 dan 2 selesai dan teruji di mock/lokal/CI (281 test, E2E simulasi). Semua temuan audit yang bisa diselesaikan dengan kode **sudah diperbaiki** dan menunggu verifikasi ulang auditor.
- **Yang menghalangi "lulus":** (1) **uji nyata Meta/coexistence belum ada** → Tahap 2 tidak bisa lulus penuh; (2) **staging + backup di server belum ada** → Gate 1 tidak bisa diterima penuh; (3) **keputusan bisnis masih Terbuka**; (4) **audit ulang** di lingkungan lengkap belum selesai.
- **Tahap 3 (inbox, routing, pengambilalihan, kill switch)** sudah dibuat dan diuji **secara simulasi** (mock Meta + job AI simulasi); **belum lulus untuk integrasi langsung**. Tindakan Anda ada di bagian **F**.
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
| A6 | **Backup & restore di server**: terenkripsi, kunci terpisah, salinan di lokasi/akun berbeda, **restore diuji** (DB **dan media**). Tunjuk **PIC pembuat** dan **PIC pemeriksa terpisah**. *(Skrip `backup.sh`/`restore.sh` kini sudah mencakup media dan mode aman pasca-restore — yang tersisa adalah server, jadwal, lokasi salinan, dan PIC.)* | Menutup G1-A05; data nyata boleh dipakai | Waktu, ukuran, lokasi, checksum, hasil restore | sebelum data operasional |
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
| C2 | **Siapkan lingkungan audit** setara CI: Node 22, PostgreSQL 16, klien PostgreSQL (`psql`, `pg_dump`, `pg_restore`), `gpg`, Chromium yang boleh membuat socket, gitleaks (`bash scripts/install-gitleaks.sh`). Jalankan `bash scripts/verify-all.sh` — target: **tidak ada langkah "TIDAK DAPAT DIJALANKAN"** (Chromium yang tak dapat dibuka kini ditandai **TIDAK DAPAT DIJALANKAN** dengan alasannya, bukan gagal samar; `psql`/`pg_dump`/`pg_restore` juga wajib ada) | Dua audit terakhir tertahan di sini (E2E & drill) |
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

## F. Tahap 3 — Inbox tim, routing, pengambilalihan, kill switch (tindakan Anda)

| # | Tindakan | Kenapa | Catatan |
|---|---|---|---|
| F1 | **Putuskan D-16** (belum dibaca per pengguna **atau** bersama) dan **D-22** (lead nyasar dialihkan di percakapan yang sama); **konfirmasi D-05** (pesan dari HP mematikan AI) | Dipakai sebagai **ASUMSI** di Tahap 3; mengubahnya mudah bila diputuskan lain (lokasi perubahan ada di ADR-0007/0008) | Isi kolom Keputusan akhir + Oleh/tanggal di `decisions.md` — pembangun tidak mengisinya |
| F2 | **Tinjau ADR-0007, 0008, 0009** dan tiga penyesuaian **sempit** pada penjaga statis lama (`architecture.test.ts`, `tahap2-units.test.ts`: `inbox` kini sah; larangan Tahap 4–9 tetap; jaminan "hook hanya dari cabang `message`" dipindah ke outbox) | Aturan: test tidak boleh dilemahkan tanpa ADR — butuh penilaian Anda/auditor | `adr/0007-…` §5 |
| F3 | **Putuskan penanganan pesan pelanggan yang tiba > 10 menit setelah waktunya** (T3-F04): ditandai "perlu ditinjau"? dieskalasi? | Saat ini hanya tersimpan + belum dibaca; tidak diproses otomatisasi | Mengikat perilaku AI Tahap 4 |
| F4 | **Coba inbox di lingkungan uji**: Super Admin menyalakan flag `inbox` (dan `ai_simulation` **hanya** untuk uji), beri peran berizin, ikuti `docs/tahap-3/panduan-inbox.md` | Menilai kegunaan nyata sebelum Gate 3 | `ai_simulation` **tidak pernah** menyala di production (ditegakkan server); matikan di staging yang memuat kontak nyata |
| F5 | **Uji nyata Tahap 3 dengan nomor uji** (setelah A1–A5, A7): balas dari inbox lewat nomor uji, status provider nyata, echo dari HP (D-05), kill switch pada pengiriman nyata | Tanpa ini Tahap 3 tetap **belum lulus untuk integrasi langsung**; G3/G8 versi NYATA masih placeholder | Bukti disamarkan; ganti placeholder hanya bila benar-benar lulus |
| F6 | **Audit independen Gate 3** di sesi terpisah (prompt auditor: `GATE-CHECKLIST.md` bagian G) — setelah keputusan Gate 2 | Pembangun tidak mengaudit pekerjaannya sendiri | Jangan mengisi formulir keputusan sebelum membaca bukti |

## G. Tindak lanjut 25 Nov 2026 — yang diminta dari pemilik/operator staging
| # | Tindakan | Kenapa | Catatan |
|---|---|---|---|
| G1 | **[Sebagian dijawab 25 Nov — [OP], bukti belum terlampir]** Hasil rekonsiliasi dilaporkan (checkout `9c297d3`, dua edit lokal, `Caddyfile.sebelum-debug` identik, image `417b30f8…` tanpa label) → lihat `gates/tindak-lanjut-gate-1-2-2026-11-25.md` §1.2a. **Masih diminta:** lampirkan keluaran disamarkan. Semula: **Tempel (disamarkan) hasil perintah rekonsiliasi** di `gates/tindak-lanjut-gate-1-2-2026-11-25.md` §1.2: `git diff` `.dockerignore`/`deploy/Caddyfile`, `diff Caddyfile.sebelum-debug`, `docker image inspect`, `git rev-parse HEAD` | Pembangun **tidak punya akses server**; tanpa ini perubahan lokal tidak bisa dinilai | **Jangan** `git reset`, hapus perubahan, atau ganti image/DB sebelum titik pemulihan diamankan |
| G2 | **[Pernyataan tertulis pemilik diterima 25 Nov — `tahap-2/pernyataan-pemilik-uji-staging-2026-11-25.md`; **26 Nov: pemilik memutuskan TIDAK melampirkan tangkapan layar** — dihormati; jalur tanpa gambar J1–J4 di dokumen itu §6; label "Terbukti nyata" **tidak** dipasang; klarifikasi Q1–Q6 **DIJAWAB 26 Nov** (`pernyataan §7`); Q1 = container `deploy-app-1`, bukan aplikasi Meta; **sisa:** identitas pengirim nomor salah (Q2), jam recreate, pelanggan nyata selama gangguan (Q3)]** **Lampirkan bukti uji 25 Nov (disamarkan)** di `docs/reports/bukti/` sesuai daftar `tahap-2/bukti-uji-staging-2026-11-25.md` §5 | Mengubah status dari **KLAIM** menjadi **TERBUKTI** | Tanpa token/App Secret/Verify Token; nomor 4 digit akhir |
| G3 | **[Dilaporkan 25 Nov: keduanya MATI — [OP]; tangkapan layar belum terlampir]** Pastikan flag `inbox` dan `ai_simulation` MATI di staging | Staging memakai Meta asli; kode Tahap 3 (simulasi) ikut ter-deploy | Server kini menolak `ai_simulation` terhadap Meta asli, tetapi `inbox` tetap perlu dimatikan |
| G4 | **Bangun ulang image dari commit bersih** dengan `scripts/build-staging-image.sh`; pindahkan domain ke `deploy/.env` (`SITE_ADDRESS`) | Mengaitkan image ↔ commit; menghilangkan edit lokal | Catat blok PROVENANCE; database **tidak** dibuat ulang |
| G5 | **[Sebagian dijawab 25 Nov — [OP]]** Coexistence aktif, app 2.26.45.80, Indonesia, history dipilih, field `messages` aktif saja. **Masih kurang:** **jam onboarding** …6319 (kunci jendela sinkronisasi), status `smb_app_state_sync`, hasil `is_on_biz_app`/`platform_type`, jumlah/isi chat di ponsel (ada pelanggan nyata atau tidak). Semula: **Catat kondisi akun/nomor uji** (matriks coexistence §0): apakah …6319 coexistence, versi aplikasi, pilihan history saat onboarding, field webhook yang disubscribe | Dibutuhkan untuk menilai CCP 2.8/2.10 | Pembangun tidak mengetahuinya |
| G6 | **Setujui/tolak tertulis langkah berdampak akun** (M-11 echo, M-12 history/re-onboarding) | Instruksi: tidak boleh dilakukan tanpa penjelasan dampak ke pemilik | **Prosedur + dampak + penghentian + pemulihan sudah disusun:** `tahap-2/prosedur-uji-m11-m12.md`; formulir keputusan **A-1, A-1b, A-2, A-2b, A-3** (§10) **dibiarkan kosong** — hanya pemilik yang mengisi |
| G7 | Putuskan **D-12/D-18**, tetapkan **PIC pembuat & pemeriksa backup**, lokasi salinan terpisah | Tidak boleh diklaim tercapai tanpa keputusan + uji | Skrip backup/restore (DB + media + mode aman) sudah siap |
| G8 | **[Sebagian dikerjakan pembangun 26 Nov]** Dokumentasi resmi Meta **dibaca**: V-1…V-4, V-7, V-8 terjawab (`tahap-2/verifikasi-dokumentasi-meta-2026-11-26.md`). **Sisa:** V-5, V-6, V-9, dan konfirmasi operator bahwa halaman resmi **saat ini** sama (runbook P4) | Tanpa V-5, "dapat dibalik" belum terverifikasi resmi | Catat URL + tanggal baca |
| G9 | Putuskan **lingkup R-1/R-2/R-3** (perekam bentuk payload tanpa nilai; `name:` proyek compose dengan volume yang ada; koreksi pesan `meta:check`) | R-1 menentukan apakah uji echo pertama yang meleset tetap menghasilkan data perbaikan; R-2 menutup jebakan volume kosong | Idealnya masuk **sebelum** rebuild A-1 |
| G10 | **[DIJAWAB 26 Nov [OP]: proyek `deploy`; volume `deploy_pg_data`/`deploy_media_data`/`deploy_caddy_data`]** **Dapatkan nama proyek compose dan nama volume** (`docker compose ls`; `docker volume ls`) | Rebuild **wajib** `-p <nama-proyek>`; salah proyek = database kosong baru | Baca-saja; prosedur §4 langkah 0.4 |
| G11 | **Putuskan isolasi …6319 (formulir A-2c: I-1 tidak menguji / I-2 nomor uji bersih / I-3 pembekuan ponsel)** — STOP (a) terpicu karena ponsel berisi chat pelanggan nyata | Tanpa keputusan ini M-11 tidak boleh dijalankan; M-12 pada …6319 dilarang. **Jangan men-subscribe field apa pun** sampai keputusan tertulis | `tahap-2/prosedur-uji-m11-m12.md` §2.4 |
| G12 | **Catat aliran pelanggan nyata → staging** (sejak ±16.00 WIB 25 Nov) (hitungan karantina `pengirim_di_luar_daftar_uji`, tingkat log Caddy; prosedur 0.12–0.13); tentukan apakah …6319 tetap tersambung ke staging atau dipindah ke lingkungan lain sampai nomor uji bersih tersedia | Pesan pelanggan nyata ke …6319 **dikirim Meta ke webhook staging** selama `messages` aktif (apakah sudah ada yang masuk: periksa kueri 0.12); rancangan mengarantina dan membuang payload. Pilihan memutus langganan webhook …6319 **berdampak ke akun** → keputusan tertulis pemilik | D-18 retensi/PDP belum diputuskan |
| G13 | **Jalankan kueri baca-saja §5** di `tahap-2/pemeliharaan-inline-vs-worker.md` (event masuk termasuk **alasan karantina kedua**, pesan keluar per status, media, outbox/job) dan cek apakah image `teone-tools` ada; lalu **putuskan A-4** (jalankan worker atau tidak) | S-10: pemeliharaan (retensi payload, rekonsiliasi, ulang media) tidak berjalan tanpa worker. **Jangan** menyalakan worker, menghapus payload, atau mengganti image sebelum ditinjau | Hanya angka/kode, tanpa isi pesan. S-08 (worker bertoken lama) **dicabut** |
| G14 | **Pastikan identitas pengirim "nomor salah" (18.38.44 WIB)** dari sisi pengirim, dan **hitung** (angka saja) pesan masuk non-penguji pada 18.41–20.35 WIB | Q2/Q3: TE One tidak menyimpan nomor yang dikarantina; isi chat **tidak** dibagikan | Jangan diisi dengan asumsi; hasil boleh berupa angka dan "tim/non-tim" |
| G15 | **Cari catatan waktu onboarding …6319 di sisi Meta** (V-9) dan verifikasi ketentuan jendela sinkronisasi ke dokumentasi resmi (V-2) | Perkiraan ingatan tidak boleh jadi dasar M-12 | M-12 pada …6319 tetap terhalang STOP (a) |
| G16 | **Penuhi prasyarat P1–P9 runbook M-11 sebelum uji** (`tahap-2/runbook-uji-m11.md` §1): flag/mode uji/penerima, worker+antrean, **backup terenkripsi + salinan terpisah + uji restore terisolasi**, konfirmasi dokumentasi, baseline teks, satu operator ponsel, tanpa perubahan image/konfigurasi | Izin M-11 ditulis pemilik 26 Nov; **uji tidak boleh dimulai** bila ada prasyarat bukan "YA" | Pembangun tidak punya akses; kolom runbook kosong sampai operator mengisi |
| G17 | Putuskan **lingkup perbaikan** dari verifikasi dokumentasi: **S-11** (`to_user_id`), **S-12** (pemicu sinkronisasi kontak/history; nomor uji bersih dalam jendela 24 jam) | S-12 menentukan apakah CCP 2.9 nyata mungkin diamati | Usulan; belum dikerjakan |

## Ringkasan urutan kerja yang disarankan
1. **Minggu ini:** A1, A2 (keputusan) → A3, A4 (akses Meta + cek nomor) → A7 (akses dokumentasi) → C1 (jalur-0).
2. **Paralel:** A5, A6 (server + backup) dan C2 (lingkungan audit).
3. **Setelah akses & server siap:** D (uji nyata) → C3, C4 (CI commit final + audit ulang Gate 2).
4. **Setelah bukti cukup:** B1–B8 → C5 (formulir keputusan) → C6 (tag + backup titik-kembali).
5. **Tahap 3:** F1–F3 (keputusan/tinjauan) → F4 (coba di lingkungan uji) → F5 (uji nyata, bersama bagian D) → F6 (audit Gate 3).
