# ADR-0001 — Stack teknologi dan modular monolith

- **Status:** Diterima pembangun; **menunggu persetujuan pemilik pada Gate 1**
- **Tanggal:** 2026-11-18 · **Tahap:** 1

## Konteks
Tim kecil (±10 pengguna awal), server tersendiri, kebutuhan keamanan tinggi (data pelanggan, 2FA, audit), dan roadmap 9 tahap.
AGENTS.md §5 menetapkan: modular monolith, Node.js LTS, TypeScript, Next.js, PostgreSQL, ORM dengan migrasi, Docker Compose, GitHub Actions, reverse proxy HTTPS.

## Keputusan
| Komponen | Pilihan (versi terpasang) | Alasan |
|---|---|---|
| Runtime | Node.js 22 (LTS) | LTS aktif; dipakai `engines` dan CI |
| Web | Next.js 16.4 + React 19 (App Router) | Satu kode untuk UI + API; server component memudahkan izin di sisi server |
| Bahasa | TypeScript 5.9, `strict` + `noUncheckedIndexedAccess` | Kontrak tipe untuk izin/konteks |
| Database | PostgreSQL 16 | Transaksi, constraint, trigger, advisory lock, `SKIP LOCKED` (ADR-0002) — cukup untuk antrean tanpa infrastruktur baru |
| ORM/migrasi | Drizzle ORM 0.45 + drizzle-kit 0.31 | SQL tipis & transparan; migrasi SQL maju-saja + berkas kustom untuk trigger |
| Sandi | Argon2id via `@node-rs/argon2` (m=19 MiB, t=2, p=1) | Minimum OWASP; biner prebuilt (tanpa kompilasi native) |
| 2FA | TOTP (`otpauth`), rahasia dienkripsi AES-256-GCM | Standar; kunci terpisah dari DB |
| Test | Vitest (integrasi ke PostgreSQL asli) + Playwright | Test menyentuh DB nyata agar trigger/constraint ikut teruji |
| Deploy | Docker multi-stage (`runtime` + `tools`) + Caddy HTTPS | Reverse proxy dengan sertifikat otomatis |

Struktur: `src/modules/<modul>` dengan layanan sebagai satu-satunya jalur ke DB. Route handler tipis.
Hanya modul Tahap 1 yang ada; modul tahap berikutnya (`whatsapp-adapter`, `ai-agents`, …) **tidak** dibuat dulu.

## Alternatif yang ditolak
- **Mikroservis / worker terpisah sekarang** — kompleksitas operasional tidak sepadan untuk 10 pengguna.
- **ORM lain (Prisma/TypeORM)** — Prisma menyulitkan trigger/constraint khusus & menambah runtime native; Drizzle cukup.
- **Tailwind/UI kit** — tidak diperlukan; CSS ringan mengurangi dependensi.
- **NextAuth/Auth.js** — kebutuhan khusus (2FA wajib per peran, sesi dicabut, kode pemulihan, audit) lebih jelas bila dimiliki sendiri dan diuji.

## Konsekuensi
- Perubahan teknologi wajib ADR baru. Kontrak inti (AGENTS.md §6) dibekukan setelah tahap pembuatnya diterima.
- `npm audit` melaporkan 4 temuan *moderate* **hanya pada tooling dev** (`drizzle-kit`→`esbuild`); dependensi produksi 0 temuan (lihat T1-F07).
- Next.js memperingatkan bahwa `next start` tidak cocok dengan `output: standalone`; produksi memakai `node server.js` (image Docker); E2E memakai `next start` yang tetap berfungsi.
