# Bukti pemeriksaan keamanan staging (`docs/staging.md` §6) — 26 Nov 2026

Ditempel/dinyatakan pemilik di sesi audit. Teks; tanpa rahasia.

## 8a — Dari luar (laptop pemilik, Windows PowerShell)
```
http://staging-chat.trilogikaedutama.id  → HTTP/1.1 308 Permanent Redirect, Location: https://staging-chat.trilogikaedutama.id/
https://…/login → HTTP/1.1 200 OK
  Content-Security-Policy: default-src 'self'; … frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
  Referrer-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  (tidak ada X-Powered-By)
Port dari internet: 443 TERBUKA · 80 TERBUKA · 5432 tertutup · 3000 tertutup · 22 TERBUKA
```
- ✅ HTTP → HTTPS (308); HSTS ada; header keamanan lengkap; `X-Powered-By` tidak ada.
- ✅ 5432 dan 3000 tertutup dari internet (konsisten dengan 8b). 22 terbuka → F2-02.

## 8b — Port yang mendengarkan & firewall (di VPS)
```
0.0.0.0:22   sshd        [::]:22   sshd
0.0.0.0:80   docker-proxy  [::]:80   docker-proxy
0.0.0.0:443  docker-proxy  [::]:443  docker-proxy
ufw: active — ALLOW 22/tcp, 80/tcp, 443/tcp (v4+v6) dari Anywhere
```
- ✅ Yang terbuka ke luar hanya 22, 80, 443. **PostgreSQL (5432) dan app (3000) tidak mendengarkan di alamat publik.**
- ⚠️ **SSH (22) terbuka dari mana saja** (`docs/staging.md` §3 meminta "22 dari IP admin"). Temuan **F2-02 (sedang)** — lihat di bawah.

## 8c — G1 lewat HTTPS staging (browser, dinyatakan pemilik)
| # | Cek | Hasil |
|---|---|---|
| 1 | Login Super Admin wajib kode 2FA | **Ya** ✅ |
| 2 | Cookie sesi `__Host-teone_session` (Secure, HttpOnly, SameSite) | ✅ **Terbukti dari konfigurasi + kode:** `docker exec deploy-app-1 printenv APP_ENV` = `staging` → `isSecureCookies()` benar (`src/lib/env.ts:54`) → cookie `__Host-teone_session; Path=/; HttpOnly; SameSite=Lax; Secure` (`src/modules/auth/session.ts:14–18`; diuji `@tahap-1`). Di DevTools pemilik hanya terlihat `_gcl_au`/`_ga` (Google Ads/Analytics domain induk), bukan cookie TE One — pengamatan langsung `set-cookie` belum dilakukan |
| 3a | Pengguna 1-channel: channel lain tidak tampil di menu | **Ya** ✅ |
| 3b | Akses langsung via URL ke channel/percakapan lain ditolak | **Ya** ✅ |
| 4 | IP login di audit = IP publik pemilik (TRUST_PROXY benar) | **Sama** ✅ |

## Temuan
**F2-02 — Sedang: SSH dapat dijangkau dari seluruh internet.** Mitigasi yang disarankan (operator): pastikan login SSH hanya dengan kunci (`PasswordAuthentication no`, `PermitRootLogin no`); bila IP admin tetap, batasi `ufw` 22 ke IP itu; bila tidak tetap, pertimbangkan `fail2ban` atau VPN. Jangan menutup 22 sebelum akses kunci terbukti (risiko terkunci).

## Pembaruan F2-02 — konfigurasi SSH (26 Nov, `sshd -T`, dinyatakan pemilik)
```
passwordauthentication no
pubkeyauthentication yes
permitrootlogin without-password
```
SSH hanya menerima login **kunci**; sandi ditolak; root hanya dengan kunci. **F2-02 diturunkan ke rendah.** Pengerasan opsional: `PermitRootLogin no` (setelah memastikan akun admin non-root dengan sudo dapat login dengan kunci), dan/atau batasi `ufw` 22 ke IP admin bila IP tetap, atau `fail2ban`.

## Ringkasan `docs/staging.md` §6 (26 Nov)
HTTPS + 308 + HSTS ✅ · cookie `__Host-` (dari APP_ENV=staging + kode) ✅ · header keamanan, tanpa X-Powered-By ✅ · hanya 80/443/22 terbuka, 5432/3000 tertutup ✅ · G1 lewat HTTPS (2FA, cakupan channel menu + URL) ✅ · TRUST_PROXY/IP audit ✅ · image dibangun di server dengan provenance ✅ (`rebuild-staging-2026-11-26.md`) · webhook Meta → Caddy → app (pesan uji masuk setelah pergantian) ✅ · **backup terjadwal + salinan terpisah: belum (Langkah 6–7)** · restore drill di server ✅ (`restore-staging-2026-11-26.md`).
