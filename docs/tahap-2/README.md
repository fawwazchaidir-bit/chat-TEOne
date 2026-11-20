# Dokumen Tahap 2 — Konektor WhatsApp Cloud API & Coexistence

> **Status Tahap 2: BELUM LULUS PENUH.** Kode, adapter, mock, alat uji, dan test otomatis selesai dan hijau (**terbukti simulasi**). **Uji nyata dengan Meta/nomor uji, termasuk coexistence, belum dilakukan**
> karena tidak ada aplikasi Meta milik TE One, token, nomor uji, maupun staging HTTPS (Jalur 0: J0-01, J0-02, J0-03). Menurut spesifikasi §14, coexistence nyata yang belum diuji ⇒ **belum lulus penuh meskipun uji mock lulus**.
> Gate 1: audit independen **sudah ada** ([`../gates/gate-1.md`](../gates/gate-1.md), rekomendasi **TAHAN**) tetapi **keputusan pemilik belum diisi** — Tahap 2 dikerjakan atas instruksi eksplisit pemilik proyek dan **tidak dapat diterima** sebelum Gate 1 diputuskan (AGENTS.md §2.3).

> **Audit Gate 2 (21 Nov 2026):** rekomendasi auditor **TAHAN** — [`../gates/gate-2.md`](../gates/gate-2.md); tanggapan & perbaikan pembangun: [`../gates/gate-2-tindak-lanjut.md`](../gates/gate-2-tindak-lanjut.md), [ADR-0006](../adr/0006-perbaikan-audit-gate-2.md). Angka terkini: Vitest 281 (Tahap 1: 143, Tahap 2: 138).

## Pemetaan dokumen yang diserahkan (spesifikasi §15)
| Dokumen yang diminta | Berkas |
|---|---|
| Arsitektur konektor dan alur data | [`arsitektur-konektor.md`](arsitektur-konektor.md) · [`../adr/0004-konektor-whatsapp-dan-perluasan-izin.md`](../adr/0004-konektor-whatsapp-dan-perluasan-izin.md) |
| Panduan konfigurasi staging + variabel lingkungan (tanpa rahasia) | [`konfigurasi-staging.md`](konfigurasi-staging.md) |
| Panduan uji dengan nomor uji | [`panduan-uji-nomor-uji.md`](panduan-uji-nomor-uji.md) |
| Webhook dan validasi keamanan | [`webhook-dan-keamanan.md`](webhook-dan-keamanan.md) |
| Status pesan dan penanganan hasil belum pasti | [`status-pesan.md`](status-pesan.md) |
| Catatan coexistence **terverifikasi** + implikasi per nomor | [`coexistence.md`](coexistence.md) — **ISI BELUM TERVERIFIKASI** (judul dan §1 menjelaskan alasannya) |
| Keterbatasan grup (D-01) | [`coexistence.md`](coexistence.md) §5 |
| Laporan Tahap 2 | [`../reports/tahap-2.md`](../reports/tahap-2.md) |

## Cara menjalankan secara lokal (mock, tanpa Meta)
```bash
npm run db:migrate && npm run db:seed:sample
npx vitest run                 # 281 test (Tahap 1: 143 + Tahap 2: 138), DB uji dibuat dari kosong
npm run build && npm run e2e   # E2E G1 + G2 SIMULASI (server produksi + webhook bertanda tangan sungguhan)
```
