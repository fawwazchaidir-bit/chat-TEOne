#!/usr/bin/env bash
# Restore backup terenkripsi ke database TUJUAN yang sudah ada dan KOSONG (dibuat oleh pemanggil).
# Kredensial tujuan lewat PG* (role pemilik). Pemakaian:
#   BACKUP_FILE=… BACKUP_PASSPHRASE_FILE=… PGDATABASE=teone_restore_check scripts/restore.sh
# Restore TIDAK menjalankan aplikasi: tidak ada pesan/follow-up yang dapat terkirim (CCP 7.6/8.3 diuji ulang di tahap berikutnya).
set -euo pipefail
: "${BACKUP_FILE:?BACKUP_FILE wajib diisi}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE wajib diisi}"
: "${PGDATABASE:?PGDATABASE wajib diisi}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$BACKUP_FILE.sha256" ]; then
  ( cd "$(dirname "$BACKUP_FILE")" && sha256sum --check --status "$(basename "$BACKUP_FILE").sha256" ) \
    || { echo "CHECKSUM TIDAK COCOK — backup rusak/diubah; restore dibatalkan" >&2; exit 2; }
fi

gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 "$BACKUP_FILE" 3< "$BACKUP_PASSPHRASE_FILE" \
  | pg_restore --no-owner --no-acl --exit-on-error --dbname="$PGDATABASE"

# Terapkan ulang hak runtime minimum (aplikasi tidak boleh UPDATE/DELETE audit_log).
psql --quiet --set ON_ERROR_STOP=1 --dbname="$PGDATABASE" --file="$here/db/grants.sql"
echo "restore selesai → $PGDATABASE"
