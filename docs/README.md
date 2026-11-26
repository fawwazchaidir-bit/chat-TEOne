# Indeks dokumentasi TE One

| Dokumen | Isi |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Aturan permanen proyek |
| [`decisions.md`](decisions.md) | Keputusan bisnis (D-01…D-24); status **Terbuka** = dipakai sebagai ASUMSI |
| [`prompts/tahap-1.md`](prompts/tahap-1.md) · [`prompts/tahap-2.md`](prompts/tahap-2.md) · [`prompts/tahap-3.md`](prompts/tahap-3.md) | Prompt Tahap 1, 2, dan 3 |
| [`gates/GATE-CHECKLIST.md`](gates/GATE-CHECKLIST.md) | Checklist gate CCP + prompt auditor independen |
| [`gates/daftar-tindakan-pemilik.md`](gates/daftar-tindakan-pemilik.md) | **Daftar tindakan pemilik Tahap 1 & 2** (keputusan, akses, server, gate) · [`jalur-0.md`](jalur-0.md) = draf daftar kerja prasyarat |
| [`tahap-2/checklist-tech-provider.md`](tahap-2/checklist-tech-provider.md) | **Checklist pendaftaran Tech Provider** (verifikasi bisnis, App Review, Embedded Signup) |
| [`prompts/perbaikan-s12-sinkronisasi-riwayat.md`](prompts/perbaikan-s12-sinkronisasi-riwayat.md) | **Perintah pengerjaan PR S-12**: pemicu sinkronisasi kontak & riwayat (SMB App Data API) + F1-03 BSUID history + F2-01 backup via docker |
| [`prompts/perbaikan-fase-1.md`](prompts/perbaikan-fase-1.md) | **Perintah pengerjaan Perbaikan Fase 1** (P1–P7) untuk sesi developer + tugas operator Fase 2 |
| [`gates/keputusan-pemilik-fase-0-2026-11-26.md`](gates/keputusan-pemilik-fase-0-2026-11-26.md) | **Keputusan pemilik Fase 0 (26 Nov 2026)**: D-03 = …6319, A-4 worker disetujui, …6319 tetap tersambung; draf siap-putus D-02/D-04/D-12/D-18 |
| [`tahap-3/rencana-uji-nyata-gate-3.md`](tahap-3/rencana-uji-nyata-gate-3.md) | **Rencana uji nyata Gate 3** (S1–S8, prasyarat, kondisi berhenti, kueri bukti) |
| [`gates/audit-ulang-gate-2-2026-11-26.md`](gates/audit-ulang-gate-2-2026-11-26.md) | **Audit ulang Gate 2 (26 Nov 2026)**: C 8/10 + 2 sebagian; **KEPUTUSAN PEMILIK: LANJUT TERBATAS** (26 Nov 2026); impor riwayat terbuka |
| [`gates/audit-ulang-gate-1-2026-11-26.md`](gates/audit-ulang-gate-1-2026-11-26.md) | **Audit ulang Gate 1 (26 Nov 2026)**: A 10/10, C 9/9 — **KEPUTUSAN PEMILIK: LANJUT** (26 Nov 2026) + 3 syarat ringan |
| [`gates/audit-gate-1-2-2026-11-25.md`](gates/audit-gate-1-2-2026-11-25.md) | **Audit independen Gate 1 & 2 putaran ke-3 (25 Nov 2026)**: verify-all 11/11 independen pada `d0c4842`; temuan G1-B01…B05, G2-B01…B05; urutan penyelesaian Fase 0–4 |
| [`gates/gate-1-audit-ulang.md`](gates/gate-1-audit-ulang.md) | Audit ulang Gate 1 (21 Nov 2026; TAHAN untuk penerimaan penuh) |
| [`gates/gate-2.md`](gates/gate-2.md) · [`gates/gate-2-tindak-lanjut.md`](gates/gate-2-tindak-lanjut.md) | **Audit independen Gate 2 (rekomendasi TAHAN; keputusan pemilik belum diisi)** · tanggapan & perbaikan pembangun |
| [`gates/gate-1.md`](gates/gate-1.md) · [`gates/gate-1-tindak-lanjut.md`](gates/gate-1-tindak-lanjut.md) | **Audit independen Gate 1 (rekomendasi TAHAN; keputusan pemilik belum diisi)** · tanggapan & perbaikan pembangun |
| [`arsitektur.md`](arsitektur.md) · [`adr/`](adr) | Arsitektur & ADR-0001…0009 (0007–0009 = Tahap 3: akses & routing, status AI/outbox/pipeline, pembaruan tampilan) |
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
| [`tahap-3/`](tahap-3/README.md) | Dokumen Tahap 3: panduan inbox, tim/antrian/routing (aturan akses percakapan yang dialihkan), alur AI–admin, kill switch, belum dibaca & penugasan |
| [`gates/tindak-lanjut-gate-1-2-2026-11-25.md`](gates/tindak-lanjut-gate-1-2-2026-11-25.md) | **Laporan tindak lanjut Gate 1 & 2 (25 Nov 2026)**: rekonsiliasi staging↔repo, build/provenance image, matriks temuan G1/G2, T2-F15 diperiksa, rekomendasi (TAHAN / LANJUT TERBATAS) |
| [`tahap-2/pernyataan-pemilik-uji-staging-2026-11-25.md`](tahap-2/pernyataan-pemilik-uji-staging-2026-11-25.md) | Pernyataan tertulis langsung pemilik/operator atas hasil uji staging 25 Nov (verbatim) + pemetaan status + klarifikasi Q1–Q6; **bukan** keputusan gate dan **bukan** persetujuan langkah apa pun |
| [`tahap-2/persetujuan-pemilik-m11-2026-11-26.md`](tahap-2/persetujuan-pemilik-m11-2026-11-26.md) · [`tahap-2/runbook-uji-m11.md`](tahap-2/runbook-uji-m11.md) · [`tahap-2/verifikasi-dokumentasi-meta-2026-11-26.md`](tahap-2/verifikasi-dokumentasi-meta-2026-11-26.md) | **Izin tertulis pemilik uji echo M-11** (verbatim + batas) · **runbook** (gerbang GO/NO-GO, kueri baca-saja, backup/restore terisolasi, kondisi berhenti, lembar teks; **belum dijalankan**) · **verifikasi dokumentasi resmi Meta** (V-1…V-9; temuan S-11, S-12) |
| [`tahap-2/runbook-fase-2-operator.md`](tahap-2/runbook-fase-2-operator.md) | **Runbook Fase 2 operator (copy-paste)**: titik pemulihan, backup via docker exec, uji restore terisolasi, rebuild dari `main` + worker, offsite, cron, daftar periksa staging §6 |
| [`tahap-2/pemeliharaan-inline-vs-worker.md`](tahap-2/pemeliharaan-inline-vs-worker.md) | Analisis kode (bukan tindakan): apa yang dijadwalkan dan tidak pada mode inline vs worker — retensi payload, rekonsiliasi `belum_pasti`, ulang media, fallback outbox; bukti kode + tes; revisi S-08, temuan S-10; opsi W0–W3 dan prosedur W1 (**menunggu A-4**) |
| [`tahap-2/prosedur-uji-m11-m12.md`](tahap-2/prosedur-uji-m11-m12.md) | **Draf keputusan pemilik:** prosedur uji nyata M-11 (echo) dan M-12 (history) per langkah — dampak akun/data, cara menghentikan, rencana pemulihan, rekonsiliasi staging; formulir keputusan **kosong**; **belum dijalankan** |
| [`tahap-2/bukti-uji-staging-2026-11-25.md`](tahap-2/bukti-uji-staging-2026-11-25.md) · [`tahap-2/matriks-uji-coexistence.md`](tahap-2/matriks-uji-coexistence.md) | Catatan uji Meta nyata di staging (**KLAIM; bukti belum terlampir**) · matriks uji coexistence terkontrol (**belum dijalankan**) |
| [`reports/tahap-3.md`](reports/tahap-3.md) | Laporan Tahap 3 — **belum lulus untuk integrasi langsung** (seluruh bukti = simulasi/mock; Gate 2 belum diterima) |

## Berkas yang disebut aturan proyek tetapi **belum ada di repository**
Tidak disertakan dalam paket yang diterima pembangun pada Tahap 1, dan **sengaja tidak dikarang**:
- ~~`docs/jalur-0.md`~~ → **kini ada sebagai DRAF jujur** (`jalur-0.md`; pemilik wajib memverifikasi dan melengkapi)
- `docs/prompts/tahap-4.md` … `tahap-9.md` (`tahap-2.md` dan `tahap-3.md` sudah diterima dan disimpan)

Pemilik proyek perlu menambahkannya sebelum Gate 1 ditutup (lihat temuan T1-F04).
