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
| `npm run test:report` | Vitest JSON + ringkasan per tag + **penjaga baseline** (`tests/baseline-counts.json`) |
| `bash scripts/backup-restore-drill.sh` | Drill backup/restore |

**Konvensi:** setiap `describe` memuat tag **`@tahap-N`** (tahap pembuat). Test tidak boleh dihapus/di-skip/dilemahkan tanpa ADR; `test-tag-report` gagal bila jumlah turun, ada skip/todo, atau E2E dilewati tanpa penanda resmi `[BELUM TERSEDIA — Tahap N]`. Baseline hanya boleh **naik**.
Test memakai jam `Date` palsu agar kode TOTP bisa dipakai berulang tanpa melanggar proteksi replay (`tests/helpers/clock.ts`).

## 5. Menambah sesuatu
- **Izin baru** → tambah di `src/modules/roles-permissions/registry.ts` (`channelScoped`, `available`). Layanan WAJIB memanggil `ctx.perms.can(...)`. Test arsitektur memeriksa bahwa layanan memeriksa izin.
- **Endpoint** → `src/app/api/v1/.../route.ts` dengan `apiFull`/`apiSession` (jangan `apiPublic` kecuali login — dijaga test arsitektur).
- **Migrasi** → ubah `src/db/schema.ts` lalu `npm run db:generate`; untuk trigger/constraint gunakan `npx drizzle-kit generate --custom`. **Maju saja.** Perubahan destruktif memakai pola *expand → migrasi data → contract*. Setelah menambah tabel baru, pastikan `db/grants.sql` tetap sesuai (tabel sensitif di-REVOKE).
- **Feature flag** → `src/modules/feature-flags/index.ts` (default mati); fitur memanggil `requireFeature(key)`.
- **Otomatisasi** → setiap pengiriman otomatis WAJIB lewat `checkAutomation()`/`guardedAutomation()` tepat sebelum kirim.
- **Data uji** → tidak ada data pelanggan, nomor lengkap, atau channel `isOperational` (guard CI menolak). Nilai uji sintetis dibangun saat runtime.

## 6. Guard & pemindai
`npm run guard:operational` menolak penanda operasional di seed/fixture/config/test, nomor berakhiran 1119/0124, dan **nomor telepon lengkap apa pun**; env `OPERATIONAL_NUMBER_HASHES` (sha256 digit E.164, rahasia CI) menambah pengecekan nomor terdaftar. `npm run scan:secrets` + gitleaks di CI. Pengecualian per baris hanya dengan komentar `guard-operational:allow` / `secret-scan:allow` **disertai alasan** (ditinjau di PR).
