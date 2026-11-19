#!/usr/bin/env bash
# Backup database TE One: pg_dump (format custom) → dienkripsi AES-256 (gpg simetris, ber-integritas MDC) → checksum.
# Kredensial lewat variabel libpq (PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE) — TIDAK lewat argumen perintah.
# Passphrase dibaca dari BERKAS (BACKUP_PASSPHRASE_FILE, chmod 600, disimpan TERPISAH dari server database & repository).
# Pemakaian: BACKUP_PASSPHRASE_FILE=/etc/teone/backup.pass BACKUP_DIR=/var/backups/teone scripts/backup.sh
# Keluaran: jalur berkas .dump.gpg (baris terakhir stdout). Salinan di lokasi terpisah: lihat docs/backup-restore.md.
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

# --no-owner/--no-acl: dapat dipulihkan ke lingkungan lain; hak runtime diterapkan ulang oleh db/grants.sql saat restore.
pg_dump --format=custom --no-owner --no-acl --compress=6 \
  | gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 \
        --passphrase-fd 3 --output "$out" 3< "$BACKUP_PASSPHRASE_FILE"

( cd "$BACKUP_DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256" )
chmod 600 "$out" "$out.sha256"
echo "$out"
