#!/usr/bin/env bash
# Drill backup & restore NYATA (CCP 1.7): data contoh → backup terenkripsi → restore ke database TERPISAH →
# verifikasi data terbaca & pengaman tetap berlaku → catat waktu & hasil. Memakai skrip backup.sh/restore.sh yang sama
# dengan operasional. Tanpa data pelanggan. Tidak ada pengiriman pesan (Tahap 1 tidak memiliki konektor).
# Env: TEST_ADMIN_DATABASE_URL (superuser DB uji lokal/CI) # secret-scan:allow — contoh DB uji sekali pakai
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN_URL="${TEST_ADMIN_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}" # secret-scan:allow — DB uji sekali pakai
HOSTPORT="$(echo "$ADMIN_URL" | sed -E 's#^[a-z]+://[^@]+@([^/]+)/.*#\1#')"
HOST="${HOSTPORT%%:*}"; PORT="${HOSTPORT##*:}"; [ "$PORT" = "$HOSTPORT" ] && PORT=5432
SRC=teone_drill_src; DST=teone_drill_restore
OWNER_PW=drill_owner_pw; APP_PW=drill_app_pw           # database drill sekali pakai; bukan rahasia nyata
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT; chmod 700 "$WORK"
ADMIN_EMAIL="drill-admin@contoh.test"; ADMIN_PW="Sandi-Drill-Backup-Restore-1"
now() { date +%s.%N; }
admin_psql() { PGPASSWORD="${ADMIN_URL#*://postgres:}"; PGPASSWORD="${PGPASSWORD%%@*}" psql -h "$HOST" -p "$PORT" -U postgres -d postgres -qAt -v ON_ERROR_STOP=1 "$@"; }

echo "== Menyiapkan database sumber ($SRC) dari NOL"
for db in $SRC $DST; do admin_psql -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"; done
admin_psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='teone_owner') THEN CREATE ROLE teone_owner LOGIN PASSWORD '$OWNER_PW'; ELSE ALTER ROLE teone_owner PASSWORD '$OWNER_PW'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='teone_app') THEN CREATE ROLE teone_app LOGIN PASSWORD '$APP_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE; ELSE ALTER ROLE teone_app PASSWORD '$APP_PW'; END IF; END \$\$;"
for db in $SRC $DST; do
  admin_psql -c "CREATE DATABASE $db OWNER teone_owner"
  PGPASSWORD="${ADMIN_URL#*://postgres:}"; PGPASSWORD="${PGPASSWORD%%@*}" psql -h "$HOST" -p "$PORT" -U postgres -d "$db" -qAt -c "REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO teone_owner; GRANT USAGE ON SCHEMA public TO teone_app;"
done

export APP_ENV=development APP_BASE_URL=http://localhost:3000 TRUST_PROXY=false
export APP_ENCRYPTION_KEY="$(openssl rand -base64 32)"   # kunci drill acak, hanya di memori proses ini
export DATABASE_MIGRATION_URL="postgres://teone_owner:$OWNER_PW@$HOST:$PORT/$SRC"
export DATABASE_URL="postgres://teone_app:$APP_PW@$HOST:$PORT/$SRC"
npx tsx scripts/migrate.ts
npx tsx scripts/seed-sample.ts
printf '%s' "$ADMIN_PW" | npx tsx scripts/bootstrap-super-admin.ts --email "$ADMIN_EMAIL" --name "Admin Drill" --password-stdin
npx tsx scripts/restore-verify.ts counts > "$WORK/counts.json"
echo "   jumlah baris sumber: $(cat "$WORK/counts.json")"

echo "== BACKUP (pg_dump → gpg AES-256 → sha256)"
openssl rand -base64 33 > "$WORK/backup.pass"; chmod 600 "$WORK/backup.pass"
t0=$(now)
BACKUP_FILE="$(PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$SRC BACKUP_PASSPHRASE_FILE="$WORK/backup.pass" BACKUP_DIR="$WORK/backups" bash scripts/backup.sh | tail -1)"
t1=$(now)
SIZE=$(stat -c %s "$BACKUP_FILE")
echo "   berkas: $(basename "$BACKUP_FILE")  ukuran: ${SIZE} byte  izin: $(stat -c %a "$BACKUP_FILE")"
file_head="$(head -c 8 "$BACKUP_FILE" | od -An -tx1 | tr -d " \n")"
if grep -aq "PGDMP" "$BACKUP_FILE"; then echo "GAGAL: backup tidak terenkripsi"; exit 1; fi
if grep -aq "teone_owner\|drill-admin" "$BACKUP_FILE"; then echo "GAGAL: isi backup terbaca sebagai teks biasa"; exit 1; fi
echo "   terenkripsi: isi tidak terbaca sebagai teks/PGDMP (header: $file_head)"

echo "== Uji keamanan backup: passphrase salah & berkas rusak harus DITOLAK"
echo "salah-salah-salah" > "$WORK/wrong.pass"; chmod 600 "$WORK/wrong.pass"
if PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$DST BACKUP_FILE="$BACKUP_FILE" BACKUP_PASSPHRASE_FILE="$WORK/wrong.pass" bash scripts/restore.sh >/dev/null 2>&1; then echo "GAGAL: passphrase salah diterima"; exit 1; else echo "   passphrase salah → ditolak ✔"; fi
cp "$BACKUP_FILE" "$WORK/corrupt.dump.gpg"
# Rusak SATU byte dengan membalik semua bitnya (XOR 0xFF) sehingga berkas PASTI berubah. Versi lama menimpa dengan konstanta 'X': ciphertext gpg
# acak, jadi dengan peluang 1/256 byte aslinya sudah 'X' → berkas tak berubah → restore lolos → CI merah palsu (ditemukan di CI run #13, Tahap 3).
orig_byte=$(dd if="$BACKUP_FILE" bs=1 skip=100 count=1 2>/dev/null | od -An -tu1 | tr -d ' \n')
printf "$(printf '\\%03o' $(( orig_byte ^ 255 )))" | dd of="$WORK/corrupt.dump.gpg" bs=1 seek=100 conv=notrunc 2>/dev/null
if cmp -s "$BACKUP_FILE" "$WORK/corrupt.dump.gpg"; then echo "GAGAL (uji): perusakan berkas tidak mengubah isinya"; exit 1; fi
cp "$BACKUP_FILE.sha256" "$WORK/corrupt.dump.gpg.sha256"; sed -i "s#  .*#  corrupt.dump.gpg#" "$WORK/corrupt.dump.gpg.sha256"
rc=0; PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$DST BACKUP_FILE="$WORK/corrupt.dump.gpg" BACKUP_PASSPHRASE_FILE="$WORK/backup.pass" bash scripts/restore.sh >/dev/null 2>&1 || rc=$?
[ "$rc" = "2" ] && echo "   berkas rusak → checksum menolak (exit 2) ✔" || { echo "GAGAL: berkas rusak tidak ditolak oleh checksum (rc=$rc)"; exit 1; }

echo "== RESTORE ke database terpisah ($DST)"
t2=$(now)
PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$DST BACKUP_FILE="$BACKUP_FILE" BACKUP_PASSPHRASE_FILE="$WORK/backup.pass" bash scripts/restore.sh
t3=$(now)

echo "== VERIFIKASI hasil restore"
export DATABASE_MIGRATION_URL="postgres://teone_owner:$OWNER_PW@$HOST:$PORT/$DST"
export DATABASE_URL="postgres://teone_app:$APP_PW@$HOST:$PORT/$DST"
export DRILL_ADMIN_EMAIL="$ADMIN_EMAIL" DRILL_ADMIN_PASSWORD="$ADMIN_PW"
npx tsx scripts/restore-verify.ts verify "$WORK/counts.json" | tee "$WORK/verify.txt"

BK=$(awk "BEGIN{printf \"%.2f\", $t1-$t0}"); RS=$(awk "BEGIN{printf \"%.2f\", $t3-$t2}")
mkdir -p .test-results
{
  echo "# Hasil drill backup & restore"
  echo; echo "- Waktu backup (dump+enkripsi+checksum): ${BK} detik"
  echo "- Waktu restore (checksum+dekripsi+pg_restore+hak): ${RS} detik"
  echo "- Ukuran backup terenkripsi: ${SIZE} byte"
  echo "- PostgreSQL: $(admin_psql -c 'show server_version')"
  echo; echo '```'; cat "$WORK/verify.txt"; echo '```'
} > .test-results/backup-restore-drill.md
echo; echo "== SELESAI: backup ${BK}s, restore ${RS}s — semua verifikasi lulus"
for db in $SRC $DST; do admin_psql -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"; done
