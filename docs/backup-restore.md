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

## 3. Rancangan lokasi terpisah (belum dipasang — butuh server)
- **Jadwal:** harian + sebelum setiap migrasi; usulan retensi 7 harian / 4 mingguan / 6 bulanan (selaras D-18, perlu diputuskan).
- **Salinan di luar server:** salin berkas `.dump.gpg` + `.sha256` ke penyimpanan terpisah (provider/lokasi berbeda) dengan kredensial tulis-saja; passphrase dan kunci aplikasi di brankas berbeda dari keduanya.
- **Restore drill berkala:** bulanan ke DB terpisah memakai `backup-restore-drill`-style verifikasi; dicatat waktunya.
- **Untuk RPO ≤ 1 jam (D-12):** `pg_dump` harian **tidak cukup**; perlu arsip WAL kontinu (mis. pgBackRest/`pg_basebackup` + `archive_command`). Diputuskan bersama penilaian biaya D-12 (target Tahap 7).

## 4. Backup media — diimplementasikan; yang belum
**Sudah (skrip + drill):** arsip media terenkripsi + checksum, restore ke direktori terpisah, verifikasi baris↔berkas. Media pelanggan disimpan **privat** di `MEDIA_DIR` (hanya metadata di database; diakses lewat endpoint yang memeriksa izin).
**Belum (butuh server/keputusan):** jadwal otomatis; salinan di lokasi terpisah; **arsip penuh setiap kali tidak efisien** untuk volume besar — bila media membesar, ganti ke sinkronisasi inkremental terenkripsi (mis. `restic`/`age`) dengan **urutan yang sama** (media dulu, database sesudahnya); retensi media (D-18). Uji pada volume dan waktu yang **mewakili penggunaan nyata** (belum ada).

## 5. Larangan operasional
Jangan menyimpan backup atau passphrase di repository, di server yang sama sebagai satu-satunya salinan, atau di chat/email/screenshot. Jangan melakukan restore ke database yang dipakai aplikasi yang dapat mengirim pesan, dan jangan mengisi `META_ACCESS_TOKEN` pada instans uji. **Mode aman bawaan** (kill switch global menyala setelah restore) melindungi dari pengiriman otomatis tak sengaja, tetapi **tidak** menggantikan aturan ini — CCP 7.6/8.3 mengujinya.
