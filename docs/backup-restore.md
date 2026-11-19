# Backup & restore

## 1. Mekanisme (diimplementasikan)
| Langkah | Alat | Catatan |
|---|---|---|
| Dump | `pg_dump --format=custom --no-owner --no-acl` (`scripts/backup.sh`) | kredensial lewat `PG*`, **bukan** argumen perintah |
| Enkripsi | `gpg --symmetric --cipher-algo AES256` (ber-integritas MDC) | passphrase dari **berkas** `chmod 600/400` (skrip menolak izin lain), disimpan **terpisah dari server DB** dan repository |
| Integritas | `sha256sum` (`.sha256` di samping berkas) | `restore.sh` membatalkan (exit 2) bila checksum tidak cocok |
| Akses | direktori `700`, berkas `600` | — |
| Restore | `scripts/restore.sh` → DB tujuan **kosong & terpisah** → `db/grants.sql` diterapkan ulang | tidak menjalankan aplikasi ⇒ tidak ada pesan/follow-up yang dapat terkirim |

Yang ikut tercakup: seluruh skema (termasuk **trigger integritas**, riwayat migrasi `drizzle.__drizzle_migrations`, sekuens) dan data.
**Kunci `APP_ENCRYPTION_KEY` TIDAK ada di backup** (sengaja). Tanpa kunci itu, TOTP hasil restore tidak dapat didekripsi ⇒ simpan kunci di pengelola rahasia terpisah; bila hilang, reset 2FA semua pengguna.

## 2. Hasil restore NYATA (CCP 1.7) — lokal, PostgreSQL 16.15
Dijalankan: `bash scripts/backup-restore-drill.sh` (database sumber dibuat dari **nol** → migrasi → seed contoh → Super Admin lewat CLI → backup → restore ke DB terpisah).

| Pemeriksaan | Hasil |
|---|---|
| Jumlah baris 16 tabel (38 baris) sama persis sebelum/sesudah | ✔ |
| Data terbaca oleh **role aplikasi** (`teone_app`) | ✔ |
| Hash sandi Argon2id masih valid (login akan berhasil) | ✔ |
| `audit_log` menerima INSERT; urutan ID **melanjutkan** sumber (5 → 6) | ✔ |
| `audit_log` tetap append-only untuk aplikasi (42501) dan oleh pemilik (trigger) | ✔ |
| 5 trigger integritas + 2 riwayat migrasi ikut terpulihkan | ✔ |
| Backup **tidak** terbaca sebagai teks/`PGDMP`; **passphrase salah ditolak**; **berkas rusak ditolak** checksum | ✔ |
| Waktu | backup **0,15 dtk**, restore **0,28 dtk**, ukuran 9,6 KB |

**Batas bukti:** data sangat kecil — waktu **tidak representatif** untuk data produksi; dijalankan di mesin pengembangan, **bukan di server staging**; salinan di lokasi terpisah belum dibuktikan. RPO/RTO: **D-12 belum dinilai** (usulan RPO ≤ 1 jam, RTO ≤ 4 jam kerja).
CI menjalankan drill ini sebagai job terpisah (`backup-restore`) — belum pernah berjalan di GitHub (T1-F02).

## 3. Rancangan lokasi terpisah (belum dipasang — butuh server)
- **Jadwal:** harian + sebelum setiap migrasi; usulan retensi 7 harian / 4 mingguan / 6 bulanan (selaras D-18, perlu diputuskan).
- **Salinan di luar server:** salin berkas `.dump.gpg` + `.sha256` ke penyimpanan terpisah (provider/lokasi berbeda) dengan kredensial tulis-saja; passphrase dan kunci aplikasi di brankas berbeda dari keduanya.
- **Restore drill berkala:** bulanan ke DB terpisah memakai `backup-restore-drill`-style verifikasi; dicatat waktunya.
- **Untuk RPO ≤ 1 jam (D-12):** `pg_dump` harian **tidak cukup**; perlu arsip WAL kontinu (mis. pgBackRest/`pg_basebackup` + `archive_command`). Diputuskan bersama penilaian biaya D-12 (target Tahap 7).

## 4. Rancangan backup media (Tahap berikutnya)
Media pelanggan (Tahap 2+) disimpan **privat** di volume terpisah (`/var/lib/teone/media`), hanya metadata di database, diakses lewat endpoint yang memeriksa izin. Backup: sinkronisasi inkremental terenkripsi (mis. `age`/`gpg`) dengan jadwal sama dengan database; restore media diuji bersama restore database. Retensi mengikuti D-18.

## 5. Larangan operasional
Jangan menyimpan backup atau passphrase di repository, di server yang sama sebagai satu-satunya salinan, atau di chat/email/screenshot. Jangan melakukan restore ke database yang dipakai aplikasi yang dapat mengirim pesan sebelum pengiriman otomatis dinonaktifkan (kill switch global) — CCP 7.6/8.3 mengujinya.
