# TE One — Enterprise Customer Relationship Management Platform

Platform CRM milik **Trilogika Edutama**. Repository ini berisi **Tahap 1 — Fondasi Produksi**: akun & keamanan sesi, 2FA,
izin per channel, tim, channel, audit log, feature flag, kill switch, backup/restore, dan fondasi regresi.

> **Belum ada** koneksi WhatsApp/Meta, inbox, AI, label, pipeline, atau follow-up (Tahap 2–6). Semua channel berstatus
> *Belum dikonfigurasi*. Nomor operasional (Admisi, Hotline) dan koneksi Halo AI **tidak disentuh**.
> Aturan permanen proyek: [`AGENTS.md`](AGENTS.md). Keputusan bisnis: [`docs/decisions.md`](docs/decisions.md).

## Kebutuhan
Node.js ≥ 22 · PostgreSQL 16 · (opsional) Docker · `pg_dump`/`gpg` untuk backup · Chromium untuk E2E.

## Menjalankan (development)
```bash
npm ci
cp .env.example .env                  # isi nilai; JANGAN di-commit
# 1) Buat role & database (sekali, sebagai superuser PostgreSQL) — password diberikan lewat variabel, bukan berkas:
psql -v ON_ERROR_STOP=1 -v dbname=teone_dev -v owner_password='…' -v app_password='…' -f db/init-roles.sql
# 2) Migrasi (maju saja) + peran awal + seed CONTOH (hanya dev/staging)
npm run db:migrate && npm run db:seed:roles && npm run db:seed:sample
# 3) Super Admin pertama (perintah satu kali; tidak ada sandi bawaan; 2FA wajib saat login pertama)
npm run admin:bootstrap
npm run dev                           # http://localhost:3000
```
Rincian lengkap: [`docs/pengembangan.md`](docs/pengembangan.md).

## Perintah penting
| Perintah | Fungsi |
|---|---|
| `npm run check:all` | lint + typecheck + guard + secret scan + seluruh test (seperti CI, tanpa E2E) |
| `npm test` | test integrasi/unit (butuh PostgreSQL; database uji dibuat ulang dari kosong tiap eksekusi) |
| `npm run e2e` | Golden E2E (Playwright, server produksi hasil `npm run build`) |
| `npm run test:report` | vitest + ringkasan jumlah test per tag `@tahap-N` + penjaga baseline |
| `npm run guard:operational` / `npm run scan:secrets` | guard nomor operasional / pemindai rahasia |
| `bash scripts/backup-restore-drill.sh` | drill backup terenkripsi → restore ke database terpisah → verifikasi |

## Struktur
```
src/app/            halaman (Bahasa Indonesia) + /api/v1/* (route handler tipis)
src/modules/        modular monolith: auth · users · roles-permissions · teams · audit · org-settings · channels · kill-switch · feature-flags · shared
src/db/             skema Drizzle + klien (role runtime `teone_app`, tanpa DDL)
drizzle/            migrasi maju-saja (0001 berisi trigger integritas)
db/                 init-roles.sql (role owner/app) dan grants.sql (hak runtime minimum)
scripts/            migrate, seed, bootstrap/recover, backup/restore, guard, secret-scan, laporan test
tests/              unit · integration (@tahap-N) · e2e (Playwright)
deploy/             compose + Caddy untuk staging (belum diuji pada server)
docs/               ADR, panduan, keamanan, backup, rencana Meta, temuan, laporan, gate
```

## Status
Lihat [`docs/reports/tahap-1.md`](docs/reports/tahap-1.md) (hasil, bukti, dan apa yang **belum** terbukti) dan
[`docs/temuan-dan-risiko.md`](docs/temuan-dan-risiko.md). Gate 1 memerlukan audit independen (bukan sesi pembangun).
