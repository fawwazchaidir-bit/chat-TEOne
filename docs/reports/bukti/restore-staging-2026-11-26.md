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
