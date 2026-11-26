#!/usr/bin/env bash
# Backup TE One: (1) arsip MEDIA (bila MEDIA_DIR ada) lalu (2) database pg_dump (format custom) — masing-masing dienkripsi AES-256
# (gpg simetris, ber-integritas MDC) + checksum SHA-256. Kredensial lewat variabel libpq (PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE) — TIDAK lewat argumen.
# Passphrase dibaca dari BERKAS (BACKUP_PASSPHRASE_FILE, chmod 600, disimpan TERPISAH dari server database & repository).
# Pemakaian: BACKUP_PASSPHRASE_FILE=/etc/teone/backup.pass BACKUP_DIR=/var/backups/teone MEDIA_DIR=/var/lib/teone/media scripts/backup.sh
# Keluaran: jalur berkas database .dump.gpg (baris TERAKHIR stdout). Arsip media bernama <nama>.media.tar.gpg di folder yang sama (jalurnya dicetak ke stderr).
# URUTAN disengaja: media DULU, database sesudahnya — setiap baris `media` yang ada di dump punya berkas yang sudah masuk arsip (berkas ditulis sebelum barisnya).
# Berkas media yang tertulis sesudah arsip hanya "yatim" (tanpa baris) dan tidak merusak konsistensi.
# BACKUP_REQUIRE_MEDIA=1 → gagal bila MEDIA_DIR tidak ada (disarankan di production setelah Tahap 2 menerima media).
#
# MODE DOCKER EXEC (F2-01; untuk VPS yang HANYA punya Docker — tanpa pg_dump/akses media di host): BACKUP_VIA_DOCKER=1
#   BACKUP_DB_CONTAINER   (wajib) nama kontainer PostgreSQL; `pg_dump` dijalankan DI DALAMNYA lewat `docker exec -i` (soket lokal; PGHOST/PGPORT diabaikan).
#                         PGUSER (opsional) diteruskan sebagai --username; PGPASSWORD (opsional) diteruskan SEBAGAI NAMA (-e PGPASSWORD) → nilainya tidak pernah muncul di argumen proses.
#   BACKUP_APP_CONTAINER  (wajib bila media dicadangkan) nama kontainer aplikasi yang memasang volume media; `tar` dijalankan di dalamnya.
#   MEDIA_DIR             pada mode ini = jalur DI DALAM kontainer aplikasi (mis. /data/media).
#   Keluaran IDENTIK dengan mode biasa: <db>-<stamp>.dump.gpg, <db>-<stamp>.media.tar.gpg, masing-masing + .sha256 (format `sha256sum`), dienkripsi di HOST
#   (passphrase tetap berkas di host, TIDAK pernah masuk kontainer). Format dump = pg_dump format custom dari PostgreSQL kontainer (restore: pg_restore dengan versi ≥ versi itu).
#   Gagal di tengah jalan → berkas yang dibuat run ini dihapus (tidak ada "set" parsial yang menggeser backup lama saat rotasi).
set -euo pipefail
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE wajib diisi}"
: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"
: "${PGDATABASE:?PGDATABASE wajib diisi}"
[ -s "$BACKUP_PASSPHRASE_FILE" ] || { echo "Passphrase kosong/tidak ada" >&2; exit 1; }
mode="$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE")"
[ "$mode" = "600" ] || [ "$mode" = "400" ] || { echo "Izin berkas passphrase harus 600/400 (sekarang $mode)" >&2; exit 1; }

VIA_DOCKER="${BACKUP_VIA_DOCKER:-0}"
case "$VIA_DOCKER" in 0|1) ;; *) echo "BACKUP_VIA_DOCKER harus 0 atau 1 (sekarang '$VIA_DOCKER') — dibatalkan" >&2; exit 2;; esac
valid_container() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; } # bukan opsi docker (tidak diawali '-') dan tanpa spasi/karakter tak lazim
if [ "$VIA_DOCKER" = 1 ]; then
  command -v docker >/dev/null 2>&1 || { echo "BACKUP_VIA_DOCKER=1 tetapi perintah 'docker' tidak ditemukan — dibatalkan" >&2; exit 2; }
  [ -n "${BACKUP_DB_CONTAINER:-}" ] || { echo "BACKUP_DB_CONTAINER wajib diisi pada BACKUP_VIA_DOCKER=1 — dibatalkan" >&2; exit 2; }
  valid_container "$BACKUP_DB_CONTAINER" || { echo "BACKUP_DB_CONTAINER tidak valid — dibatalkan" >&2; exit 2; }
  if [ -n "${BACKUP_APP_CONTAINER:-}" ]; then valid_container "$BACKUP_APP_CONTAINER" || { echo "BACKUP_APP_CONTAINER tidak valid — dibatalkan" >&2; exit 2; }; fi
  if [ -n "${MEDIA_DIR:-}" ] && [ -z "${BACKUP_APP_CONTAINER:-}" ]; then echo "MEDIA_DIR diisi pada mode Docker tetapi BACKUP_APP_CONTAINER kosong — dibatalkan (media tidak boleh dilewati diam-diam)" >&2; exit 2; fi
fi

umask 077
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/${PGDATABASE}-${stamp}.dump.gpg"
media_out="$BACKUP_DIR/${PGDATABASE}-${stamp}.media.tar.gpg"

created=(); finished=0
cleanup_partial() { [ "$finished" = 1 ] || { [ "${#created[@]}" -eq 0 ] || rm -f -- "${created[@]}"; }; }
trap cleanup_partial EXIT
encrypt() { gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-fd 3 --output "$1" 3< "$BACKUP_PASSPHRASE_FILE"; }
checksum() { ( cd "$BACKUP_DIR" && sha256sum "$(basename "$1")" > "$(basename "$1").sha256" ); chmod 600 "$1" "$1.sha256"; }

# 1) MEDIA (privat; hanya berkas — metadata ada di database). Pemilik/izin dinormalkan agar dapat dipulihkan di mesin lain.
media_exists() { if [ "$VIA_DOCKER" = 1 ]; then [ -n "${MEDIA_DIR:-}" ] && docker exec "$BACKUP_APP_CONTAINER" test -d "$MEDIA_DIR" >/dev/null 2>&1; else [ -n "${MEDIA_DIR:-}" ] && [ -d "$MEDIA_DIR" ]; fi; }
media_tar() { # opsi tar SAMA pada kedua mode → arsip berformat sama
  if [ "$VIA_DOCKER" = 1 ]; then docker exec "$BACKUP_APP_CONTAINER" tar --create --file=- --directory="$MEDIA_DIR" --sort=name --owner=0 --group=0 --numeric-owner .
  else tar --create --file=- --directory="$MEDIA_DIR" --sort=name --owner=0 --group=0 --numeric-owner .; fi
}
db_dump() { # opsi pg_dump SAMA pada kedua mode
  if [ "$VIA_DOCKER" = 1 ]; then
    docker exec -i ${PGPASSWORD:+-e PGPASSWORD} "$BACKUP_DB_CONTAINER" pg_dump ${PGUSER:+--username "$PGUSER"} --dbname "$PGDATABASE" --format=custom --no-owner --no-acl --compress=6
  else pg_dump --format=custom --no-owner --no-acl --compress=6; fi
}

if media_exists; then
  created+=("$media_out" "$media_out.sha256")
  media_tar | encrypt "$media_out"
  checksum "$media_out"
  echo "media dicadangkan: $media_out" >&2
elif [ "${BACKUP_REQUIRE_MEDIA:-0}" = "1" ]; then
  echo "BACKUP_REQUIRE_MEDIA=1 tetapi MEDIA_DIR '${MEDIA_DIR:-}' tidak ditemukan — dibatalkan" >&2; exit 1
else
  echo "PERINGATAN: media TIDAK dicadangkan (MEDIA_DIR '${MEDIA_DIR:-}' belum diatur/tidak ada). Bila sudah ada media pelanggan, backup ini TIDAK lengkap." >&2
fi

# 2) DATABASE. --no-owner/--no-acl: dapat dipulihkan ke lingkungan lain; hak runtime diterapkan ulang oleh db/grants.sql saat restore.
created+=("$out" "$out.sha256")
db_dump | encrypt "$out"
checksum "$out"
finished=1
echo "$out"
