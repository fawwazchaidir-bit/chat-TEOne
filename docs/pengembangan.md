# Panduan development

## 1. Prasyarat
Node.js ≥ 22, npm, PostgreSQL 16 (lokal atau `docker compose up -d db`), `psql`, `pg_dump`/`pg_restore`, `gpg` (backup), Chromium (E2E).

## 2. Database & role (sekali per lingkungan)
Aplikasi memakai **dua role** agar server web tidak punya hak DDL dan tidak dapat mengubah `audit_log`:

| Role | Dipakai oleh | Hak |
|---|---|---|
| `teone_owner` | migrasi (`npm run db:migrate`), CLI admin, backup | pemilik skema |
| `teone_app` | server web (`DATABASE_URL`) | SELECT/INSERT/UPDATE/DELETE; **tanpa** UPDATE/DELETE/TRUNCATE di `audit_log`; tanpa DDL |

```bash
psql -v ON_ERROR_STOP=1 -v dbname=teone_dev -v owner_password='…' -v app_password='…' -f db/init-roles.sql   # sebagai superuser
```
Isi `.env` dari `.env.example` (`DATABASE_URL` = `teone_app`, `DATABASE_MIGRATION_URL` = `teone_owner`). Kunci enkripsi:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → APP_ENCRYPTION_KEY
```
**Jangan** memakai kunci/DB/sandi yang sama antar lingkungan. **Jangan** commit `.env`.

## 3. Alur harian
```bash
npm run db:migrate         # maju-saja; juga menerapkan db/grants.sql (idempoten)
npm run db:seed:roles      # peran awal (Manajer, Admin Admisi/Hotline/Kemitraan) — tanpa izin per channel
npm run db:seed:sample     # 3 channel CONTOH + izin peran Admin per fungsi (DITOLAK di production)
npm run admin:bootstrap    # Super Admin pertama (sekali; menolak bila sudah ada)
npm run dev
```
Pemulihan akun lewat server (kehilangan 2FA/sandi Super Admin): `npm run admin:recover -- reset-2fa <email>` | `reset-password <email>` | `activate <email>` — tercatat di audit.

## 4. Pengujian
| Perintah | Keterangan |
|---|---|
| `npm test` | Vitest. `tests/global-setup.ts` membuat ulang database `teone_test` **dari kosong** (menguji migrasi) lewat `TEST_ADMIN_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`) | <!-- secret-scan:allow — kredensial DB uji sekali pakai (lokal/CI), bukan rahasia -->
| `npm run e2e` | Playwright; membangun DB `teone_e2e`, menjalankan `next start` pada :3100. Butuh `npm run build` dulu. Bila Chromium bawaan tidak cocok: `PW_CHROMIUM_PATH=/path/chrome npm run e2e` |
| `npm run test:report` | Pembungkus `scripts/run-test-report.mjs`: Vitest + ringkasan per tag + penjaga baseline; **exit code Vitest diteruskan** dan penjaga menolak suite gagal/hasil hilang/usang/rusak (ADR-0005). **Wajib dipakai** (Vitest manual lalu pelapor akan gagal: bukti exit code tidak ada). Setelah `npm run e2e`, jalankan `node scripts/test-tag-report.mjs --require-e2e` (seperti langkah akhir CI) |
| `bash scripts/verify-all.sh` | **Verifikasi menyeluruh satu commit** (lint…drill) dengan log/kode keluar/durasi di `.verify/`; lihat §7 |
| `bash scripts/backup-restore-drill.sh` | Drill backup/restore |
| `npm run worker` | (Tahap 2) pemroses antrean event webhook + rekonsiliasi + unduh media + retensi payload. Opsional di lokal (`WORKER_INLINE=true` memproses di proses web) |
| `npm run meta:check` | (Tahap 2) diagnostik koneksi Meta; hasil **nyata** hanya bila `META_GRAPH_BASE_URL` = graph.facebook.com |

**Konvensi:** setiap `describe` memuat tag **`@tahap-N`** (tahap pembuat). Test tidak boleh dihapus/di-skip/dilemahkan tanpa ADR; `test-tag-report` gagal bila jumlah turun, ada skip/todo, atau E2E dilewati tanpa penanda resmi `[BELUM TERSEDIA — Tahap N]`. Baseline hanya boleh **naik**.
Test memakai jam `Date` palsu agar kode TOTP bisa dipakai berulang tanpa melanggar proteksi replay (`tests/helpers/clock.ts`).

## 5. Menambah sesuatu
- **Izin baru** → tambah di `src/modules/roles-permissions/registry.ts` (`channelScoped`, `available`). Layanan WAJIB memanggil `ctx.perms.can(...)`. Test arsitektur memeriksa bahwa layanan memeriksa izin.
- **Endpoint** → `src/app/api/v1/.../route.ts` dengan `apiFull`/`apiSession` (jangan `apiPublic` kecuali login — dijaga test arsitektur).
- **Migrasi** → ubah `src/db/schema.ts` lalu `npm run db:generate`; untuk trigger/constraint gunakan `npx drizzle-kit generate --custom`. **Maju saja.** Perubahan destruktif memakai pola *expand → migrasi data → contract*. Setelah menambah tabel baru, pastikan `db/grants.sql` tetap sesuai (tabel sensitif di-REVOKE).
- **Feature flag** → `src/modules/feature-flags/index.ts` (default mati); fitur memanggil `requireFeature(key)`.
- **Otomatisasi** → setiap pengiriman otomatis WAJIB lewat `checkAutomation()`/`guardedAutomation()` tepat sebelum kirim.
- **Data uji** → tidak ada data pelanggan, nomor lengkap, atau channel `isOperational` (guard CI menolak). Nilai uji sintetis dibangun saat runtime.

## 5b. Tahap 2 — menguji konektor tanpa Meta
`tests/helpers/mock-graph.ts` = mock Graph API yang dapat diprogram (ok/4xx/5xx/timeout) dan merekam setiap panggilan; `tests/helpers/whatsapp.ts` = fixture payload **sintetis** (nomor bukan Indonesia; nilai dibangun saat runtime agar lolos guard).
Semua hasil terhadap mock berstatus **SIMULASI**. Webhook lokal: tanda tangani body dengan `META_APP_SECRET` (`signBody`) — lihat E2E `tests/e2e/g2.spec.ts`.
Dokumen: [`tahap-2/`](tahap-2/README.md).

## 6. Guard & pemindai
`npm run guard:operational` menolak penanda operasional di seed/fixture/config/test, nomor berakhiran 1119/0124, dan **nomor telepon lengkap apa pun**; env `OPERATIONAL_NUMBER_HASHES` (sha256 digit E.164, rahasia CI) menambah pengecekan nomor terdaftar. `npm run scan:secrets` + gitleaks di CI. Pengecualian per baris hanya dengan komentar `guard-operational:allow` / `secret-scan:allow` **disertai alasan** (ditinjau di PR).

## 7. Lingkungan uji terisolasi setara CI + verifikasi menyeluruh (G1-A02)
Prasyarat (sama dengan job CI): **Node 22** (`.nvmrc`; Node 24 tidak setara CI), **PostgreSQL 16** yang dapat dijangkau `TEST_ADMIN_DATABASE_URL` (default `localhost:5432`, superuser — untuk DB uji sekali pakai),
klien `postgresql-client-16` (`psql`, `pg_dump`, `pg_restore`), `gpg`, Chromium (`npx playwright install chromium`, atau `PW_CHROMIUM_PATH=/path/chrome`), dan (opsional lokal) `gitleaks` 8.24.3.
```bash
docker run -d --name teone-pg -e POSTGRES_PASSWORD=GANTI_SANDI_UJI -p 5432:5432 postgres:16     # DB uji sekali pakai
export TEST_ADMIN_DATABASE_URL=postgres://postgres:GANTI_SANDI_UJI@localhost:5432/postgres
bash scripts/verify-all.sh --ci                                                                      # npm ci + semua langkah
```
`verify-all.sh` mencatat commit, versi alat, dan per langkah: **LULUS / GAGAL / TIDAK DAPAT DIJALANKAN** (prasyarat tidak ada — bukan lulus), kode keluar, durasi, dan log di `.verify/` (tidak di-commit); keluar 0 hanya bila semuanya lulus.
Bila `tsx` gagal dengan `EPERM` saat membuat socket IPC: dugaan penyebab folder sementara tidak dapat ditulis — set `TMPDIR` ke direktori yang dapat ditulis (**belum diverifikasi**).
