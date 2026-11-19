# Panduan staging

> **STATUS: dibuat, BELUM DIVERIFIKASI.** Server staging (Jalur 0, J0-03) belum tersedia pada Tahap 1; berkas `deploy/` hanya
> diuji secara sintaks/logika lokal. Setiap butir di bagian 6 harus dibuktikan di server sebelum staging dinyatakan siap.

## 1. Prinsip
- **Server tersendiri** untuk TE One — jangan memakai VPS HRIS atau aplikasi keuangan (AGENTS.md §1).
- Database dan **semua rahasia terpisah** dari development/production. Domain: **subdomain khusus** TE One (nama final dari `docs/jalur-0.md` — berkas belum ada; `deploy/Caddyfile` memakai placeholder `staging-chat.example.invalid`).
- Pita **"LINGKUNGAN STAGING"** tampil otomatis (`APP_ENV=staging`). Data hanya data contoh/uji.
- Pesan keluar di non-production **hanya** ke daftar penerima uji yang ditegakkan di server (AGENTS.md §3.6) — diimplementasikan di Tahap 2 (`tahap-2/konfigurasi-staging.md`; **belum terbukti di server**).

## 2. HTTPS & cookie
- Caddy menyediakan sertifikat otomatis + HSTS; port 80/443 satu-satunya yang terbuka ke internet.
- `APP_ENV=staging|production` ⇒ cookie sesi bernama **`__Host-teone_session`** dengan `Secure; HttpOnly; SameSite=Lax; Path=/` (prefiks `__Host-` mensyaratkan Secure & tanpa Domain). Di development nama `teone_session` tanpa Secure.
- `APP_BASE_URL` WAJIB sama persis dengan origin publik (`https://…`) — dipakai pemeriksaan Origin/CSRF.
- Aplikasi mengirim header: CSP (`frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`; tanpa `X-Powered-By`.

## 3. Kontrol jaringan
- Firewall (mis. `ufw`): default deny; izinkan 80/443 dari mana saja, **22 hanya dari IP admin** (atau lewat VPN).
- PostgreSQL **tidak dipublikasikan** (jaringan Docker `internal`); hanya `app`/`tools` yang menjangkaunya.
- `TRUST_PROXY=true` **hanya** di belakang Caddy (Caddy menimpa `X-Forwarded-For`). Bila di-set `true` tanpa proxy tepercaya, klien dapat memalsukan IP dan menghindari batas per-IP (batas per-akun tetap berlaku). Jika `false`, batas per-IP dilewati (hanya per-akun).
- Health check `GET /api/health` hanya mengembalikan `{"status":"ok"}`.

## 4. Rahasia
Berkas di luar repository, pemilik root, `chmod 600`: `/etc/teone/staging.env` (nama variabel = `.env.example`), `/etc/teone/pg_superuser.secret`, `/etc/teone/backup.pass` (**disimpan terpisah dari server DB** — lihat backup-restore.md). Kunci `APP_ENCRYPTION_KEY` dikelola terpisah dari database; kehilangan kunci ⇒ seluruh TOTP harus direset.

## 5. Deploy (rencana)
```bash
docker build -t teone-app:staging .                           # target runtime
docker build --target tools -t teone-tools:staging .          # migrasi & CLI admin
docker compose -f deploy/docker-compose.staging.yml up -d db
docker compose -f deploy/docker-compose.staging.yml run --rm tools npm run db:migrate
docker compose -f deploy/docker-compose.staging.yml run --rm tools npm run db:seed:sample   # hanya staging
docker compose -f deploy/docker-compose.staging.yml run --rm -it tools npm run admin:bootstrap
docker compose -f deploy/docker-compose.staging.yml up -d app caddy
```
Role DB dibuat dulu dengan `db/init-roles.sql` (sandi dari secret manager).

## 5b. Tahap 2 — webhook WhatsApp dan worker
- Meta harus menjangkau `https://<domain-staging>/api/webhooks/whatsapp` (POST/GET) lewat Caddy; **tidak** ada autentikasi sesi di jalur ini (diamankan tanda tangan + verify token).
- Service `worker` dan volume `media_data` ditambahkan di `deploy/docker-compose.staging.yml` (**dibuat, belum diuji**). Backup media belum ada (T2-F11).
- Variabel `META_*`, `MEDIA_DIR`, `WORKER_INLINE`: lihat `tahap-2/konfigurasi-staging.md`.

## 6. Yang HARUS dibuktikan di server (tertunda) — isi saat verifikasi
- [ ] Sertifikat HTTPS valid; HTTP → HTTPS; HSTS terbaca
- [ ] Cookie sesi di browser: `__Host-…`, Secure, HttpOnly, SameSite (screenshot disamarkan)
- [ ] Header keamanan terbaca dari luar; `X-Powered-By` tidak ada
- [ ] Pemindaian port dari luar: hanya 80/443 (dan 22 dari IP admin); 5432 tertutup
- [ ] Login + 2FA Super Admin berjalan lewat domain staging (Golden E2E G1 di staging, GATE B5)
- [ ] `TRUST_PROXY=true` + IP klien benar tercatat di audit; batas per-IP berfungsi
- [ ] Backup terjadwal berjalan; salinan di lokasi terpisah; restore drill di server (GATE B7)
- [ ] Image Docker berhasil dibangun di server (belum terbukti — lihat temuan T1-F03); Tahap 2: UID tetap 10001 + volume media dapat ditulis `app` dan `worker`
- [ ] Tahap 2: webhook Meta menjangkau Caddy → app (challenge + POST bertanda tangan); body ≤ 3 MB lewat proxy
