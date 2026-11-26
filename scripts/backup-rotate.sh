#!/usr/bin/env bash
# Backup TERJADWAL TE One (D-12, staging): jalankan scripts/backup.sh → simpan N backup terakhir (bawaan 7) → salin ke tujuan DI LUAR VPS
# lewat perintah yang dikonfigurasi (BACKUP_OFFSITE_CMD). TIDAK ada kredensial di repository: kredensial PG*, passphrase, dan konfigurasi tujuan
# offsite (mis. rclone.conf / kunci SSH) berada di berkas env/konfigurasi di server, di luar repository.
#
# Env:
#   BACKUP_DIR (wajib)  PGDATABASE (wajib)  BACKUP_PASSPHRASE_FILE, PG*, MEDIA_DIR, BACKUP_REQUIRE_MEDIA — diteruskan ke backup.sh
#   BACKUP_KEEP         jumlah SET backup yang disimpan (bawaan 7; bilangan bulat ≥ 1). Satu set = .dump.gpg + .media.tar.gpg + masing-masing .sha256
#   BACKUP_OFFSITE_CMD  perintah (dijalankan `bash -c`) yang menyalin set BARU ke luar VPS. Menerima env: BACKUP_DIR, BACKUP_STAMP, BACKUP_DUMP_FILE,
#                       BACKUP_FILES (jalur absolut berkas set baru, dipisah spasi). Contoh: 'rclone copy --files-from-raw <(printf "%s\n" $BACKUP_FILES) / tujuan:teone-staging'
#                       atau 'scp $BACKUP_FILES backup@host-lain:/srv/teone-staging/'. Pemangkasan di sisi tujuan = kebijakan siklus-hidup di penyimpanan itu.
#   BACKUP_OFFSITE_OPTIONAL=1   izinkan TANPA offsite (hanya dev/drill). Tanpa ini, BACKUP_OFFSITE_CMD kosong = GAGAL (kode 5) — salinan di luar VPS wajib (D-12).
#   BACKUP_OFFSITE_TIMEOUT      detik (bawaan 3600)
#   BACKUP_SCRIPT       jalur backup.sh (bawaan: sebelah skrip ini; diganti hanya oleh uji)
#
# Invarian keamanan:
#   • Rotasi HANYA setelah backup baru sukses DAN checksum-nya cocok; backup gagal ⇒ tidak ada yang dihapus.
#   • Yang dihapus hanya berkas ber-pola persis `<PGDATABASE>-<stamp>.(dump.gpg|media.tar.gpg)[.sha256]` milik set yang lebih tua dari N terbaru;
#     berkas lain di BACKUP_DIR tidak disentuh. Set terbaru (yang baru dibuat) tidak pernah dihapus.
#   • Offsite gagal ⇒ kode keluar ≠ 0 dan backup lokal TETAP ADA.
#   • Dua eksekusi bersamaan dicegah (flock).
# Kode keluar: 0 sukses · 2 konfigurasi salah · 3 checksum backup baru tidak cocok · 4 offsite gagal · 5 offsite tidak dikonfigurasi · 6 sedang berjalan
#              · selain itu: kode dari backup.sh.
set -euo pipefail
: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"
: "${PGDATABASE:?PGDATABASE wajib diisi}"
KEEP="${BACKUP_KEEP:-7}"
case "$KEEP" in ''|*[!0-9]*) echo "BACKUP_KEEP harus bilangan bulat ≥ 1 (sekarang '$KEEP') — dibatalkan, tidak ada yang diubah" >&2; exit 2;; esac
KEEP=$((10#$KEEP)) # "00"/"007" dinormalkan: nilai 0 TIDAK boleh lolos (akan menghapus set terbaru)
[ "$KEEP" -ge 1 ] || { echo "BACKUP_KEEP harus ≥ 1 — dibatalkan, tidak ada yang diubah" >&2; exit 2; }
case "$PGDATABASE" in *[!A-Za-z0-9_.-]*|'') echo "PGDATABASE berisi karakter tak lazim — dibatalkan" >&2; exit 2;; esac
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$here/backup.sh}"
[ -f "$BACKUP_SCRIPT" ] || { echo "backup.sh tidak ditemukan: $BACKUP_SCRIPT" >&2; exit 2; }

umask 077
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup-rotate.lock"
flock -n 9 || { echo "backup-rotate sudah berjalan (kunci $BACKUP_DIR/.backup-rotate.lock) — dibatalkan" >&2; exit 6; }

# 1) Backup baru. Kode keluar backup.sh diteruskan; stdout-nya baris TERAKHIR = jalur berkas dump.
dump="$("$BACKUP_SCRIPT" | tail -n 1)"
[ -n "$dump" ] && [ -s "$dump" ] || { echo "backup.sh tidak menghasilkan berkas dump — rotasi dibatalkan" >&2; exit 1; }
stamp="${dump##*/}"; stamp="${stamp#"$PGDATABASE"-}"; stamp="${stamp%.dump.gpg}"
case "$stamp" in [0-9]*T[0-9]*Z) ;; *) echo "nama berkas dump tak terduga ($stamp) — rotasi dibatalkan" >&2; exit 1;; esac

# 2) Verifikasi checksum set baru SEBELUM menghapus apa pun.
new_files=("$dump" "$dump.sha256")
media="${dump%.dump.gpg}.media.tar.gpg"
[ -f "$media" ] && new_files+=("$media" "$media.sha256")
for f in "${new_files[@]}"; do [ -s "$f" ] || { echo "berkas set baru tidak ada/kosong: $(basename "$f") — rotasi dibatalkan" >&2; exit 3; }; done
( cd "$BACKUP_DIR" && sha256sum --check --status "$(basename "$dump").sha256" && { [ ! -f "$media.sha256" ] || sha256sum --check --status "$(basename "$media").sha256"; } ) \
  || { echo "CHECKSUM backup baru TIDAK cocok — rotasi dibatalkan, tidak ada yang dihapus" >&2; exit 3; }

# 3) Rotasi: simpan KEEP set terbaru (urut stamp), hapus set lebih tua (hanya berkas ber-pola persis).
db_re="${PGDATABASE//./\\.}" # satu-satunya karakter regex yang mungkin ada pada PGDATABASE (dibatasi [A-Za-z0-9_.-])
mapfile -t stamps < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "$PGDATABASE-*.dump.gpg" -o -name "$PGDATABASE-*.media.tar.gpg" \) -printf '%f\n' \
    | sed -E -n "s/^${db_re}-([0-9]{8}T[0-9]{6}Z)\.(dump|media\.tar)\.gpg$/\1/p" | sort -u -r
)
removed=0; kept=0; i=0
for s in "${stamps[@]}"; do
  i=$((i + 1))
  if [ "$i" -le "$KEEP" ]; then kept=$((kept + 1)); continue; fi
  for ext in dump.gpg dump.gpg.sha256 media.tar.gpg media.tar.gpg.sha256; do
    f="$BACKUP_DIR/$PGDATABASE-$s.$ext"
    [ -f "$f" ] && { rm -f -- "$f"; removed=$((removed + 1)); }
  done
done
echo "rotasi: set disimpan=$kept berkas-dihapus=$removed (BACKUP_KEEP=$KEEP)" >&2

# 4) Salinan di luar VPS.
offsite="skip"
if [ -n "${BACKUP_OFFSITE_CMD:-}" ]; then
  export BACKUP_DIR BACKUP_STAMP="$stamp" BACKUP_DUMP_FILE="$dump" BACKUP_FILES="${new_files[*]}"
  if timeout "${BACKUP_OFFSITE_TIMEOUT:-3600}" bash -c "$BACKUP_OFFSITE_CMD" >&2; then
    offsite="ok"
  else
    echo "GAGAL: salinan di luar VPS (BACKUP_OFFSITE_CMD kode keluar ≠ 0). Backup LOKAL tetap ada: $dump" >&2
    exit 4
  fi
elif [ "${BACKUP_OFFSITE_OPTIONAL:-0}" != "1" ]; then
  echo "GAGAL: BACKUP_OFFSITE_CMD belum dikonfigurasi — salinan di luar VPS WAJIB (D-12). Backup LOKAL tetap ada: $dump (BACKUP_OFFSITE_OPTIONAL=1 hanya untuk dev/drill)" >&2
  exit 5
fi
echo "backup-rotate selesai: stamp=$stamp offsite=$offsite" >&2
echo "$dump"
