#!/usr/bin/env bash
# Drill backup & restore NYATA (CCP 1.7; audit ulang Gate 1 G1-A05): data contoh + MEDIA → backup terenkripsi (database dan media) → restore ke
# database dan direktori media TERPISAH → verifikasi data terbaca, pengaman tetap berlaku, konsistensi baris media ↔ berkas, dan MODE AMAN pasca-restore
# (kill switch global). Memakai skrip backup.sh/restore.sh yang sama dengan operasional. Tanpa data pelanggan. Tidak ada pengiriman pesan.
# Peluncur TypeScript: `node --import tsx` (bukan `npx tsx`) agar tidak bergantung pada IPC socket yang diblokir di sebagian lingkungan terbatas.
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
APW="${ADMIN_URL#*://postgres:}"; APW="${APW%%@*}"
flip_byte() { # $1=berkas $2=offset — balik semua bit satu byte (XOR 0xFF): berkas PASTI berubah (bukan menimpa dengan konstanta; lihat T3-F14)
  local orig; orig=$(dd if="$1" bs=1 skip="$2" count=1 2>/dev/null | od -An -tu1 | tr -d ' \n')
  printf "$(printf '\\%03o' $(( orig ^ 255 )))" | dd of="$1" bs=1 seek="$2" conv=notrunc 2>/dev/null
}
tree_hash() { ( cd "$1" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum | sha256sum | cut -d' ' -f1 ); }
dst_tables() { PGPASSWORD="$APW" psql -h "$HOST" -p "$PORT" -U postgres -d "$DST" -qAt -c "select count(*) from pg_tables where schemaname = 'public'"; }
expect_rc() { # $1=kode yang diharapkan $2=pesan lulus $3=pesan gagal; sisanya = perintah
  local want="$1" ok="$2" bad="$3"; shift 3; local rc=0; "$@" >/dev/null 2>&1 || rc=$?
  [ "$rc" = "$want" ] && echo "   $ok ✔" || { echo "GAGAL: $bad (kode=$rc, diharapkan $want)"; exit 1; }
}
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
node --import tsx scripts/migrate.ts
node --import tsx scripts/seed-sample.ts
printf '%s' "$ADMIN_PW" | node --import tsx scripts/bootstrap-super-admin.ts --email "$ADMIN_EMAIL" --name "Admin Drill" --password-stdin

echo "== Menyiapkan MEDIA contoh (berkas + baris database yang konsisten)"
MEDIA_SRC="$WORK/media-src"; mkdir -p "$MEDIA_SRC/aa/bb" "$MEDIA_SRC/cc"; chmod -R go-rwx "$MEDIA_SRC"
head -c 2048 /dev/urandom > "$MEDIA_SRC/aa/bb/m1.bin"
head -c 4096 /dev/urandom > "$MEDIA_SRC/cc/m2.bin"
printf 'RAHASIA-MEDIA-DRILL-%s' "$(openssl rand -hex 8)" > "$MEDIA_SRC/cc/m3.txt"
sha_of() { sha256sum "$1" | cut -d' ' -f1; }
PGPASSWORD=$OWNER_PW psql -h "$HOST" -p "$PORT" -U teone_owner -d "$SRC" -qAt -v ON_ERROR_STOP=1 <<SQL
insert into contacts(display_name) values ('Kontak drill') returning id as contact_id \gset
select id as channel_id from channels order by name limit 1 \gset
insert into conversations(contact_id, channel_id) values (:'contact_id', :'channel_id') returning id as conv_id \gset
insert into messages(conversation_id, channel_id, direction, source, type, provider_message_id) values (:'conv_id', :'channel_id', 'masuk', 'pelanggan', 'image', 'wamid.drill.1') returning id as msg1 \gset
insert into messages(conversation_id, channel_id, direction, source, type, provider_message_id) values (:'conv_id', :'channel_id', 'masuk', 'pelanggan', 'image', 'wamid.drill.2') returning id as msg2 \gset
insert into messages(conversation_id, channel_id, direction, source, type, provider_message_id) values (:'conv_id', :'channel_id', 'masuk', 'pelanggan', 'document', 'wamid.drill.3') returning id as msg3 \gset
insert into media(message_id, channel_id, mime, sha256, size_bytes, storage_path, status) values (:'msg1', :'channel_id', 'image/png', '$(sha_of "$MEDIA_SRC/aa/bb/m1.bin")', 2048, 'aa/bb/m1.bin', 'tersimpan');
insert into media(message_id, channel_id, mime, sha256, size_bytes, storage_path, status) values (:'msg2', :'channel_id', 'image/png', '$(sha_of "$MEDIA_SRC/cc/m2.bin")', 4096, 'cc/m2.bin', 'tersimpan');
insert into media(message_id, channel_id, mime, sha256, size_bytes, storage_path, status) values (:'msg3', :'channel_id', 'application/pdf', '$(sha_of "$MEDIA_SRC/cc/m3.txt")', $(stat -c %s "$MEDIA_SRC/cc/m3.txt"), 'cc/m3.txt', 'tersimpan');
SQL
MEDIA_SRC_HASH="$(tree_hash "$MEDIA_SRC")"
echo "   3 baris media + 3 berkas (sumber)"
node --import tsx scripts/restore-verify.ts media "$MEDIA_SRC" | sed 's/^/   sumber: /'   # kontrol: sumber sendiri harus konsisten
node --import tsx scripts/restore-verify.ts counts > "$WORK/counts.json"
echo "   jumlah baris sumber: $(cat "$WORK/counts.json")"

echo "== BACKUP (media dulu → pg_dump; keduanya gpg AES-256 + sha256)"
openssl rand -base64 33 > "$WORK/backup.pass"; chmod 600 "$WORK/backup.pass"
t0=$(now)
BACKUP_FILE="$(PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$SRC BACKUP_PASSPHRASE_FILE="$WORK/backup.pass" BACKUP_DIR="$WORK/backups" MEDIA_DIR="$MEDIA_SRC" BACKUP_REQUIRE_MEDIA=1 bash scripts/backup.sh | tail -1)"
MEDIA_FILE="${BACKUP_FILE%.dump.gpg}.media.tar.gpg"
[ -s "$MEDIA_FILE" ] && [ -s "$MEDIA_FILE.sha256" ] || { echo "GAGAL: arsip media tidak terbentuk"; exit 1; }
t1=$(now)
SIZE=$(stat -c %s "$BACKUP_FILE")
echo "   berkas: $(basename "$BACKUP_FILE")  ukuran: ${SIZE} byte  izin: $(stat -c %a "$BACKUP_FILE")"
file_head="$(head -c 8 "$BACKUP_FILE" | od -An -tx1 | tr -d " \n")"
if grep -aq "PGDMP" "$BACKUP_FILE"; then echo "GAGAL: backup tidak terenkripsi"; exit 1; fi
if grep -aq "teone_owner\|drill-admin" "$BACKUP_FILE"; then echo "GAGAL: isi backup terbaca sebagai teks biasa"; exit 1; fi
echo "   terenkripsi: isi tidak terbaca sebagai teks/PGDMP (header: $file_head)"
if grep -aq "RAHASIA-MEDIA-DRILL\|ustar" "$MEDIA_FILE"; then echo "GAGAL: isi arsip media terbaca sebagai teks/tar biasa"; exit 1; fi
echo "   arsip media: $(basename "$MEDIA_FILE")  ukuran: $(stat -c %s "$MEDIA_FILE") byte  izin: $(stat -c %a "$MEDIA_FILE")  terenkripsi ✔"

echo "== Uji keamanan backup: passphrase salah & berkas rusak harus DITOLAK"
echo "salah-salah-salah" > "$WORK/wrong.pass"; chmod 600 "$WORK/wrong.pass"
if RESTORE_SKIP_MEDIA=1 PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$DST BACKUP_FILE="$BACKUP_FILE" BACKUP_PASSPHRASE_FILE="$WORK/wrong.pass" bash scripts/restore.sh >/dev/null 2>&1; then echo "GAGAL: passphrase salah diterima"; exit 1; else echo "   passphrase salah → ditolak ✔"; fi
cp "$BACKUP_FILE" "$WORK/corrupt.dump.gpg"
# Rusak SATU byte dengan membalik semua bitnya (XOR 0xFF) sehingga berkas PASTI berubah. Versi lama menimpa dengan konstanta 'X': ciphertext gpg
# acak, jadi dengan peluang 1/256 byte aslinya sudah 'X' → berkas tak berubah → restore lolos → CI merah palsu (ditemukan di CI run #13, Tahap 3).
orig_byte=$(dd if="$BACKUP_FILE" bs=1 skip=100 count=1 2>/dev/null | od -An -tu1 | tr -d ' \n')
printf "$(printf '\\%03o' $(( orig_byte ^ 255 )))" | dd of="$WORK/corrupt.dump.gpg" bs=1 seek=100 conv=notrunc 2>/dev/null
if cmp -s "$BACKUP_FILE" "$WORK/corrupt.dump.gpg"; then echo "GAGAL (uji): perusakan berkas tidak mengubah isinya"; exit 1; fi
cp "$BACKUP_FILE.sha256" "$WORK/corrupt.dump.gpg.sha256"; sed -i "s#  .*#  corrupt.dump.gpg#" "$WORK/corrupt.dump.gpg.sha256"
rc=0; PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$DST BACKUP_FILE="$WORK/corrupt.dump.gpg" BACKUP_PASSPHRASE_FILE="$WORK/backup.pass" bash scripts/restore.sh >/dev/null 2>&1 || rc=$?
[ "$rc" = "2" ] && echo "   berkas rusak → checksum menolak (exit 2) ✔" || { echo "GAGAL: berkas rusak tidak ditolak oleh checksum (rc=$rc)"; exit 1; }


echo "== Uji keamanan MEDIA: arsip rusak / direktori tujuan tidak kosong / kebijakan media tidak ditetapkan harus DITOLAK tanpa menyentuh apa pun"
NEG="$WORK/neg"; mkdir -p "$NEG"; cp "$BACKUP_FILE" "$BACKUP_FILE.sha256" "$MEDIA_FILE" "$MEDIA_FILE.sha256" "$NEG/"
NEG_DB="$NEG/$(basename "$BACKUP_FILE")"; NEG_MEDIA="$NEG/$(basename "$MEDIA_FILE")"
flip_byte "$NEG_MEDIA" 100
if cmp -s "$MEDIA_FILE" "$NEG_MEDIA"; then echo "GAGAL (uji): perusakan arsip media tidak mengubah isinya"; exit 1; fi
rs() { PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$DST BACKUP_PASSPHRASE_FILE="$WORK/backup.pass" env "$@" bash scripts/restore.sh; }
expect_rc 2 "arsip media rusak → checksum menolak (exit 2)" "arsip media rusak tidak ditolak" rs BACKUP_FILE="$NEG_DB" RESTORE_MEDIA_DIR="$NEG/m-out"
[ ! -e "$NEG/m-out" ] && [ "$(dst_tables)" = "0" ] || { echo "GAGAL: penolakan checksum media tetap menyentuh database/media"; exit 1; }
echo "   database tujuan tetap KOSONG dan direktori media tidak dibuat ✔"
mkdir -p "$NEG/m-nonempty"; echo x > "$NEG/m-nonempty/ada.txt"
expect_rc 3 "RESTORE_MEDIA_DIR tidak kosong → ditolak (exit 3), media yang ada tidak ditimpa" "direktori media tidak kosong tidak ditolak" rs BACKUP_FILE="$BACKUP_FILE" RESTORE_MEDIA_DIR="$NEG/m-nonempty"
expect_rc 3 "kebijakan media tidak ditetapkan → ditolak (exit 3), tidak ada pemulihan setengah-diam" "restore tanpa kebijakan media tidak ditolak" rs BACKUP_FILE="$BACKUP_FILE"
[ "$(dst_tables)" = "0" ] && [ "$(cat "$NEG/m-nonempty/ada.txt")" = "x" ] || { echo "GAGAL: penolakan tetap mengubah database/media"; exit 1; }
echo "   database tujuan tetap KOSONG; berkas yang ada tidak tersentuh ✔"

echo "== RESTORE ke database + direktori media terpisah ($DST) — MODE AMAN bawaan"
t2=$(now)
MEDIA_RESTORED="$WORK/media-restored"
PGHOST=$HOST PGPORT=$PORT PGUSER=teone_owner PGPASSWORD=$OWNER_PW PGDATABASE=$DST BACKUP_FILE="$BACKUP_FILE" BACKUP_PASSPHRASE_FILE="$WORK/backup.pass" RESTORE_MEDIA_DIR="$MEDIA_RESTORED" bash scripts/restore.sh
t3=$(now)

echo "== VERIFIKASI hasil restore"
export DATABASE_MIGRATION_URL="postgres://teone_owner:$OWNER_PW@$HOST:$PORT/$DST"
export DATABASE_URL="postgres://teone_app:$APP_PW@$HOST:$PORT/$DST"
export DRILL_ADMIN_EMAIL="$ADMIN_EMAIL" DRILL_ADMIN_PASSWORD="$ADMIN_PW"
RESTORE_EXPECT_SAFE_MODE=1 node --import tsx scripts/restore-verify.ts verify "$WORK/counts.json" | tee "$WORK/verify.txt"
[ "$(tree_hash "$MEDIA_RESTORED")" = "$MEDIA_SRC_HASH" ] && echo "✔ pohon berkas media hasil restore IDENTIK dengan sumber (SHA-256 seluruh berkas)" | tee -a "$WORK/verify.txt" || { echo "GAGAL: media hasil restore berbeda dari sumber"; exit 1; }
node --import tsx scripts/restore-verify.ts media "$MEDIA_RESTORED" | tee -a "$WORK/verify.txt"
# Kontrol NEGATIF: pemeriksa konsistensi harus benar-benar menangkap berkas hilang dan berkas rusak (bukan lulus buta).
cp -a "$MEDIA_RESTORED" "$WORK/media-bad1"; rm "$WORK/media-bad1/cc/m2.bin"
cp -a "$MEDIA_RESTORED" "$WORK/media-bad2"; chmod u+w "$WORK/media-bad2/aa/bb/m1.bin"; flip_byte "$WORK/media-bad2/aa/bb/m1.bin" 10
expect_rc 1 "pemeriksa media menangkap berkas HILANG (kontrol negatif)" "pemeriksa media meloloskan berkas hilang" node --import tsx scripts/restore-verify.ts media "$WORK/media-bad1"
expect_rc 1 "pemeriksa media menangkap berkas RUSAK/berubah (kontrol negatif)" "pemeriksa media meloloskan berkas rusak" node --import tsx scripts/restore-verify.ts media "$WORK/media-bad2"

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
