#!/usr/bin/env bash
# Restore backup terenkripsi ke database TUJUAN yang sudah ada dan KOSONG (dibuat oleh pemanggil), plus media bila ada arsipnya.
# Kredensial tujuan lewat PG* (role pemilik). Pemakaian:
#   BACKUP_FILE=…dump.gpg BACKUP_PASSPHRASE_FILE=… PGDATABASE=teone_restore_check RESTORE_MEDIA_DIR=/tmp/media-restore scripts/restore.sh
# Aturan:
#  • SEMUA checksum diverifikasi SEBELUM menyentuh database atau media; checksum tidak cocok → exit 2 (tidak ada yang berubah).
#  • Bila ada arsip media (<nama>.media.tar.gpg), WAJIB menetapkan RESTORE_MEDIA_DIR (kosong/belum ada) ATAU RESTORE_SKIP_MEDIA=1 (sadar
#    memulihkan database saja). Tidak ada pemulihan setengah-diam: salah satunya tidak ada → exit 3, tidak ada yang berubah.
#  • Restore TIDAK menjalankan aplikasi/worker. MODE AMAN (bawaan, RESTORE_SAFE_MODE=1): setelah restore, kill switch GLOBAL dinyalakan dan dicatat di
#    audit log, sehingga aplikasi yang kemudian dinyalakan di atas data ini TIDAK dapat mengirim otomatis sebelum ditinjau dan dilepas MANUAL oleh
#    pengguna berizin. RESTORE_SAFE_MODE=0 hanya untuk uji kesetiaan data (drill) — jangan dipakai untuk pemulihan sungguhan.
#  • Jangan mengarahkan restore ke database yang dipakai instans aplikasi yang sedang berjalan, dan jangan mengisi META_ACCESS_TOKEN pada instans uji.
set -euo pipefail
: "${BACKUP_FILE:?BACKUP_FILE wajib diisi}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE wajib diisi}"
: "${PGDATABASE:?PGDATABASE wajib diisi}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
umask 077
media_file="${BACKUP_FILE%.dump.gpg}.media.tar.gpg"
[ "$media_file" != "$BACKUP_FILE" ] || media_file=""   # nama tidak berpola .dump.gpg → tidak ada pasangan media

# 1) Integritas: semua checksum dulu.
check_sum() { # $1 = berkas; hanya diperiksa bila ada berkas .sha256 di sampingnya
  [ -f "$1.sha256" ] || return 0
  ( cd "$(dirname "$1")" && sha256sum --check --status "$(basename "$1").sha256" ) || { echo "CHECKSUM TIDAK COCOK — $(basename "$1") rusak/diubah; restore dibatalkan" >&2; exit 2; }
}
check_sum "$BACKUP_FILE"
[ -n "$media_file" ] && [ -f "$media_file" ] && check_sum "$media_file"

# 2) Kebijakan media: ditetapkan SEBELUM menyentuh apa pun.
restore_media=0
if [ -n "$media_file" ] && [ -f "$media_file" ]; then
  if [ -n "${RESTORE_MEDIA_DIR:-}" ]; then
    if [ -e "$RESTORE_MEDIA_DIR" ] && { [ ! -d "$RESTORE_MEDIA_DIR" ] || [ -n "$(ls -A "$RESTORE_MEDIA_DIR")" ]; }; then
      echo "RESTORE_MEDIA_DIR '$RESTORE_MEDIA_DIR' tidak kosong/bukan direktori — dibatalkan (tidak menimpa media yang ada)" >&2; exit 3
    fi
    restore_media=1
  elif [ "${RESTORE_SKIP_MEDIA:-0}" = "1" ]; then
    echo "PERINGATAN: arsip media ada tetapi RESTORE_SKIP_MEDIA=1 — media TIDAK dipulihkan (baris media di database akan menunjuk berkas yang tidak ada)" >&2
  else
    echo "Ada arsip media ($(basename "$media_file")): tetapkan RESTORE_MEDIA_DIR (direktori kosong) atau RESTORE_SKIP_MEDIA=1 — dibatalkan" >&2; exit 3
  fi
fi

# 3) Database.
gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 "$BACKUP_FILE" 3< "$BACKUP_PASSPHRASE_FILE" \
  | pg_restore --no-owner --no-acl --exit-on-error --dbname="$PGDATABASE"

# Terapkan ulang hak runtime minimum (aplikasi tidak boleh UPDATE/DELETE audit_log).
psql --quiet --set ON_ERROR_STOP=1 --dbname="$PGDATABASE" --file="$here/db/grants.sql"

# 4) Media (ke direktori TERPISAH; tidak pernah menimpa).
if [ "$restore_media" = "1" ]; then
  mkdir -p "$RESTORE_MEDIA_DIR"; chmod 700 "$RESTORE_MEDIA_DIR"
  gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 "$media_file" 3< "$BACKUP_PASSPHRASE_FILE" \
    | tar --extract --directory="$RESTORE_MEDIA_DIR" --no-same-owner --no-same-permissions
  echo "media dipulihkan → $RESTORE_MEDIA_DIR ($(find "$RESTORE_MEDIA_DIR" -type f | wc -l | tr -d ' ') berkas)"
fi

# 5) MODE AMAN: kill switch global menyala + jejak audit. Dilepas hanya oleh manusia berizin lewat aplikasi (teraudit).
if [ "${RESTORE_SAFE_MODE:-1}" = "1" ]; then
  psql --quiet --set ON_ERROR_STOP=1 --dbname="$PGDATABASE" <<'SQL'
BEGIN;
INSERT INTO kill_switches (scope_type, scope_ref, engaged, reason, engaged_at, updated_at)
VALUES ('global', '', true, 'Pasca-restore: otomatisasi dihentikan sampai data ditinjau; lepas MANUAL oleh pengguna berizin', now(), now())
ON CONFLICT (scope_type, scope_ref) DO UPDATE
  SET engaged = true, reason = EXCLUDED.reason, engaged_at = now(), updated_at = now(), released_by = NULL, released_at = NULL;
INSERT INTO audit_log (actor_label, action, result, object_type, object_id, metadata)
VALUES ('sistem:restore', 'restore.safe_mode', 'success', 'kill_switch', 'global:', '{"efek":"kill switch global dinyalakan setelah restore"}'::jsonb);
COMMIT;
SQL
  echo "MODE AMAN: kill switch GLOBAL menyala di $PGDATABASE — lepas manual setelah data ditinjau"
fi
echo "restore selesai → $PGDATABASE"
