# Tindak lanjut Gate 1 — tanggapan pembangun atas audit independen

> **Ditulis oleh PEMBANGUN, bukan auditor.** Dokumen ini tidak mengubah isi atau rekomendasi audit (`docs/gates/gate-1.md`: **TAHAN**) dan **bukan** keputusan gate.
> Keputusan rapat pemilik, tag `tahap-1-diterima`, dan backup titik-kembali **tidak diisi/dibuat** — hanya setelah pemilik memutuskan (AGENTS.md §2.3–2.4).
> Setiap status di bawah adalah klaim pembangun yang **harus diverifikasi ulang oleh auditor** pada commit perbaikan.

## Ringkasan
| ID | Prioritas (auditor) | Tanggapan | Status menurut pembangun |
|---|---|---|---|
| G1-A01 | Tinggi | **Diperbaiki di kode** + 19 test regresi nyata + uji mutasi (ADR-0005) | **Diperbaiki — menunggu verifikasi auditor & CI pada commit perbaikan** |
| G1-A02 | Tinggi | Disediakan `scripts/verify-all.sh` + panduan lingkungan terisolasi; pembangun menjalankannya (11/11 langkah lulus). **Ini bukan verifikasi independen** | **Sebagian — menunggu audit ulang di lingkungan auditor** |
| G1-A03 | Sedang | Bukti CI dicatat di §3: run #5 pada commit yang diaudit `7331493` (penjaga lama) dan run #6 pada commit perbaikan `95b9cc8` (penjaga baru) — keduanya hijau; CI kini dapat dipicu manual (`workflow_dispatch`) | **Diperbaiki untuk `95b9cc8` — auditor memverifikasi ulang pada commit akhir** |
| G1-A04 | Sedang | `gate-1.md` kini ada di repository; tag/backup/keputusan **tidak dibuat**; `jalur-0.md` **tidak dikarang** | **Menunggu pemilik** |
| G1-A05 | Sedang | Tidak dapat dikerjakan pembangun tanpa server staging; daftar bukti yang harus diisi sudah ada | **Menunggu pemilik/infrastruktur** |

## 1. G1-A01 — kegagalan suite tersamarkan di CI (Tinggi)
**Konfirmasi:** reproduksi auditor terkonfirmasi pada Vitest 5.1.1: test lulus + `afterAll` melempar error ⇒ Vitest exit **1**, JSON `success:false`, `numFailedTestSuites:2`, berkas `status:"failed"`, semua assertion `passed`;
pelapor lama hanya membaca assertion ⇒ "Tidak ada masalah", exit 0. **Belum terbukti** bahwa run CI historis mengandung kegagalan tersembunyi, tetapi juga **tidak dapat dibuktikan sebaliknya dari log**: log run #5 (commit yang diaudit `7331493`) hanya menampilkan keluaran pelapor lama ("227 test, 0 gagal, 0 dilewati … Tidak ada masalah"), yang memang tidak memeriksa tingkat suite. Artefak `laporan-test/vitest.json` run itu (retensi 30 hari) dapat diperiksa auditor untuk `success` dan `numFailedTestSuites`.

**Perbaikan** (rinci: `docs/adr/0005-penjaga-hasil-test-ci.md`):
- `scripts/run-test-report.mjs` (`npm run test:report`): exit code Vitest **diteruskan**; mencatat `.test-results/vitest-exit.json`; hasil lama dihapus sebelum run.
- `scripts/test-tag-report.mjs`: gagal untuk hasil hilang/rusak/usang/kosong, `success≠true`, suite/berkas gagal, galat runtime, exit code ≠ 0 atau tak terbukti, E2E berisi galat/`unexpected`/usang.
- `tests/unit/ci-guard.test.ts` — **19 test `@tahap-1`**: lapis A menjalankan **Vitest sungguhan** pada proyek fixture yang sengaja rusak (afterAll melempar error · assertion gagal · gagal impor · global teardown gagal · promise tak tertangani · tanpa test · hasil lama tertinggal);
  lapis B memberi pelapor hasil hilang · usang · rusak · kosong · berbentuk persis kegagalan audit · exit code 1 dengan JSON "sehat" · E2E bermasalah.
- **Uji mutasi:** dengan perilaku lama dipulihkan, **14 dari 19** test gagal (5 sisanya mengunci perilaku lama yang dipertahankan).
- Syarat auditor "jalankan seluruh CI ulang pada commit perbaikan": **terpenuhi untuk `95b9cc8`** (§3).

## 2. G1-A02 — bukti wajib pada lingkungan uji terisolasi (Tinggi)
**Yang dibuat:** `scripts/verify-all.sh` — satu perintah menjalankan lint, typecheck, guard, secret scan, gitleaks seluruh riwayat, `npm audit`, build, Vitest + penjaga, E2E, penjaga akhir `--require-e2e`, dan drill backup/restore pada **satu commit**;
mencatat commit, versi Node/PostgreSQL/gpg, **kode keluar, durasi, dan log per langkah** (`.verify/`, tidak di-commit). Langkah tanpa prasyarat dilaporkan **TIDAK DAPAT DIJALANKAN** (bukan lulus); skrip keluar 0 hanya bila semuanya lulus.
Prasyarat dan cara menyiapkan lingkungan setara CI: `docs/pengembangan.md` §7. `.nvmrc` = 22 (auditor memakai Node 24.22.3; CI Node 22).

**Hasil eksekusi pembangun (bukan independen)** — Node 22.23.5, PostgreSQL 16.15, Chromium, gitleaks 8.24.3 ber-pin checksum; pada commit induk `7331493` + perubahan perbaikan:
lint ✔ · typecheck ✔ · guard operasional ✔ · secret scan lokal ✔ · gitleaks seluruh riwayat ✔ · `npm audit --omit=dev` ✔ · build ✔ · Vitest (`test:report`) ✔ **246 test, 0 gagal, 0 dilewati** (`@tahap-1` 143 · `@tahap-2` 103), exit code Vitest 0 tercatat · E2E ✔ **6 lulus + 7 placeholder** · penjaga akhir ✔ · drill backup/restore ✔ — **11/11 langkah LULUS**.
(Eksekusi pertama skrip ini menemukan dua kesalahan nyata pada perubahan perbaikan itu sendiri — galat tipe pada test baru dan fixture lama `guards.test.ts` yang kini ditolak penjaga — keduanya diperbaiki sebelum commit; ini bukti skrip bekerja menangkap masalah.)

**Belum terpenuhi:** tidak ada pemeriksaan di lingkungan auditor/staging. Hambatan auditor (PostgreSQL tidak ada, `psql` tidak ada, `tsx` gagal membuat IPC socket `EPERM`) adalah **keterbatasan lingkungan**; saran: sediakan PostgreSQL 16 (`docker run -d -e POSTGRES_PASSWORD=… -p 5432:5432 postgres:16`), klien `postgresql-client-16`, dan pastikan `TMPDIR` dapat ditulis (dugaan penyebab `EPERM` pada `tsx`; **belum diverifikasi**).

## 3. G1-A03 — CI pada commit yang diaudit (Sedang)
**Untuk commit yang diaudit (`7331493`)** — diverifikasi pembangun dari API dan log GitHub (bukan hanya dari klaim laporan): ada run **push** [#5 `44443496003`](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44443496003)
(event `push`, branch `claude/lucid-carson-blf4x0`, `head_sha` = `7331493bda44…`) dengan **3 job sukses**: Lint·Typecheck·Guard·Secret scan; Build·Test regresi·E2E; Drill backup & restore. Log job Build·Test·E2E:
`| @tahap-1 | 124 | 0 | 124 | 124 / 3 |`, `| @tahap-2 | 103 | 0 | 103 | 103 / 3 |`, `Vitest: 227 test, 0 gagal, 0 dilewati`; E2E `6 passed`, `7 skipped` (placeholder resmi); ringkasan akhir `@tahap-1 | 124 | 3 | 127`, `@tahap-2 | 103 | 3 | 106`, "Tidak ada masalah".
**Batas pernyataan ini:** itu CI dengan penjaga **lama** (G1-A01 berlaku), jadi tidak membuktikan ketiadaan kegagalan tingkat suite. Alasan auditor tidak melihat run: workflow memicu pada *push* ke `claude/**`; tidak ada PR (alat yang hanya menampilkan run PR tidak melihatnya).

Untuk commit **perbaikan** (penjaga baru): hasil run dicatat di bawah **setelah push**. Workflow kini dapat dijalankan manual (`workflow_dispatch`) dan menulis ringkasan test ke ringkasan run.

**Hasil run pada commit perbaikan `95b9cc8`** — run push [#6 `44823965100`](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44823965100): **3 job sukses** (Lint·Typecheck·Guard·Secret scan termasuk gitleaks seluruh riwayat; Build·Test regresi·E2E; Drill backup & restore), dibaca dari API dan log job Build·Test·E2E (`136591691040`):
- langkah `npm run test:report` menjalankan `node scripts/run-test-report.mjs` (penjaga baru): `| @tahap-1 | 143 | 0 | 143 | 143 / 3 |`, `| @tahap-2 | 103 | 0 | 103 | 103 / 3 |`, `Vitest: 246 test, 0 gagal, 0 dilewati`, "Tidak ada masalah";
- Golden E2E: `6 passed`, `7 skipped` (placeholder resmi);
- penjaga akhir `--require-e2e` (menulis ke ringkasan run): `@tahap-1 | 143 | 3 | 146 | 143 / 3`, `@tahap-2 | 103 | 3 | 106 | 103 / 3`, "Tidak ada masalah".
**Batas pernyataan:** ini bukti dari run pembangun/CI; ia **tidak** menggantikan verifikasi ulang oleh auditor independen pada commit yang akan diputuskan. Karena dokumen ini sendiri di-commit sesudahnya, commit yang memuatnya adalah commit baru — auditor sebaiknya memicu `workflow_dispatch` pada commit akhir yang dinilai.

## 4. G1-A04 — tata kelola gate dan titik-kembali (Sedang)
- `docs/gates/gate-1.md` **dimasukkan apa adanya** (tanpa suntingan) dan diindeks di `docs/README.md`.
- **Tidak** dibuat: tag `tahap-1-diterima`, backup titik-kembali, isian "Keputusan rapat pemilik". **Tidak dikarang:** `docs/jalur-0.md` (pemilik perlu menyediakannya — T1-F04).
- Tahap 2 dikerjakan atas instruksi eksplisit pemilik sebelum gate diputuskan; laporan Tahap 2 mencatatnya (T2-F03). Rekomendasi **TAHAN** berarti Tahap 2 tidak dapat diterima sebelum Gate 1 diputuskan.

## 5. G1-A05 — bukti operasi staging dan backup di server (Sedang)
Tidak dapat dikerjakan pembangun: tidak ada server staging (J0-03), tidak ada akses Docker registry. Yang sudah siap: `docs/staging.md` §6 (daftar verifikasi di server), `docs/backup-restore.md` (prosedur & drill lokal), compose/Caddy/Dockerfile (belum diuji).
Yang perlu dari pemilik: server staging, keputusan **D-12** (RPO/RTO) dan **D-18** (retensi), lokasi salinan backup terpisah; lalu isi daftar verifikasi dengan data sintetis dan catat waktu serta lokasi.

## 6. Syarat audit ulang (dari auditor) — status pembangun
| # | Syarat | Status |
|---|---|---|
| 1 | Perbaiki G1-A01 + test untuk kegagalan suite/assertion/hasil tak valid | **Dikerjakan** (§1) |
| 2 | Lingkungan uji terisolasi setara CI; jalankan semua langkah pada commit yang sama; catat jumlah, exit code, log, link run | **Sebagian** — skrip & panduan dibuat, pembangun menjalankannya; **auditor harus menjalankan ulang** (§2) |
| 3 | G1 di staging/HTTPS atau catat tertunda + batas penggunaan | **Tertunda** (staging belum ada; **belum boleh dipakai untuk data operasional/pelanggan**) |
| 4 | Dokumentasikan keputusan pemilik, asumsi D-xx, prasyarat, PIC; tag & backup hanya setelah penerimaan | **Menunggu pemilik** (§4) |
