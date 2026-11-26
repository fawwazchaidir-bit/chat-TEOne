# Runbook Fase 2 — operator VPS staging (copy-paste)

Tujuan: menutup temuan audit **G1-B01** (staging tak terikat commit) dan **G1-B03** (backup server), menyalakan worker (**A-4**), dan menyiapkan bukti untuk audit ulang Gate 1.
Disusun auditor dari `main` `0463559` (26 Nov 2026). **Belum pernah dijalankan di server** — jalankan berurutan; berhenti dan laporkan bila ada keluaran yang tidak sesuai "Harapan".

**Aturan:** tanpa `down -v`, tanpa menghapus volume, tanpa `db:migrate` (tidak ada migrasi baru sejak `9c297d3`), tanpa menyentuh Admisi/Hotline/Halo AI, tanpa menempel rahasia/passphrase ke chat atau repo. Waktu downtime ±1–2 menit di Langkah 5 — jalankan saat tidak ada uji kirim.

Bukti yang dikirim ke auditor: **teks keluaran** yang ditandai 📋 (tanpa isi pesan, tanpa rahasia).

---

## Langkah 0 — Variabel sesi (jalankan di setiap terminal baru)
```bash
export B=/var/backups/teone
export BUILD=/home/TEAdmin/teone-build
export DOMAIN=staging-chat.trilogikaedutama.id
export DB=$(sudo docker exec deploy-db-1 psql -U postgres -Atc "select datname from pg_database where not datistemplate and datname<>'postgres'")
echo "DB=[$DB]"
```
Harapan: `DB=[...]` berisi **satu** nama. Bila kosong atau lebih dari satu, berhenti dan laporkan.

## Langkah 1 — Prasyarat (baca-saja)
```bash
command -v gpg sha256sum tar flock >/dev/null && echo "alat host OK" || echo "ALAT HOST KURANG"
sudo docker exec deploy-db-1 sh -c 'command -v pg_dump >/dev/null && echo "pg_dump di DB OK"'
sudo docker exec deploy-app-1 tar --version | head -1
sudo ls -l /etc/teone/
```
Harapan: alat OK; `tar (GNU tar)`. Lihat apakah `/etc/teone/backup.pass` sudah ada (dari backup 26 Nov).

Bila **belum ada** passphrase:
```bash
sudo sh -c 'umask 077; head -c 32 /dev/urandom | base64 > /etc/teone/backup.pass'
sudo cat /etc/teone/backup.pass
```
Salin passphrase yang tampil ke **password manager** Anda (di luar VPS), lalu `clear`. Tanpa salinan ini backup tidak bisa dibuka bila VPS hilang. Jangan kirim ke chat.

## Langkah 2 — Pembungkus backup lewat docker (sekali)
DB staging tidak dibuka ke host, jadi `scripts/backup.sh` tidak bisa memanggil `pg_dump` langsung. Pembungkus ini menghasilkan **berkas berformat sama** (nama, enkripsi, `.sha256`) dan mengikuti kontrak `backup.sh` (baris terakhir = jalur dump), sehingga dipakai oleh `scripts/backup-rotate.sh` yang sudah diuji.
```bash
sudo tee /usr/local/sbin/teone-backup-docker.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
# TE One staging — backup via docker exec (DB tidak dipublikasikan ke host). Kontrak = scripts/backup.sh: media dulu, lalu DB; baris terakhir stdout = jalur .dump.gpg
set -euo pipefail
: "${BACKUP_DIR:?}"; : "${PGDATABASE:?}"; : "${BACKUP_PASSPHRASE_FILE:?}"
m=$(stat -c %a "$BACKUP_PASSPHRASE_FILE"); [ "$m" = 600 ] || [ "$m" = 400 ] || { echo "izin passphrase harus 600/400 (sekarang $m)" >&2; exit 1; }
umask 077; mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
st=$(date -u +%Y%m%dT%H%M%SZ); base="$BACKUP_DIR/$PGDATABASE-$st"
enc(){ gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-fd 3 --output "$1" 3< "$BACKUP_PASSPHRASE_FILE"; }
sum(){ ( cd "$BACKUP_DIR" && sha256sum "$(basename "$1")" > "$(basename "$1").sha256" ); chmod 600 "$1" "$1.sha256"; }
docker exec deploy-app-1 tar --create --file=- --directory=/data/media --sort=name --owner=0 --group=0 --numeric-owner . | enc "$base.media.tar.gpg"; sum "$base.media.tar.gpg"
echo "media dicadangkan: $base.media.tar.gpg" >&2
docker exec deploy-db-1 pg_dump -U postgres -d "$PGDATABASE" --format=custom --no-owner --no-acl --compress=6 | enc "$base.dump.gpg"; sum "$base.dump.gpg"
echo "$base.dump.gpg"
EOF
sudo chmod 750 /usr/local/sbin/teone-backup-docker.sh
```

## Langkah 3 — Titik pemulihan (sebelum mengubah apa pun)
```bash
P=/root/pemulihan-$(date +%Y%m%d); sudo mkdir -p $P && sudo chmod 700 $P
cd /home/TEAdmin/chat-TEOne && git diff | sudo tee $P/local.diff >/dev/null && sudo cp deploy/Caddyfile $P/Caddyfile.aktif
OLD=$(sudo docker inspect deploy-app-1 --format '{{.Image}}'); echo "$OLD" | sudo tee $P/image-lama.txt
sudo docker tag "$OLD" teone-app:rollback-$(date +%Y%m%d)
sudo env BACKUP_DIR=$B PGDATABASE=$DB BACKUP_PASSPHRASE_FILE=/etc/teone/backup.pass /usr/local/sbin/teone-backup-docker.sh
sudo bash -c "cd $B && ls -l && sha256sum --check *.sha256"
```
📋 Harapan: daftar berkas `…dump.gpg`, `…media.tar.gpg` + `.sha256`, dan semua `OK`.

## Langkah 4 — Uji restore terisolasi (tidak menyentuh DB staging)
```bash
ST=$(sudo ls -1 $B | grep -E "^$DB-[0-9T]+Z\.dump\.gpg$" | sort | tail -1); echo "berkas: $ST"; [ -n "$ST" ] || echo "BERHENTI: tidak ada .dump.gpg langsung di $B (cek: sudo find $B -type f)"
sudo docker network create --internal teone-restore-test
sudo docker run -d --name teone-restore-pg --network teone-restore-test -e POSTGRES_PASSWORD="$(head -c16 /dev/urandom | base64)" postgres:16
sleep 8; sudo docker exec teone-restore-pg createdb -U postgres restore_check
T0=$(date +%s)
sudo bash -c "gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt '$B/$ST' 3< /etc/teone/backup.pass" | sudo docker exec -i teone-restore-pg pg_restore -U postgres -d restore_check --no-owner --no-acl   # redirect 3< harus di dalam sudo (berkas passphrase milik root)
echo "durasi restore: $(( $(date +%s) - T0 )) dtk"
Q="select 'messages',count(*) from messages union all select 'inbound_events',count(*) from inbound_events union all select 'conversations',count(*) from conversations union all select 'audit_log',count(*) from audit_log union all select 'migrasi',count(*) from drizzle.__drizzle_migrations"
echo "== hasil restore";  sudo docker exec teone-restore-pg psql -U postgres -d restore_check -Atc "$Q"
echo "== staging asli";   sudo docker exec deploy-db-1     psql -U postgres -d "$DB"         -Atc "$Q"
sudo docker rm -f teone-restore-pg; sudo docker network rm teone-restore-test
```
📋 Harapan: tanpa galat; angka "hasil restore" = "staging asli" (selisih kecil hanya bila ada pesan masuk di antaranya); `migrasi|6`.

## Langkah 5 — Bangun image dari `main` bersih + pasang (dengan worker)
```bash
# 5a. Checkout bersih baru (checkout lama /home/TEAdmin/chat-TEOne TIDAK diubah)
git clone /home/TEAdmin/chat-TEOne $BUILD
git -C $BUILD remote set-url origin "$(git -C /home/TEAdmin/chat-TEOne remote get-url origin)"
git -C $BUILD fetch origin main && git -C $BUILD checkout --detach origin/main && git -C $BUILD log --oneline -1
# 5b. Build (menolak pohon kotor; mencetak PROVENANCE)
sudo git config --global --add safe.directory $BUILD
cd $BUILD && sudo bash scripts/build-staging-image.sh
```
📋 Salin seluruh blok **`== PROVENANCE`**.

```bash
# 5c. Konfigurasi non-rahasia (berkas di-ignore git)
SHORT=$(git -C $BUILD rev-parse --short=7 HEAD)
printf 'SITE_ADDRESS=%s\nTEONE_TAG=staging-%s\n' "$DOMAIN" "$SHORT" > $BUILD/deploy/.env
F="-p deploy --env-file /etc/teone/staging.env --env-file $BUILD/deploy/.env -f $BUILD/deploy/docker-compose.staging.yml"
sudo docker compose $F config | grep -E '^name:|image:|SITE_ADDRESS'
sudo docker volume ls --format '{{.Name}}' | grep -E 'pg_data|media_data|caddy_data'
```
Harapan: `name: deploy`; image `teone-app:staging-<SHORT>` dan `teone-tools:staging-<SHORT>`; `SITE_ADDRESS` = domain staging; volume hanya `deploy_pg_data`, `deploy_media_data`, `deploy_caddy_data`. **Bila tidak sesuai, berhenti.**

```bash
# 5d. Pasang (downtime singkat)
sudo docker compose $F up -d app caddy worker
sleep 20; sudo docker compose $F ps
sudo docker inspect deploy-app-1 --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
sudo docker compose $F logs --tail 20 worker
curl -s https://$DOMAIN/api/health; echo
sudo docker exec deploy-db-1 psql -U postgres -d "$DB" -Atc "select now(); select key, enabled from feature_flag_overrides order by key;"
```
📋 Harapan: app/caddy/worker/db `Up`; label revisi = SHA `main`; log worker tanpa `fatal`; health `{"status":"ok"}`; flag `inbox`=f, `ai_simulation`=f, `whatsapp_connector`=t. Lalu kirim **satu pesan uji dari …4062** ke …6319 dan pastikan tampil di TE One (webhook masih jalan).

**Mundur bila gagal:**
```bash
sed -i "s/^TEONE_TAG=.*/TEONE_TAG=rollback-$(date +%Y%m%d)/" $BUILD/deploy/.env
sudo docker compose $F stop worker && sudo docker compose $F up -d app caddy
```
(Image lama ditandai `teone-app:rollback-<tanggal>` di Langkah 3; data tidak berubah karena tidak ada migrasi.)

## Langkah 6 — Salinan di luar VPS (D-12)
Pilih tujuan **di luar VPS dengan akun berbeda**. Contoh di bawah memakai Google Drive lewat `rclone`.
```bash
sudo apt-get install -y rclone
sudo rclone config --config /etc/teone/rclone.conf
```
Di wizard: `n` → nama `gdrive` → storage `drive` → client_id/secret kosong → scope `drive.file` → root_folder kosong → service account kosong → advanced `n` → auto config `n` (VPS tanpa browser): jalankan perintah `rclone authorize "drive" …` yang ditampilkan **di laptop** (perlu rclone di laptop), tempel token hasilnya → shared drive `n` → `y` → `q`.
```bash
sudo chmod 600 /etc/teone/rclone.conf
sudo rclone --config /etc/teone/rclone.conf mkdir gdrive:teone-staging-backup
sudo rclone --config /etc/teone/rclone.conf copy $B gdrive:teone-staging-backup --include "$DB-*"
# verifikasi di sisi tujuan: unduh balik lalu cek checksum
TMP=$(sudo mktemp -d); sudo rclone --config /etc/teone/rclone.conf copy gdrive:teone-staging-backup $TMP && sudo bash -c "cd $TMP && sha256sum --check *.sha256"; sudo rm -rf $TMP
```
📋 Harapan: semua `OK`. Atur retensi 7 hari di sisi Google Drive secara manual/berkala (skrip hanya memangkas salinan lokal).

## Langkah 7 — Backup terjadwal harian (D-12)
```bash
sudo tee /etc/teone/backup.env >/dev/null <<EOF
PGDATABASE=$DB
BACKUP_DIR=$B
BACKUP_PASSPHRASE_FILE=/etc/teone/backup.pass
BACKUP_KEEP=7
BACKUP_SCRIPT=/usr/local/sbin/teone-backup-docker.sh
BACKUP_OFFSITE_CMD='rclone --config /etc/teone/rclone.conf copy "\$BACKUP_DIR" gdrive:teone-staging-backup --include "\$(basename "\$BACKUP_DUMP_FILE" .dump.gpg)*"'
EOF
sudo chmod 600 /etc/teone/backup.env
echo "15 2 * * * root set -a; . /etc/teone/backup.env; set +a; $BUILD/scripts/backup-rotate.sh >> /var/log/teone-backup.log 2>&1" | sudo tee /etc/cron.d/teone-backup
# uji sekali sekarang
sudo bash -c "set -a; . /etc/teone/backup.env; set +a; $BUILD/scripts/backup-rotate.sh"; echo "kode keluar: $?"
```
📋 Harapan: `kode keluar: 0`. Kode 4 = offsite gagal (backup lokal tetap ada); 5 = offsite belum diatur.

## Langkah 8 — Daftar periksa `docs/staging.md` §6
**Dari laptop** (bukan VPS):
```bash
curl -sI http://staging-chat.trilogikaedutama.id | head -3
curl -sI https://staging-chat.trilogikaedutama.id/login | grep -iE 'HTTP/|strict-transport|x-frame|x-content-type|content-security|x-powered-by'
nc -zv -w3 staging-chat.trilogikaedutama.id 5432; nc -zv -w3 staging-chat.trilogikaedutama.id 443
```
📋 Harapan: HTTP dialihkan ke HTTPS; `strict-transport-security` dan `x-frame-options` ada; **tidak** ada `x-powered-by`; port 5432 **gagal/timeout**, 443 berhasil.

**Di VPS:**
```bash
sudo ss -tlnp | grep -vE '127.0.0.1|::1'
```
📋 Harapan: yang terbuka ke luar hanya 80, 443, dan 22.

**Di browser (manual, G1 lewat HTTPS):**
1. Login Super Admin di `https://staging-chat.trilogikaedutama.id` → wajib kode 2FA sebelum masuk.
2. DevTools → Application → Cookies: nama cookie sesi diawali `__Host-`, centang **Secure**, **HttpOnly**, **SameSite**.
3. Buat pengguna uji dengan akses **hanya** ke satu channel; login sebagai dia → buka channel lain lewat menu **dan** lewat URL langsung → harus **ditolak**.
4. Halaman Audit: baris login Anda mencatat **IP publik Anda** (bandingkan dengan https://ifconfig.me di laptop).

📋 Kirim hasil 1–4 sebagai teks ("ya/tidak" + catatan), tanpa tangkapan layar.

## Langkah 9 — Kirim ke auditor
Semua keluaran 📋 Langkah 3, 4, 5, 6, 7, 8. Setelah itu auditor menilai G1-B01/G1-B03 dan Gate 1.

---
**Catatan auditor (temuan kecil F2-01):** `scripts/backup.sh` mengasumsikan DB dapat dijangkau dari host; pada topologi staging (DB hanya di jaringan internal Docker) cron memerlukan pembungkus `teone-backup-docker.sh` di luar repo. Usulan: developer memindahkan mode `docker exec` ini ke repo (mis. `BACKUP_VIA_DOCKER=1` di `backup.sh`) dengan test, sekaligus F1-02 (enkripsi GPG kunci-publik) bila disetujui.
