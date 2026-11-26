# Bukti pemeriksaan keamanan staging (`docs/staging.md` §6) — 26 Nov 2026

Ditempel/dinyatakan pemilik di sesi audit. Teks; tanpa rahasia.

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
| 2 | Cookie sesi `__Host-teone_session` (Secure, HttpOnly, SameSite) | **Belum terkonfirmasi** — pemilik hanya melihat cookie bernilai `1.1.…` (pola Google Analytics domain induk). Menunggu `printenv APP_ENV` / nama `set-cookie` |
| 3a | Pengguna 1-channel: channel lain tidak tampil di menu | **Ya** ✅ |
| 3b | Akses langsung via URL ke channel/percakapan lain ditolak | **Ya** ✅ |
| 4 | IP login di audit = IP publik pemilik (TRUST_PROXY benar) | **Sama** ✅ |

## Temuan
**F2-02 — Sedang: SSH dapat dijangkau dari seluruh internet.** Mitigasi yang disarankan (operator): pastikan login SSH hanya dengan kunci (`PasswordAuthentication no`, `PermitRootLogin no`); bila IP admin tetap, batasi `ufw` 22 ke IP itu; bila tidak tetap, pertimbangkan `fail2ban` atau VPN. Jangan menutup 22 sebelum akses kunci terbukti (risiko terkunci).
