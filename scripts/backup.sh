#!/usr/bin/env bash
# Backup TE One: (1) arsip MEDIA (bila MEDIA_DIR ada) lalu (2) database pg_dump (format custom) — masing-masing dienkripsi AES-256
# (gpg simetris, ber-integritas MDC) + checksum SHA-256. Kredensial lewat variabel libpq (PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE) — TIDAK lewat argumen.
# Passphrase dibaca dari BERKAS (BACKUP_PASSPHRASE_FILE, chmod 600, disimpan TERPISAH dari server database & repository).
# Pemakaian: BACKUP_PASSPHRASE_FILE=/etc/teone/backup.pass BACKUP_DIR=/var/backups/teone MEDIA_DIR=/var/lib/teone/media scripts/backup.sh
# Keluaran: jalur berkas database .dump.gpg (baris TERAKHIR stdout). Arsip media bernama <nama>.media.tar.gpg di folder yang sama (jalurnya dicetak ke stderr).
# URUTAN disengaja: media DULU, database sesudahnya — setiap baris `media` yang ada di dump punya berkas yang sudah masuk arsip (berkas ditulis sebelum barisnya).
# Berkas media yang tertulis sesudah arsip hanya "yatim" (tanpa baris) dan tidak merusak konsistensi.
# BACKUP_REQUIRE_MEDIA=1 → gagal bila MEDIA_DIR tidak ada (disarankan di production setelah Tahap 2 menerima media).
set -euo pipefail
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE wajib diisi}"
: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"
: "${PGDATABASE:?PGDATABASE wajib diisi}"
[ -s "$BACKUP_PASSPHRASE_FILE" ] || { echo "Passphrase kosong/tidak ada" >&2; exit 1; }
mode="$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE")"
[ "$mode" = "600" ] || [ "$mode" = "400" ] || { echo "Izin berkas passphrase harus 600/400 (sekarang $mode)" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/${PGDATABASE}-${stamp}.dump.gpg"
media_out="$BACKUP_DIR/${PGDATABASE}-${stamp}.media.tar.gpg"

encrypt() { gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-fd 3 --output "$1" 3< "$BACKUP_PASSPHRASE_FILE"; }
checksum() { ( cd "$BACKUP_DIR" && sha256sum "$(basename "$1")" > "$(basename "$1").sha256" ); chmod 600 "$1" "$1.sha256"; }

# 1) MEDIA (privat; hanya berkas — metadata ada di database). Pemilik/izin dinormalkan agar dapat dipulihkan di mesin lain.
if [ -n "${MEDIA_DIR:-}" ] && [ -d "$MEDIA_DIR" ]; then
  tar --create --file=- --directory="$MEDIA_DIR" --sort=name --owner=0 --group=0 --numeric-owner . | encrypt "$media_out"
  checksum "$media_out"
  echo "media dicadangkan: $media_out" >&2
elif [ "${BACKUP_REQUIRE_MEDIA:-0}" = "1" ]; then
  echo "BACKUP_REQUIRE_MEDIA=1 tetapi MEDIA_DIR '${MEDIA_DIR:-}' tidak ditemukan — dibatalkan" >&2; exit 1
else
  echo "PERINGATAN: media TIDAK dicadangkan (MEDIA_DIR '${MEDIA_DIR:-}' belum diatur/tidak ada). Bila sudah ada media pelanggan, backup ini TIDAK lengkap." >&2
fi

# 2) DATABASE. --no-owner/--no-acl: dapat dipulihkan ke lingkungan lain; hak runtime diterapkan ulang oleh db/grants.sql saat restore.
pg_dump --format=custom --no-owner --no-acl --compress=6 | encrypt "$out"
checksum "$out"
echo "$out"
