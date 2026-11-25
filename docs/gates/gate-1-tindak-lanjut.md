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

---

## Tanggapan atas AUDIT ULANG Gate 1 (21 Nov 2026) — [`gate-1-audit-ulang.md`](gate-1-audit-ulang.md)
Rekomendasi auditor: **TAHAN untuk penerimaan penuh**. Bukti meningkat: 246 test lulus pada Node 22 + PostgreSQL 16 (dijalankan **independen**), perbaikan G1-A01 terverifikasi. Keputusan pemilik **tetap kosong**; tidak ada tag/backup titik-kembali.

| ID | Hasil audit ulang | Tanggapan pembangun | Status |
|---|---|---|---|
| G1-A01 | **Terverifikasi** untuk kasus yang diaudit | Tidak ada tindakan kode. Dicatat: penjaga tidak membuktikan semua kemungkinan kegagalan tertutup. **Catatan:** pada run CI #9 penjaga baru ini **benar-benar menangkap** sebuah test yang gagal (lihat "Temuan baru dari penjaga" di bawah) — bukti penjaga bekerja di CI nyata | Terverifikasi auditor |
| G1-A02 | **Sebagian**: test integrasi/migrasi independen; E2E browser & drill belum (Chromium `socket() EPERM`; `psql`/`pg_dump`/`pg_restore` tidak ada) | **Temuan portabilitas diperbaiki:** `tahap2-migration-retention.test.ts` memakai `localhost:5432` tetap → kini memakai `TEST_DB_HOST` yang **diturunkan dari `TEST_ADMIN_DATABASE_URL`** (satu variabel cukup untuk port nonstandar); test statis baru menjaga tidak ada port tetap di `tests/`/`scripts/`; `verify-all.sh` memeriksa keterjangkauan DB dari variabel yang sama. **Dibuktikan:** seluruh suite (281 test) lulus terhadap klaster PostgreSQL 16 di **port 55432** hanya dengan `TEST_ADMIN_DATABASE_URL`; mutan "port tetap" → test migrasi gagal persis seperti di lingkungan auditor. Ditambah `scripts/install-gitleaks.sh` (versi + checksum sama dengan CI, dijaga test) agar gitleaks riwayat dapat dijalankan auditor. **Tidak dapat diperbaiki dari kode:** pembatasan Chromium/biner PostgreSQL di lingkungan auditor | **Sebagian** — E2E & drill menunggu lingkungan lengkap (pemilik/auditor) |
| G1-A03 | CI pada commit tepat yang diaudit belum diverifikasi | Ada run push **#7** [`44824391832`](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44824391832) pada `e7b9c4e` — **sukses** (dibaca dari API GitHub; belum dibaca log per langkah). CI pada commit perbaikan terbaru: lihat di bawah. Workflow dapat dijalankan manual (`workflow_dispatch`) | Diverifikasi pembangun untuk `e7b9c4e`; auditor menjalankan ulang pada commit final |
| G1-A04 | `gate-1.md` ada; keputusan/tag/backup belum; `jalur-0.md` belum | **`docs/jalur-0.md` kini ada sebagai DRAF jujur** (semua butir "Belum tersedia/Belum diputuskan/Belum terverifikasi"; PIC/target/bukti kosong; tidak ada yang dikarang) + [`daftar-tindakan-pemilik.md`](daftar-tindakan-pemilik.md). Tag/backup/keputusan **tidak** dibuat — hanya pemilik. Rekomendasi tag (catat bahwa HEAD memuat Tahap 2 di balik flag default mati; pertimbangkan baseline terpisah) dimasukkan sebagai keputusan pemilik | Draf siap; **menunggu pemilik** |
| G1-A05 | Staging/HTTPS/backup server belum; RPO/RTO & retensi masih usulan | Tidak dapat dikerjakan pembangun. Rekomendasi auditor (server terpisah, backup terenkripsi + kunci terpisah + salinan beda lokasi + uji restore DB **dan media**, PIC terpisah, backup harian ≠ RPO 1 jam, D-18 tetap usulan) dimasukkan ke `jalur-0.md` dan `daftar-tindakan-pemilik.md` | **Menunggu pemilik/infrastruktur** |

### Temuan baru dari penjaga: satu test Gate 2 gagal sekali di CI (belum diketahui akar masalahnya)
- **Fakta:** run CI #9 (commit `5d6c184`, hanya mengubah dokumen) **gagal** pada langkah *Test regresi*: `1 gagal` — `@tahap-2 G2-A03 history↔langsung … history → langsung LAMA (3 hari)`. Penjaga baru (ADR-0005) **menggagalkan job dengan benar** (tidak tersamar). Run #8 (`e2ea136`, kode identik) **lulus**, dan **re-run kegagalan pada commit yang sama (attempt 2) lulus**. Run itu juga berlangsung lebih cepat (38 dtk vs ±54 dtk).
- **Yang TIDAK diketahui:** asersi persis yang gagal. Log CI hanya memuat nama test (pelapor lama tidak mencetak alasan) dan artefak `laporan-test` tidak dapat diunduh dari sesi pembangun (host penyimpanan artefak diblokir proxy; tidak disiasati). Dalam stres lokal (14× subset A03, 6× berkas penuh dengan beban CPU, 1× seluruh suite dengan 2 inti + beban) **tidak ada reproduksi**. Hipotesis "klaim antrean terlewat karena beda jam aplikasi/DB" diuji (1500 penyimpanan→klaim berurutan: 0 terlewat) dan **tidak terbukti**.
- **Tindakan (mitigasi + diagnosis, BUKAN klaim akar masalah teratasi):** (1) pelapor kini mencetak **alasan** kegagalan assertion (baris pertama pesan, tanpa ANSI; diuji) sehingga kegagalan berikutnya dapat didiagnosis dari log; (2) helper test Gate 2: webhook sah **wajib 200** dan `drain()` **wajib mengosongkan antrean** (event tersisa/gagal → kegagalan yang jelas); (3) `claimBatch` memakai **jam database** (bukan campuran jam aplikasi/DB) bila tidak diberi waktu eksplisit.
- **Status:** **Terbuka — dipantau.** Bila kegagalan berulang, alasan akan terlihat di log CI. Dicatat sebagai **T2-F18** di laporan Tahap 2. Auditor sebaiknya menjalankan CI lebih dari sekali pada commit final.

### CI pada commit terbaru (`6c1511f`)
Run push [#10 `44836596599`](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44836596599): **3 job sukses** (Lint·Typecheck·Guard·Secret scan; Build·Test regresi·E2E; Drill backup & restore). Log job Build·Test·E2E (`136634419002`): `| @tahap-1 | 146 | 0 | 146 | 146 / 3 |`, `| @tahap-2 | 138 | 0 | 138 | 138 / 3 |`, `Vitest: 284 test, 0 gagal, 0 dilewati`, E2E `6 passed` + `7 skipped`, penjaga akhir "Tidak ada masalah".
Ini **bukan** bukti bahwa kegagalan sesekali (T2-F18) sudah hilang — satu hasil hijau tidak membuktikan ketiadaan flake. Pemantauan dilanjutkan; alasan kegagalan kini tercetak di log bila terulang. Dokumen ini di-commit sesudahnya (commit baru).

---

## Tindak lanjut lanjutan atas AUDIT ULANG Gate 1 (25 Nov 2026) — perbaikan kode yang tersisa

Dokumen audit ulang yang sama diserahkan kembali dengan instruksi menjalankan perbaikannya. **Sebagian besar sudah dikerjakan** pada tanggapan di atas (21 Nov: portabilitas port, `jalur-0.md`, daftar tindakan pemilik, gitleaks ber-pin). Pemeriksaan ulang terhadap isi audit menemukan **empat hal yang masih dapat diperbaiki lewat kode**; sisanya memang milik pemilik/infrastruktur. **Tidak satu pun dari ini menutup temuan** — verifikasi ulang oleh auditor tetap diperlukan; keputusan pemilik tetap kosong; tidak ada tag/backup titik-kembali/penerimaan gate.

| Butir audit | Yang ditemukan sekarang | Tindakan (kode) | Status |
|---|---|---|---|
| **G1-A02** — E2E tidak dapat dijalankan: auditor harus mengganti peluncur lokal `tsx` dengan `node --import tsx` secara manual (`tsx` CLI membuat IPC socket yang diblokir) | Repo masih memakai `npx tsx` di `playwright.config.ts` dan skrip drill; `tsx …` di `package.json` | Semua diganti **`node --import tsx`** (playwright config, mock Graph E2E, drill, 8 skrip `npm run`). Test statis `tahap1-pemulihan.test.ts` mencegah kembali ke `npx tsx` (mutasi: terdeteksi). Catatan `TMPDIR` yang bersifat dugaan di `pengembangan.md` digantikan penjelasan yang benar | Diperbaiki — **menunggu verifikasi auditor** |
| **G1-A02** — Chromium `socket() EPERM`: 5 test browser "gagal dimulai"; sulit dibedakan dari kegagalan aplikasi | `verify-all.sh` hanya memeriksa keberadaan biner, bukan apakah peramban dapat dibuka | `scripts/check-chromium.mjs` membuka peramban sungguhan; `verify-all.sh` menandai langkah E2E dan penjaga akhir E2E **TIDAK DAPAT DIJALANKAN** beserta alasan (bukan lulus, bukan gagal samar). Ini **tidak** menyelesaikan keterbatasan lingkungan auditor | Diperbaiki (klasifikasi); lingkungan = pemilik/auditor |
| **G1-A02** — port PostgreSQL nonstandar (`tahap2-migration-retention.test.ts:19`) | Sudah diperbaiki 21 Nov (`TEST_DB_HOST` diturunkan dari `TEST_ADMIN_DATABASE_URL`). Perlu dipastikan **tetap berlaku** setelah Tahap 3 menambah banyak tes/E2E/drill | `verify-all.sh` penuh dijalankan terhadap klaster di **port 55432** | **Hasil dicatat setelah run selesai** (commit berikutnya) — belum diklaim |
| **G1-A05** — "uji restore … termasuk konsistensi database **dan media**, tanpa mengirim pesan atau menjalankan worker otomatis" | `backup.sh` hanya mencadangkan database; media **tidak ikut** (juga T2-F11); aturan "jangan restore ke aplikasi yang dapat mengirim" hanya berupa kalimat di dokumentasi | **Media:** arsip terenkripsi + checksum, dibuat sebelum dump DB; restore ke direktori **terpisah & kosong** (tidak pernah menimpa); semua checksum diverifikasi **sebelum** menyentuh apa pun; bila ada arsip media wajib `RESTORE_MEDIA_DIR` atau `RESTORE_SKIP_MEDIA=1`. **Verifikasi:** `restore-verify media` (baris `media` ↔ berkas: ada, ukuran, SHA-256). **Mode aman bawaan:** setelah restore, kill switch **global** menyala + audit `restore.safe_mode`; kode `checkAutomation` yang asli terbukti memblokir. Drill diperluas (3 baris + 3 berkas media; pohon berkas identik; kontrol negatif: arsip media rusak, direktori tidak kosong, kebijakan media tak ditetapkan, berkas hilang, berkas berubah) | Bagian kode diperbaiki — **menunggu verifikasi auditor**. Server, HTTPS, jadwal, lokasi salinan, PIC pembuat + pemeriksa, D-12/D-18 tetap **milik pemilik/infra** |
| **G1-A03** — CI pada commit tepat yang diaudit | Commit audit `e7b9c4e`: run #7 sukses (sudah dicatat). HEAD sebelum perbaikan ini (`ab7d074`): run [#15 `44903522859`](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44903522859) **sukses (3 job)** | CI pada commit perbaikan ini dicatat setelah run selesai (commit berikutnya) | Belum diklaim |
| **G1-A04** — keputusan/tag/titik-kembali/`jalur-0.md` | `jalur-0.md` (draf jujur) dan `daftar-tindakan-pemilik.md` sudah ada sejak 21 Nov | Tidak ada tindakan kode. **Tidak** membuat tag/backup titik-kembali/keputusan | Menunggu pemilik |

### Hal yang TIDAK dilakukan (dan alasannya)
- Tidak mengisi keputusan gate, membuat tag `tahap-1-diterima`, atau backup titik-kembali — hanya pemilik, setelah syarat gate terpenuhi.
- Tidak menyatakan RPO ≤ 1 jam / RTO ≤ 4 jam kerja tercapai. Backup harian `pg_dump` tidak menjamin RPO 1 jam; mekanisme (arsip WAL kontinu) menunggu keputusan D-12 dan server. Drill memakai data sangat kecil di mesin pengembang/CI; waktunya tidak representatif.
- Tidak menutup temuan Gate 2 (G2-A01…A07): perbaikan A01–A06 menunggu audit ulang terpisah, A07 (bukti nyata Meta) tetap terbuka.
- Tidak menyebut Chromium `EPERM`, `psql`/`pg_dump` tidak ada, atau staging belum ada sebagai "lulus": itu keterbatasan lingkungan/infrastruktur yang hanya dapat diselesaikan di luar repository.
