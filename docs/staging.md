# Panduan staging

> **STATUS (diperbarui 25 Nov 2026): staging DILAPORKAN berjalan** di `staging-chat.trilogikaedutama.id` dengan commit `9c297d3` dan Meta nyata (lihat
> [`tahap-2/bukti-uji-staging-2026-11-25.md`](tahap-2/bukti-uji-staging-2026-11-25.md)), tetapi **bukti belum terlampir** dan **butir di bagian 6 belum ada yang dicentang** —
> staging **belum dinyatakan siap/terverifikasi**. Pembangun tidak memiliki akses ke server; yang di bawah adalah prosedur yang **dapat direproduksi** dan yang diuji di CI.

## 1. Prinsip
- **Server tersendiri** untuk TE One — jangan memakai VPS HRIS atau aplikasi keuangan (AGENTS.md §1).
- Database dan **semua rahasia terpisah** dari development/production. Domain: **subdomain khusus** TE One — staging: `staging-chat.trilogikaedutama.id` (dilaporkan; DNS/HTTPS belum terbukti di repository). Domain **tidak ditulis di berkas terlacak**: dibaca dari `SITE_ADDRESS` di `deploy/.env` (lihat §5); bawaan `.invalid` sengaja tidak dapat memperoleh sertifikat.
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

## 5. Build dan deploy yang dapat direproduksi
**Prinsip:** image yang diuji harus dapat dikaitkan ke **satu commit**; konfigurasi server **tidak** boleh berupa edit pada berkas yang dilacak git.

```bash
git fetch origin && git checkout --detach <SHA-commit-yang-akan-diuji>   # pohon kerja HARUS bersih (git status kosong)
cp deploy/.env.example deploy/.env      # SEKALI; isi SITE_ADDRESS=<domain staging>  (nilai non-rahasia; berkas ini di-ignore git & docker)
bash scripts/build-staging-image.sh     # menolak pohon kotor; label revision=SHA; tag staging-<sha7>; mencetak PROVENANCE → salin ke catatan bukti
export TEONE_TAG=staging-<sha7>         # tag yang dicetak skrip
docker compose -f deploy/docker-compose.staging.yml up -d db
docker compose -f deploy/docker-compose.staging.yml run --rm tools npm run db:migrate
docker compose -f deploy/docker-compose.staging.yml run --rm tools npm run db:seed:sample   # hanya staging
docker compose -f deploy/docker-compose.staging.yml run --rm -it tools npm run admin:bootstrap
docker compose -f deploy/docker-compose.staging.yml up -d app worker caddy
```
> **Peringatan `--env-file` (S-09) dan nama proyek:** bila perintah compose memakai `--env-file /etc/teone/staging.env` (seperti yang dipakai operator), Compose **tidak** membaca `deploy/.env` otomatis → `SITE_ADDRESS`/`TEONE_TAG` kembali ke bawaan (domain `.invalid`, tag `staging`). Berikan **kedua** berkas (`--env-file /etc/teone/staging.env --env-file deploy/.env`) atau ekspor variabelnya, dan periksa hasilnya dengan `… config`. Gunakan juga `-p deploy` (nama proyek aktif; volume `deploy_pg_data`, `deploy_media_data`, `deploy_caddy_data`). Saat memperbarui token/App Secret, buat ulang kontainer yang membaca `/etc/teone/staging.env` (`app`; dan `worker` **bila dijalankan**). **Tanpa worker, pemeliharaan (retensi payload, rekonsiliasi `belum_pasti`, ulang media, fallback outbox, job otomatisasi) TIDAK berjalan** — mode inline hanya memproses event saat ada webhook (S-10; `tahap-2/pemeliharaan-inline-vs-worker.md`). Detail: `docs/tahap-2/prosedur-uji-m11-m12.md` §5.3.

Role DB dibuat dulu dengan `db/init-roles.sql` (sandi dari secret manager). Rahasia hanya di `/etc/teone/staging.env`.

**Mengapa build dulu gagal ("`tests/e2e/env`")** — dan perbaikannya: `.dockerignore` mengecualikan `tests/` (benar: tidak ada alasan mengirimnya ke image), sedangkan `tsconfig.json` memuat `*.ts` sehingga `playwright.config.ts` (yang meng-import `./tests/e2e/env`) ikut diperiksa tipe oleh `next build` di dalam Docker → `Cannot find module './tests/e2e/env'`. **Jangan** "memperbaiki" dengan menghapus `tests` dari `.dockerignore` (itu memasukkan tests ke image). Perbaikan benar: `next build` memakai `tsconfig.build.json` (tanpa tests/ dan konfigurasi uji); `npm run typecheck` tetap memeriksa **semuanya** di CI. Dijaga `npm run check:docker-context` (meniru konteks Docker + memeriksa tipe) dan job CI **Image Docker** (build sungguhan + migrasi + jalan + health + provenance).

**Memeriksa image yang berjalan** (catat di bukti uji): `docker image inspect teone-app:$TEONE_TAG --format '{{ index .Config.Labels "org.opencontainers.image.revision" }} {{.Id}}'` dan `docker compose -f deploy/docker-compose.staging.yml ps`; di host `git rev-parse HEAD` harus sama dengan label revision. Healthcheck: `GET /api/health` = `{"status":"ok"}` (butuh database).

## 5b. Tahap 2 — webhook WhatsApp dan worker
- Meta harus menjangkau `https://<domain-staging>/api/webhooks/whatsapp` (POST/GET) lewat Caddy; **tidak** ada autentikasi sesi di jalur ini (diamankan tanda tangan + verify token).
- Service `worker` dan volume `media_data` ada di `deploy/docker-compose.staging.yml`; nama proyek **dikunci `name: deploy`** (volume `deploy_pg_data`, `deploy_media_data`, `deploy_caddy_data`). **Worker adalah satu-satunya yang menjalankan pemeliharaan berkala** (retensi payload ≤ 30 hari D-18, penyapu/rekonsiliasi `belum_pasti`, ulang media, fallback outbox); mode inline di `app` hanya memproses antrean saat ada webhook (S-10). Menyalakan worker (A-4 disetujui pemilik 26 Nov 2026; **tugas operator**, tanpa membangun ulang image `app`):
  ```bash
  sudo docker compose -p deploy --env-file /etc/teone/staging.env --env-file deploy/.env \
    -f deploy/docker-compose.staging.yml up -d --no-deps worker
  sudo docker compose -p deploy --env-file /etc/teone/staging.env --env-file deploy/.env -f deploy/docker-compose.staging.yml config | grep -E 'name:|image:|SITE_ADDRESS'   # periksa nama proyek, tag image, domain
  sudo docker compose -p deploy -f deploy/docker-compose.staging.yml logs --tail 20 worker    # harapan: "[worker] mulai"; tanpa "[worker] fatal"
  npm run worker -- --once   # (opsional, dari image tools) satu siklus lalu keluar; kode keluar ≠ 0 bila ada galat
  ```
  Image `teone-tools:<tag>` harus sudah ada di server (dibangun `scripts/build-staging-image.sh`); tag sama dengan `app`. Backup media: skrip `backup.sh`/`restore.sh` kini mencakup media (`docs/backup-restore.md`); jadwal & salinan terpisah di server belum ada.
- **Keamanan staging dengan Meta asli:** flag `inbox` dan `ai_simulation` harus **mati**. `ai_simulation` kini ditolak server bila `META_GRAPH_BASE_URL` = `graph.facebook.com` (mengirim `[SIMULASI]` nyata dilarang).
- Variabel `META_*`, `MEDIA_DIR`, `WORKER_INLINE`: lihat `tahap-2/konfigurasi-staging.md`.

## 5c. Observabilitas webhook (G3-T01)
Sejak perbaikan G3-T01, **setiap** respons `/api/webhooks/whatsapp` menghasilkan satu baris log aplikasi berawalan `[webhook]` (JSON satu baris). Isi yang dicatat **hanya**: metode, kode status, alasan, ukuran body (byte), hitungan simpan, dan label error aman. **Tidak pernah** dicatat: payload, header tanda tangan, verify token/challenge, nomor telepon, ID pesan, isi pesan.

| `reason` | Status | Arti / tindakan |
|---|---|---|
| `ok` | 200 | Disimpan. `counts` = `received/stored/duplicates/quarantined` (mis. Test Meta berulang → `duplicates:1`) |
| `signature_invalid` | 401 | Tanda tangan tidak cocok → **periksa `META_APP_SECRET` vs App Secret aplikasi TE-One** |
| `signature_missing` | 401 | Request tanpa header tanda tangan (bukan dari Meta) |
| `flag_off` | 404 | Flag `whatsapp_connector` mati |
| `secret_missing` | 503 | `META_APP_SECRET` kosong di lingkungan |
| `too_large` | 413 | Body > 3 MB |
| `not_json` | 400 | Tanda tangan sah tetapi body bukan JSON |
| `store_failed` | 500 | DB menolak tulis (`error` = kode SQLSTATE); Meta akan mengirim ulang |
| `challenge_ok` / `challenge_rejected` | 200 / 403 | Verifikasi langganan (GET) |

```bash
sudo docker compose -p deploy -f deploy/docker-compose.staging.yml logs --since 1h app | grep '\[webhook\]'
sudo docker compose -p deploy -f deploy/docker-compose.staging.yml logs --since 24h app | grep '\[webhook\]' | grep -v '"status":200'   # hanya penolakan
```
Super Admin juga melihat ringkasan **24 jam terakhir per alasan** di halaman **Integrasi** (penghitung di memori proses `app`; kembali ke nol saat restart; tidak mencakup request yang diblokir sebelum sampai ke aplikasi).

**Log akses Caddy untuk `/api/webhooks/*` (tanpa body).** `deploy/Caddyfile` sudah mendefinisikan log akses untuk seluruh situs ke `/data/log/access.log` (volume `deploy_caddy_data`), tanpa header request/response, dengan `hub.verify_token`/`hub.challenge` disamarkan; Caddy tidak pernah mencatat body. Saat uji S7, log yang diperiksa hanya memuat 308 (pengalihan HTTP→HTTPS) — **penyebabnya belum diverifikasi** di server. Langkah pemeriksaan operator:
```bash
sudo docker compose -p deploy -f deploy/docker-compose.staging.yml exec caddy caddy validate --config /etc/caddy/Caddyfile   # konfigurasi yang dimuat valid
sudo docker compose -p deploy -f deploy/docker-compose.staging.yml exec -T caddy diff /etc/caddy/Caddyfile - < deploy/Caddyfile && echo "Caddyfile di container = repository"   # bind mount berkas: `git pull` membuat inode baru, container lama bisa masih melihat versi lama
sudo docker compose -p deploy -f deploy/docker-compose.staging.yml exec caddy sh -c 'ls -l /data/log/ && grep "/api/webhooks/" /data/log/access.log | tail -5'
```
- Bila `access.log` tidak ada/tidak bertambah: Caddy belum memuat Caddyfile terbaru → bila `diff` berbeda, buat ulang container (`... up -d --no-deps --force-recreate caddy`); bila sama, `... exec caddy caddy reload --config /etc/caddy/Caddyfile`, lalu ulangi satu request (mis. buka `https://<domain-staging>/api/health`) dan periksa lagi. Jangan memeriksa `docker logs caddy` untuk log akses: keluaran itu hanya log runtime (stderr).
- Log akses khusus `/api/webhooks/*` **tidak perlu** konfigurasi terpisah: blok `log` situs sudah mencakup jalur itu; saring dengan `grep "/api/webhooks/"` seperti di atas. Konfigurasi log per-jalur (named logger) sengaja **belum dibuat** agar tidak ada sintaks Caddy yang belum diuji di server. Perubahan Caddyfile apa pun wajib lewat PR (Caddyfile server = Caddyfile repository, §5).
- Status langkah pemeriksaan di atas: **dibuat, belum diuji** di server (tugas operator saat mengulang S7).

## 6. Yang HARUS dibuktikan di server (tertunda) — isi saat verifikasi
- [ ] Sertifikat HTTPS valid; HTTP → HTTPS; HSTS terbaca
- [ ] Cookie sesi di browser: `__Host-…`, Secure, HttpOnly, SameSite (screenshot disamarkan)
- [ ] Header keamanan terbaca dari luar; `X-Powered-By` tidak ada
- [ ] Pemindaian port dari luar: hanya 80/443 (dan 22 dari IP admin); 5432 tertutup
- [ ] Login + 2FA Super Admin berjalan lewat domain staging (Golden E2E G1 di staging, GATE B5)
- [ ] `TRUST_PROXY=true` + IP klien benar tercatat di audit; batas per-IP berfungsi
- [ ] Backup terjadwal berjalan; salinan di lokasi terpisah; restore drill di server (GATE B7)
- [ ] Image Docker berhasil dibangun di server dengan `scripts/build-staging-image.sh` (provenance dicatat) — **di CI sudah ada job "Image Docker"**; di server belum terbukti (T1-F03); Tahap 2: UID tetap 10001 + volume media dapat ditulis `app` dan `worker`
- [ ] Tahap 2: webhook Meta menjangkau Caddy → app (challenge + POST bertanda tangan); body ≤ 3 MB lewat proxy
