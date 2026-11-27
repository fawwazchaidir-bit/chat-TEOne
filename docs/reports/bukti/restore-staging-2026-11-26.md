# Bukti uji restore terisolasi di VPS staging — 26 Nov 2026

Ditempel operator/pemilik di sesi audit. Teks saja; tanpa rahasia, tanpa isi pesan. Database staging tidak disentuh (restore ke kontainer `postgres:16` sementara di jaringan Docker `--internal`, lalu dihapus).

## Berkas backup
```
/var/backups/teone/20261125T222956Z/SHA256SUMS          164 B
/var/backups/teone/20261125T222956Z/database.dump.gpg   24015 B
/var/backups/teone/20261125T222956Z/media.tar.gpg       179 B
$ sha256sum --check SHA256SUMS
database.dump.gpg: OK
media.tar.gpg: OK
```

## Restore
Dekripsi gpg (passphrase dari `/etc/teone/backup.pass`) → `pg_restore` ke DB sementara `restore_check`: tanpa galat, **durasi 2 dtk** (data sangat kecil; bukan ukuran RTO).

| Tabel | Hasil restore | Staging asli (saat dicek) | Dibuat setelah backup (25 Nov 22:29:56 UTC) |
|---|---|---|---|
| messages | 9 | 9 | — |
| inbound_events | 13 | 14 | 1 |
| conversations | 1 | 1 | — |
| audit_log | 15 | 18 | 3 |
| migrasi (`drizzle.__drizzle_migrations`) | 6 | 6 | — |

Restore + baris yang dibuat setelah backup = staging asli, untuk semua tabel yang diperiksa.

## Penilaian auditor
- **Terbukti nyata:** backup DB terenkripsi di server dapat diverifikasi checksum-nya, didekripsi, dan dipulihkan ke lingkungan terisolasi dengan data dan skema (6 migrasi) utuh.
- **Belum terbukti:** restore media (arsip 179 B, kemungkinan tanpa berkas media), verifikasi penuh `restore-verify` (role, trigger, hash sandi, mode aman), salinan di luar VPS, jadwal harian, PIC pemeriksa terpisah. Backup ini dibuat dengan alur manual 26 Nov (format folder + `SHA256SUMS`), bukan pembungkus cron.

## Titik pemulihan sebelum rebuild (26 Nov 2026, ±09.30 WIB) — lewat pembungkus `teone-backup-docker.sh`
- Folder pemulihan `/root/pemulihan-20261126`: `local.diff` (601 B), `Caddyfile.aktif` (441 B), `image-lama.txt` (`sha256:417b30f8…df8af`).
- Image lama ditandai `teone-app:rollback-20261126` (ID `417b30f8d220`, sama dengan `teone-app:staging`).
- Backup baru: `teone_staging-20261126T023029Z.dump.gpg` (24504 B) + `.media.tar.gpg` (168 B), masing-masing `.sha256` → `OK`; kode keluar 0; durasi 1 dtk.
- Restore terisolasi backup baru: messages 9 · inbound_events 14 · audit_log 18 · migrasi 6 — **identik** dengan staging (tanpa selisih).

**Penilaian:** alur backup yang akan dipakai cron (pembungkus docker exec, format nama `teone_staging-<stamp>` + `.sha256`) **terbukti nyata** di server, termasuk restore. Titik pemulihan sebelum rebuild **lengkap**.

## Salinan di luar VPS + backup terjadwal (26 Nov 2026, ±10.10 WIB)
- Tujuan: Google Drive (akun terpisah dari VPS), remote `gdrive`, scope `drive.file` (rclone hanya melihat berkas buatannya), folder `teone-staging-backup`; konfigurasi `/etc/teone/rclone.conf` chmod 600.
- Salin set `20261126T023029Z` → unduh balik → `sha256sum --check`: `dump.gpg: OK`, `media.tar.gpg: OK`.
- `/etc/teone/backup.env` (chmod 600): `BACKUP_KEEP=7`, `BACKUP_SCRIPT=/usr/local/sbin/teone-backup-docker.sh`, offsite = `rclone copy … --include "*-$BACKUP_STAMP.*" && rclone delete … --min-age 8d`.
- Uji `scripts/backup-rotate.sh` (persis perintah cron): `rotasi: set disimpan=2 berkas-dihapus=0`, `backup-rotate selesai: stamp=20261126T031055Z offsite=ok`, **kode keluar 0**; Google Drive berisi 2 set (8 berkas).
- Cron `/etc/cron.d/teone-backup`: `15 2 * * * root … backup-rotate.sh >> /var/log/teone-backup.log` (waktu server WIB).
- Kapasitas akun Drive: 15 GiB, terpakai 10,9 GiB, sisa 2,5 GiB — cukup untuk staging (±25 KB/set); **perlu ruang lebih besar sebelum production** (butir prasyarat Tahap 7).

**Penilaian:** D-12 staging **terbukti nyata** untuk: backup harian terenkripsi (DB + media), simpan 7, salinan di luar VPS terverifikasi checksum, uji restore di server. **Menunggu:** baris log cron pertama (`/var/log/teone-backup.log`, 27 Nov 02.15 WIB) sebagai bukti jadwal berjalan sendiri; konfirmasi salinan passphrase tersimpan di luar VPS.
