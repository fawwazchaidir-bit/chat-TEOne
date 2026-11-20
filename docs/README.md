# Indeks dokumentasi TE One

| Dokumen | Isi |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Aturan permanen proyek |
| [`decisions.md`](decisions.md) | Keputusan bisnis (D-01…D-24); status **Terbuka** = dipakai sebagai ASUMSI |
| [`prompts/tahap-1.md`](prompts/tahap-1.md) · [`prompts/tahap-2.md`](prompts/tahap-2.md) | Prompt Tahap 1 dan 2 |
| [`gates/GATE-CHECKLIST.md`](gates/GATE-CHECKLIST.md) | Checklist gate CCP + prompt auditor independen |
| [`gates/gate-1.md`](gates/gate-1.md) · [`gates/gate-1-tindak-lanjut.md`](gates/gate-1-tindak-lanjut.md) | **Audit independen Gate 1 (rekomendasi TAHAN; keputusan pemilik belum diisi)** · tanggapan & perbaikan pembangun |
| [`arsitektur.md`](arsitektur.md) · [`adr/`](adr) | Arsitektur & ADR-0001…0005 |
| [`pengembangan.md`](pengembangan.md) | Panduan development |
| [`staging.md`](staging.md) | Panduan staging (HTTPS, cookie, jaringan) — **belum diverifikasi** |
| [`keamanan-dan-izin.md`](keamanan-dan-izin.md) | Keamanan, model izin + cakupan channel, tim |
| [`backup-restore.md`](backup-restore.md) | Backup & restore + hasil drill |
| [`klasifikasi-data-dan-retensi.md`](klasifikasi-data-dan-retensi.md) | Klasifikasi data & rancangan retensi (D-18, usulan) |
| [`rencana-integrasi-meta-tahap-2.md`](rencana-integrasi-meta-tahap-2.md) | Apa yang harus dibuktikan sebelum Tahap 2 |
| [`temuan-dan-risiko.md`](temuan-dan-risiko.md) | Temuan & risiko peluncuran |
| [`reports/tahap-1.md`](reports/tahap-1.md) | Laporan akhir Tahap 1 (format AGENTS.md §12) |
| [`tahap-2/`](tahap-2/README.md) | Dokumen konektor WhatsApp (Tahap 2): arsitektur, konfigurasi staging, panduan uji, webhook, status pesan, coexistence |
| [`reports/tahap-2.md`](reports/tahap-2.md) | Laporan Tahap 2 — **belum lulus penuh** (uji nyata Meta belum dilakukan) |

## Berkas yang disebut aturan proyek tetapi **belum ada di repository**
Tidak disertakan dalam paket yang diterima pembangun pada Tahap 1, dan **sengaja tidak dikarang**:
- `docs/jalur-0.md` (status Jalur 0: J0-03 server staging, J0-04 teknologi nomor Hotline, J0-05 inventaris fitur Halo AI, domain staging)
- `docs/prompts/tahap-3.md` … `tahap-9.md` (`tahap-2.md` sudah diterima dan disimpan)

Pemilik proyek perlu menambahkannya sebelum Gate 1 ditutup (lihat temuan T1-F04).
