# Arsitektur — Tahap 1

**Modular monolith** (AGENTS.md §5). Satu aplikasi Next.js, satu database PostgreSQL, tanpa antrean/worker/layanan tambahan.
Modul berkomunikasi lewat fungsi layanan yang terdokumentasi; tidak ada tabel/worker untuk fitur tahap berikutnya.

```
Browser ──HTTPS──▶ Caddy ──▶ Next.js (satu proses)
                              ├─ src/app/api/v1/*   route handler TIPIS → pembungkus apiFull/apiSession/apiPublic
                              │      (Origin, sesi, CSRF, stage 2FA, bentuk input) → layanan modul
                              ├─ src/app/(halaman)  server component → layanan modul (izin diperiksa DI LAYANAN)
                              └─ src/modules/*      logika + izin + audit (satu-satunya jalur ke database)
                                         │
                                         ▼
                     PostgreSQL ── role teone_app (runtime, tanpa DDL, tanpa UPDATE/DELETE audit_log)
                                   role teone_owner (hanya migrasi/CLI)
```

## Modul Tahap 1
| Modul | Tanggung jawab |
|---|---|
| `auth` | login, sesi server (token acak → hash SHA-256 di DB), CSRF, pembatasan percobaan, TOTP, kode pemulihan, ganti sandi |
| `users` | pengguna, status, Super Admin, peran/izin per pengguna, reset sandi/2FA |
| `roles-permissions` | registri izin, **engine murni** `PermissionSet`, anti-eskalasi, peran |
| `teams` | tim (anggota + channel yang ditangani) — hanya data di Tahap 1 |
| `channels` | channel (batas aktif, arsip, status jujur), disaring menurut cakupan |
| `org-settings` | batas channel, zona waktu (Super Admin) |
| `audit` | tulis (dalam transaksi yang sama dengan perubahan) + baca |
| `kill-switch` | registri + `checkAutomation()` fail-closed + `guardedAutomation()` contoh |
| `feature-flags` | flag per lingkungan, default mati, fail-closed |
| `shared` | kripto (AES-GCM, HMAC), konteks, pemetaan error DB |

## Prinsip yang ditegakkan di kode
1. **Izin di server, di layanan.** Halaman dan API sama-sama memanggil layanan; layanan memeriksa izin aksi + cakupan channel.
2. **Pertahanan berlapis di database**: audit append-only (hak + trigger), batas channel (advisory lock), Super Admin terakhir (trigger), CHECK status channel (tidak ada "terhubung") dan penanda operasional.
3. **Fail-closed**: feature flag dan kill switch menganggap "mati/diblokir" bila tak terbaca.
4. **Tanpa kerahasiaan di log/audit**: `redact()` + pesan error generik + ID korelasi.
5. **Forward-only migration** dan **feature flag default mati** untuk semua fitur tahap berikutnya.

## Teknologi (ADR-0001)
Node.js 22 · Next.js 16 (App Router) · React 19 · TypeScript 5.9 (strict) · PostgreSQL 16 · Drizzle ORM/Kit · Argon2id (`@node-rs/argon2`) ·
`otpauth` (TOTP) · Vitest · Playwright · Docker Compose + Caddy · GitHub Actions.

## Kontrak inti (AGENTS.md §6) — status di Tahap 1
| # | Kontrak | Tahap 1 |
|---|---|---|
| 1 | Pemeriksaan izin (aksi + cakupan, default menolak, deny menang) | **Diimplementasikan & diuji** |
| 2 | Identitas Kontak→Percakapan→Pesan | Rancangan saja (ADR-0003); tabel di Tahap 2 |
| 3 | Event masuk disimpan sebelum respons | Rancangan (ADR-0002); Tahap 2 |
| 4 | Status AI per percakapan (versi) | Belum dibuat (Tahap 3–4) |
| 5 | Pengiriman keluar idempoten | Belum dibuat (Tahap 3) |
| 6 | Pemeriksaan ulang sebelum kirim otomatis | Pola `guardedAutomation()` (fungsi contoh) |
| 7 | Kill switch (chat/channel/fitur/global) | **Registri diimplementasikan**; terbukti pada fungsi contoh |
