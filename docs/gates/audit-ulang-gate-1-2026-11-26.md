# Audit ulang Gate 1 — Fondasi produksi (26 November 2026)

**Auditor:** sesi AI terpisah yang tidak membangun kode (sama dengan audit 25 Nov). **Commit kode:** `main` `046355936dc44b62f2281166fe9ef15c95527138` — yang juga **berjalan di staging** (label image terverifikasi). Kode identik dengan `6a49fa5` yang diverifikasi auditor 11/11 (`verify-all`: 432 Vitest, 9 E2E, drill). CI `main`: run #42/#43 hijau, 4 job.
**Dasar:** `audit-gate-1-2-2026-11-25.md`, `keputusan-pemilik-fase-0-2026-11-26.md`, bukti di `docs/reports/bukti/` (`staging-j2-…`, `restore-staging-…`, `rebuild-staging-…`, `staging-keamanan-…`).

## Rekomendasi auditor: **LANJUT**, dengan 3 syarat ringan bertenggat (bukan CCP)
Semua CCP Gate 1 lulus; temuan kritis dan tinggi = 0. Tiga butir di bawah tidak menahan penerimaan, tetapi wajib ditutup ≤ 28 Nov 2026:
1. **Log cron pertama** (`sudo tail -5 /var/log/teone-backup.log`, setelah 27 Nov 02.15 WIB) memuat `offsite=ok`.
2. **Konfirmasi pemilik**: salinan passphrase backup tersimpan di luar VPS (password manager) — tanpa itu backup tak terpulihkan bila VPS hilang (D-12 "kunci terpisah dari VPS").
3. **Konfirmasi pemilik**: branch protection `main` aktif (4 status check wajib, tanpa bypass, tanpa force push) — auditor tidak dapat membacanya lewat API yang tersedia.

## Status temuan
| ID | Prioritas | Status | Bukti |
|---|---|---|---|
| G1-A01…A03 | — | Tertutup | audit 25 Nov |
| G1-A04 keputusan/tag/titik-kembali | sedang | **Menunggu formulir di bawah** | — |
| G1-B01 staging tak terikat commit | tinggi | **Tertutup (nyata)** | `rebuild-staging-2026-11-26.md` |
| G1-B02 keputusan bisnis | tinggi | **Tertutup** untuk Gate 1: D-02, D-03, D-04 (+cakupan), D-12, D-14, D-18 Diputuskan | `decisions.md` |
| G1-B03 backup di server | sedang | **Tertutup (nyata)**, syarat 1–2 | `restore-staging-2026-11-26.md` |
| G1-B04 guard tanpa hash | sedang | **Tertutup** | CI #43: 3 hash nomor + 6 hash ID Meta |
| G1-B05 alur PR/proteksi | sedang | **Sebagian** — PR #1–#3 lewat PR + CI; proteksi = syarat 3 | — |
| F2-01 backup.sh butuh DB di host | rendah | Terbuka — pembungkus di luar repo bekerja; pindahkan ke repo | runbook Fase 2 |
| F2-02 SSH terbuka ke internet | rendah | Terbuka — kunci saja, sandi ditolak | `staging-keamanan-2026-11-26.md` |
| F1-02 enkripsi kunci-publik backup | rendah (staging) | Terbuka — keputusan lingkup pemilik | `docs/backup-restore.md` |

## A — Gate maju
| # | Hasil | Dasar |
|---|---|---|
| A1 | ✅ | `docs/reports/tahap-1.md` |
| A2 | ✅ | CI #42/#43 pada `0463559` |
| A3 | ✅ | Bagian C |
| A4 | ✅ | Kritis 0, tinggi 0 |
| A5 | ✅ | Nyata/simulasi/dinyatakan dipisahkan di semua bukti |
| A6 | ✅ | D-02/03/04/12/14/18 Diputuskan (D-05/16/22 dibutuhkan Gate 3, bukan Gate 1) |
| A7 | ✅ | Guard hash aktif; Admisi/Hotline/Halo AI tidak disentuh (pernyataan pemilik); lihat catatan WABA di bawah |
| A8 | ✅ | gitleaks + secret scan + guard hash |
| A9 | ✅ | Dokumen wajib ada |
| A10 | ✅ | Staging tersedia dan terverifikasi; `jalur-0.md` perlu diperbarui PIC/target (catatan) |

**A: 10/10.**

## B — Proteksi mundur
| # | Hasil | Dasar |
|---|---|---|
| B1 | N/A | Tahap pertama; baseline `@tahap-1` naik 159→180 |
| B2 | ✅ | Migrasi DB kosong + snapshot (CI); restore di server membawa 6 migrasi |
| B3 | ✅ | Tidak ada perubahan kontrak inti tanpa ADR |
| B4 | ✅ | Flag default mati; staging: `inbox`/`ai_simulation` mati |
| B5 | ✅ | G1 di staging lewat HTTPS (manual, nyata): 2FA wajib, cakupan channel ditolak di menu + URL, IP audit benar |
| B6 | ✅ | CI #43 |
| B7 | ✅ restore / ⏳ titik-kembali penerimaan | Restore terbukti di server; backup titik-kembali **penerimaan** dibuat setelah keputusan (lihat langkah setelah LANJUT) |
| B8 | N/A | Belum ada tag sebelumnya |

**B: 5/6 (+2 N/A), B7 menunggu keputusan.**

## C — CCP Gate 1
| CCP | Hasil | Bukti |
|---|---|---|
| 1.1 Izin + cakupan channel di server | ✅ simulasi + **nyata** (staging) | Test + G1 manual HTTPS |
| 1.2 Super Admin terakhir / anti-eskalasi | ✅ simulasi | Test + trigger DB (ikut terpulihkan) |
| 1.3 2FA Super Admin | ✅ simulasi + **nyata** | Test + login staging |
| 1.4 Audit append-only | ✅ | grants + trigger; drill `42501` |
| 1.5 Tidak ada rahasia | ✅ | gitleaks 42 commit; guard hash |
| 1.6 Batas channel paralel | ✅ simulasi | Test ≥ 20 paralel |
| 1.7 Backup & restore nyata | ✅ **nyata** | Restore terisolasi di VPS, hitungan identik, 6 migrasi; offsite terverifikasi |
| 1.8 Status channel jujur | ✅ | E2E + staging menampilkan status berdasar bukti |
| 1.9 Fondasi regresi | ✅ | CI 4 job + baseline + guard hash |

**C: 9/9.**

## Catatan yang dibawa ke Gate 2
- **WABA bersama? — Dijawab pemilik 26 Nov: TIDAK.** WABA Kemitraan (…6319) berbeda dari WABA Admisi dan Hotline, sehingga langganan webhook TE One (per WABA) tidak menerima event nomor operasional. Silang-cek otomatis: hash WABA ketiganya ada di `OPERATIONAL_META_ID_HASHES` (6 entri unik diperiksa CI #43).
- Kode Tahap 2–3 ikut berada di `0463559` di balik flag mati. Tag `tahap-1-diterima` pada commit ini **tidak** berarti Gate 2/3 diterima.

## Setelah keputusan LANJUT (pemilik)
1. Tag `tahap-1-diterima` pada `046355936dc44b62f2281166fe9ef15c95527138` (GitHub → Releases → Draft a new release → tag baru, target = commit itu).
2. Backup titik-kembali: salin set backup terakhir ke folder Google Drive **terpisah** `teone-titik-kembali/tahap-1-diterima/`. **Jangan** di dalam `teone-staging-backup/`: `rclone delete --min-age 8d` di perintah offsite bersifat rekursif dan akan ikut menghapusnya.

## Formulir keputusan (diisi pemilik)
```
GATE 1 — Fondasi produksi
Tanggal rapat     : 26 November 2026 (keputusan tertulis di sesi audit)
Commit diaudit    : 046355936dc44b62f2281166fe9ef15c95527138 (main = staging)
Auditor           : sesi AI terpisah (independen: ya)
Ringkasan A: 10/10 · B: 5/6 (+2 N/A) · C: 9/9
Temuan terbuka    : kritis 0 · tinggi 0 · sedang 1 (G1-B05 sebagian) · rendah 3
Syarat ringan     : log cron pertama · passphrase di luar VPS · branch protection — tenggat 28 Nov 2026
Rekomendasi auditor: LANJUT
KEPUTUSAN: [x] LANJUT   [ ] LANJUT TERBATAS   [ ] TAHAN      (pernyataan pemilik: "Gate 1: LANJUT")
Syarat ringan     : tetap berlaku, tenggat 28 Nov 2026 (log cron · passphrase di luar VPS · branch protection)
Tag dibuat        : tahap-1-diterima — BELUM (dibuat pemilik lewat GitHub Releases pada commit di atas)
Backup titik-kembali: BELUM — gdrive:teone-titik-kembali/tahap-1-diterima/
Diputuskan oleh   : Pemilik proyek          Tanggal: 26 November 2026
```
