# Backup & restore

## 1. Mekanisme (diimplementasikan)
| Langkah | Alat | Catatan |
|---|---|---|
| Media | `tar` direktori `MEDIA_DIR` → gpg AES-256 → `<nama>.media.tar.gpg` (`scripts/backup.sh`) | dibuat **SEBELUM** dump database, sehingga setiap baris `media` di dump punya berkas di arsip (berkas ditulis sebelum barisnya). `BACKUP_REQUIRE_MEDIA=1` → gagal bila `MEDIA_DIR` tidak ada; tanpa itu skrip **memperingatkan** bahwa backup tidak lengkap |
| Dump | `pg_dump --format=custom --no-owner --no-acl` (`scripts/backup.sh`) | kredensial lewat `PG*`, **bukan** argumen perintah |
| Enkripsi | `gpg --symmetric --cipher-algo AES256` (ber-integritas MDC) | passphrase dari **berkas** `chmod 600/400` (skrip menolak izin lain), disimpan **terpisah dari server DB** dan repository |
| Integritas | `sha256sum` (`.sha256` di samping **tiap** berkas) | `restore.sh` memverifikasi **semua** checksum **sebelum** menyentuh database/media; tidak cocok → exit 2, tidak ada yang berubah |
| Akses | direktori `700`, berkas `600` | — |
| Restore | `scripts/restore.sh` → DB tujuan **kosong & terpisah** → `db/grants.sql` diterapkan ulang → media ke `RESTORE_MEDIA_DIR` **kosong/belum ada** | bila ada arsip media, **wajib** `RESTORE_MEDIA_DIR` atau `RESTORE_SKIP_MEDIA=1` (sadar database saja); selain itu exit 3 — tidak ada pemulihan setengah-diam; media tidak pernah menimpa berkas yang ada |
| Mode aman | bawaan (`RESTORE_SAFE_MODE=1`) | setelah restore, **kill switch GLOBAL dinyalakan** + audit `restore.safe_mode`; aplikasi yang kemudian dinyalakan di atas data ini **tidak dapat mengirim otomatis** sampai pengguna berizin meninjau dan melepasnya (teraudit). `RESTORE_SAFE_MODE=0` hanya untuk uji kesetiaan data |
| Verifikasi | `node --import tsx scripts/restore-verify.ts verify|media` | jumlah baris, fungsi role aplikasi, hash sandi, append-only audit, trigger, migrasi, **konsistensi baris `media` ↔ berkas (ukuran + SHA-256)**, dan kode `checkAutomation` yang asli memblokir |

Yang ikut tercakup: seluruh skema (termasuk **trigger integritas**, riwayat migrasi `drizzle.__drizzle_migrations`, sekuens), data, dan **berkas media**.
**Kunci `APP_ENCRYPTION_KEY` TIDAK ada di backup** (sengaja). Tanpa kunci itu, TOTP hasil restore tidak dapat didekripsi ⇒ simpan kunci di pengelola rahasia terpisah; bila hilang, reset 2FA semua pengguna.

## 2. Hasil restore NYATA (CCP 1.7; audit ulang Gate 1 G1-A05) — lokal, PostgreSQL 16
Dijalankan: `bash scripts/backup-restore-drill.sh` (DB sumber dari **nol** → migrasi 0000–0005 → seed contoh → Super Admin lewat CLI → **3 baris + 3 berkas media** → backup DB+media → restore ke DB **dan direktori media** terpisah). Job CI "Drill backup & restore nyata" menjalankannya pada setiap push.

| Pemeriksaan | Hasil |
|---|---|
| Jumlah baris 33 tabel sama persis (+1 kill switch global, +1 audit "mode aman" yang **diharapkan**) | ✔ |
| Data terbaca oleh **role aplikasi** (`teone_app`); hash sandi Argon2id valid | ✔ |
| `audit_log` menerima INSERT; urutan ID **melanjutkan** sumber; tetap append-only untuk aplikasi (42501) dan pemilik (trigger) | ✔ |
| 10 trigger integritas + 6 migrasi ikut terpulihkan | ✔ |
| **Pohon berkas media hasil restore identik** dengan sumber (SHA-256 seluruh berkas); **3/3 baris media** punya berkas dengan ukuran + SHA-256 sama | ✔ |
| **MODE AMAN**: kill switch global menyala; audit `restore.safe_mode`; kode `checkAutomation` yang asli **memblokir** | ✔ |
| Backup DB dan arsip media **tidak terbaca** sebagai teks/`PGDMP`/tar; **passphrase salah ditolak**; **DB rusak** dan **arsip media rusak** ditolak checksum (exit 2) | ✔ |
| Kontrol negatif: arsip media rusak → database tujuan tetap **kosong** dan direktori media **tidak dibuat**; `RESTORE_MEDIA_DIR` tidak kosong → exit 3, berkas yang ada **tidak tersentuh**; kebijakan media tak ditetapkan → exit 3 | ✔ |
| Kontrol negatif pemeriksa media: berkas **hilang** dan berkas **berubah** keduanya tertangkap | ✔ |
| Waktu | backup ≈ 0,3 dtk, restore ≈ 0,6 dtk (data sangat kecil) |

**Batas bukti (jujur):** data sangat kecil — waktu **tidak representatif** untuk produksi; dijalankan di mesin pengembang/CI, **bukan di server staging**; salinan di lokasi terpisah belum dibuktikan; media sintetis. RPO/RTO: **D-12 belum dinilai** (usulan RPO ≤ 1 jam, RTO ≤ 4 jam kerja) — angka itu **bukan prestasi yang sudah terbukti**.

## 2b. Backup & restore di server staging — dinyatakan pemilik, 26 Nov 2026 (rincian belum diterima)
Pemilik menyatakan: backup server dibuat, **checksum berkas cocok** (pemeriksaan manual), dan **uji restore terisolasi** dilakukan; keduanya diverifikasi **secara independen oleh auditor** (menurut pemilik). **Belum ada** di repository: nama berkas/SHA/ukuran/versi migrasi/durasi, cakupan media, salinan di luar VPS, PIC, dan catatan auditor — lihat `docs/tahap-2/runbook-uji-m11.md` §3.5–§3.6. Status: **Dinyatakan pemilik — bukan "Terbukti nyata"**. Tidak mengubah D-12 (RPO/RTO) dan D-18 (retensi), yang tetap Terbuka.

## 3. Backup terjadwal — keputusan D-12 (26 Nov 2026): skrip siap; **pemasangan = tugas operator**
**Keputusan D-12 (Diputuskan, pemilik, 26 Nov 2026).** *Staging:* RPO ≤ 24 jam, RTO ≤ 1 hari kerja; backup **harian** terenkripsi (DB + media); simpan **7 hari**; salinan **di luar VPS**; uji restore **bulanan dan setiap migrasi**; pembuat ≠ pemeriksa; kunci terpisah dari VPS. *Production:* RPO ≤ 1 jam (backup harian + arsip WAL kontinu, mis. pgBackRest/WAL-G), RTO ≤ 4 jam kerja, diuji sebelum go-live — **dibangun di Tahap 7**; `pg_dump` harian saja **tidak cukup** untuk production.

**Skrip:** `scripts/backup-rotate.sh` memakai `backup.sh` yang sama → menyimpan `BACKUP_KEEP` set terakhir (bawaan **7**; satu set = dump + media + dua `.sha256`) → menyalin set baru ke luar VPS lewat `BACKUP_OFFSITE_CMD`. Invarian (diuji, `@tahap-1`): rotasi hanya setelah backup baru sukses **dan** checksum cocok; hanya berkas ber-pola persis yang dihapus; offsite gagal ⇒ kode keluar 4 dan backup lokal **tetap ada**; `BACKUP_OFFSITE_CMD` kosong ⇒ kode 5 (salinan di luar VPS wajib; `BACKUP_OFFSITE_OPTIONAL=1` hanya dev/drill); dua eksekusi bersamaan dicegah (`flock`, kode 6). Kode keluar: 0 sukses · 2 konfigurasi · 3 checksum baru tidak cocok · 4 offsite gagal · 5 offsite tidak dikonfigurasi · 6 sedang berjalan.

**Contoh pemasangan (operator; berkas di server, BUKAN di repository):**
```bash
# /etc/teone/backup.env  (root:root, chmod 600) — HANYA di server. Kredensial PG, jalur passphrase, dan perintah offsite ada di sini.
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=teone_owner
PGPASSWORD=<dari pengelola rahasia>          # tidak pernah di repository
PGDATABASE=<nama-database-staging>
BACKUP_PASSPHRASE_FILE=/etc/teone/backup.pass   # chmod 600; salinan passphrase di brankas terpisah
BACKUP_DIR=/var/backups/teone
MEDIA_DIR=/var/lib/docker/volumes/deploy_media_data/_data   # jalur volume media (periksa dengan `docker volume inspect deploy_media_data`)
BACKUP_REQUIRE_MEDIA=1
BACKUP_KEEP=7
# Tujuan di luar VPS (akun/penyimpanan berbeda). Kredensial tujuan ada di konfigurasi alat itu (mis. /etc/teone/rclone.conf, chmod 600).
BACKUP_OFFSITE_CMD='rclone --config /etc/teone/rclone.conf copy "$BACKUP_DIR" tujuan:teone-staging --include "$(basename "$BACKUP_DUMP_FILE" .dump.gpg)*"'
```
```cron
# /etc/cron.d/teone-backup — harian 02:15 (di luar jam ramai). Pengguna `root`: perlu membaca volume dan /etc/teone.
15 2 * * *  root  set -a; . /etc/teone/backup.env; set +a; /opt/teone/chat-TEOne/scripts/backup-rotate.sh >> /var/log/teone-backup.log 2>&1
```
`pg_dump`/`psql` harus dapat menjangkau database (DB staging tidak dipublikasikan ke host: jalankan dari kontainer/jaringan yang sama, atau lewat `docker exec` seperti di `docs/tahap-2/runbook-uji-m11.md` §3). Pantau `/var/log/teone-backup.log` dan **kode keluar ≠ 0** (alarm); catat hasil sebagai teks.
- **Uji restore berkala (D-12):** bulanan dan setelah setiap migrasi, ke DB/direktori **terpisah** (`scripts/restore.sh`, bukan DB staging); pemeriksa ≠ pembuat; catat artefak teks (nama berkas, SHA-256, ukuran, versi migrasi, durasi, hitungan baris).
- **Retensi di tujuan offsite** (7 hari, D-12/D-18) = kebijakan siklus-hidup di penyimpanan tujuan; skrip hanya memangkas salinan **lokal**.
- **Celah yang dilaporkan, TIDAK diubah diam-diam:** D-12 meminta *kunci terpisah dari VPS*, sedangkan enkripsi simetris `backup.sh` membaca passphrase dari berkas di VPS agar cron dapat berjalan. Opsi: enkripsi kunci-publik GPG (VPS hanya menyimpan kunci publik; kunci privat untuk restore di luar VPS). Belum dikerjakan — butuh keputusan lingkup.

## 4. Backup media — diimplementasikan; yang belum
**Sudah (skrip + drill):** arsip media terenkripsi + checksum, restore ke direktori terpisah, verifikasi baris↔berkas. Media pelanggan disimpan **privat** di `MEDIA_DIR` (hanya metadata di database; diakses lewat endpoint yang memeriksa izin).
**Belum (butuh server/keputusan):** jadwal otomatis; salinan di lokasi terpisah; **arsip penuh setiap kali tidak efisien** untuk volume besar — bila media membesar, ganti ke sinkronisasi inkremental terenkripsi (mis. `restic`/`age`) dengan **urutan yang sama** (media dulu, database sesudahnya); retensi media (D-18). Uji pada volume dan waktu yang **mewakili penggunaan nyata** (belum ada).

## 5. Larangan operasional
Jangan menyimpan backup atau passphrase di repository, di server yang sama sebagai satu-satunya salinan, atau di chat/email/screenshot. Jangan melakukan restore ke database yang dipakai aplikasi yang dapat mengirim pesan, dan jangan mengisi `META_ACCESS_TOKEN` pada instans uji. **Mode aman bawaan** (kill switch global menyala setelah restore) melindungi dari pengiriman otomatis tak sengaja, tetapi **tidak** menggantikan aturan ini — CCP 7.6/8.3 mengujinya.
