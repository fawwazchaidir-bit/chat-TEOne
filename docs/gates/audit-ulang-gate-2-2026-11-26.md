# Audit ulang Gate 2 — Konektor WhatsApp (26 November 2026)

**Auditor:** sesi AI terpisah yang tidak membangun kode (sama dengan audit 25–26 Nov). **Commit:** `main` `7f4577b` — kode identik dengan `046355936dc4` (0 perubahan di `src/ scripts/ tests/ drizzle/ db/ deploy/ .github/`), yang **berjalan di staging** (label image terverifikasi) dan diverifikasi auditor 11/11 pada `6a49fa5` (kode sama): 432 Vitest, 9 E2E, drill. CI `main`: run #76 hijau (4 job). Branch `tahap-2-s12-sinkronisasi-riwayat` (PR S-12, belum di-merge) **tidak** termasuk audit ini.
**Dasar bukti nyata:** `docs/reports/bukti/` (`m11-echo-…`, `rebuild-staging-…`, `staging-keamanan-…`, `restore-staging-…`, `staging-j2-…`), `docs/tahap-2/runbook-m12-6319.md`, pernyataan pemilik 25–26 Nov.

## Rekomendasi auditor: **LANJUT TERBATAS**
Konektor terbukti untuk **pesan masuk/keluar, status, karantina, daftar penerima uji, dan echo coexistence** (sebagian nyata, sisanya simulasi yang diverifikasi independen). **Impor riwayat (CCP 2.9 nyata, bagian riwayat CCP 2.10) belum terbukti** karena SMB App Data API ditolak Meta (131000/10) untuk nomor yang tidak di-onboard lewat Embedded Signup partner — penghalang **eksternal**, bukan cacat kode. Tahap 3 (inbox, routing, kill switch) **tidak bergantung** pada impor riwayat, sehingga dapat dilanjutkan.

**Lingkup terbatas yang tetap terbuka:**
| Butir | PIC | Tenggat |
|---|---|---|
| CCP 2.9 nyata + bagian riwayat CCP 2.10 | Pemilik (tiket Meta; keputusan Tech Provider) · developer (PR S-12 + Embedded Signup bila diputuskan) | Keputusan ≤ 20 Des 2026; bila tidak terpenuhi → go-live 15 Jan **tanpa** impor riwayat (perlu dicatat sebagai keputusan) |
| Golden E2E G2 nyata: kirim ulang webhook yang sama tidak menggandakan (nyata) | Operator + auditor | Bersama uji Gate 3 |

**Syarat sebelum uji nyata Tahap 3 dimulai:**
1. Keputusan atau persetujuan ASUMSI untuk **D-05** (echo → AI Off), **D-16** (belum dibaca per pengguna), **D-22** (lead nyasar), dan **D-01** (grup WhatsApp lama) — semuanya dipakai kode Tahap 3 dan masih Terbuka.
2. Periksa **1 event `channel_tidak_dikenal`** di staging (kueri metadata saja: waktu, `phone_number_id` disamarkan, tanpa isi); event ini **menyimpan payload** sampai dipurge 30 hari → hapus payload bila bukan data uji (D-18).
3. Konfirmasi tag `tahap-1-diterima` dan backup titik-kembali Gate 1 sudah dibuat.

## Status temuan
| ID | Prioritas | Status | Bukti |
|---|---|---|---|
| G2-A01…A06 | tinggi/sedang | **Tertutup** (simulasi, verifikasi independen) | audit 25 Nov §2 |
| G2-A07 bukti nyata | tinggi | **Sebagian** → G2-B01 | — |
| G2-B01 CCP 2.8/2.9/2.10 nyata | tinggi | **Sebagian:** 2.8 ✅ nyata; 2.9/2.10-riwayat terhalang eksternal (lingkup terbatas) | `m11-echo-2026-11-26.md`, `runbook-m12-6319.md` |
| G2-B02 data pelanggan nyata ke staging | tinggi | **Tertutup dengan catatan:** …186319 = Kemitraan/cadangan tanpa chat pelanggan masuk (dinyatakan pemilik); hitungan 48 jam rendah; karantina terbukti nyata; sisa syarat 2 di atas | `runbook-m12-6319.md` |
| G2-B03 event inline tertahan / pemeliharaan tanpa worker | sedang | **Tertutup:** perbaikan kick (PR #1) + worker berjalan di staging | `rebuild-staging-2026-11-26.md` |
| G2-B04 echo `to_user_id` | rendah-sedang | **Tertutup** (simulasi, PR #1) | — |
| G2-B05 bukti nyata tanpa artefak | sedang | **Sebagian:** artefak teks J2 untuk staging, rebuild, restore, keamanan, M-11; uji 25 Nov butir 1–8 tetap "dinyatakan pemilik" | `docs/reports/bukti/` |
| G2-B06/B07 identitas nomor | tinggi (potensi kritis) | **Tertutup:** nomor staging = …186319, Kemitraan/cadangan (dinyatakan pemilik), WABA terpisah dari Admisi/Hotline | `runbook-m12-6319.md` |
| F1-03 BSUID pada history | rendah | Terbuka → PR S-12 | — |
| S-12 pemicu sinkronisasi | tinggi untuk 2.9 nyata | Terbuka → PR S-12 + Tech Provider | — |

## A — Gate maju
| # | Hasil | Dasar |
|---|---|---|
| A1 | ✅ | `docs/reports/tahap-2.md` + `perbaikan-fase-1.md` |
| A2 | ✅ | CI #76 pada `7f4577b` |
| A3 | 🟡 | 8/10 CCP penuh; 2.9/2.10 sebagian (lingkup terbatas) |
| A4 | ✅ untuk dasar Tahap 3 | Tinggi terbuka hanya pada lingkup impor riwayat, yang tidak menjadi dasar Tahap 3 |
| A5 | ✅ | Nyata / simulasi / dinyatakan pemilik dipisahkan di semua bukti |
| A6 | ⏳ | D-02, D-03 Diputuskan; D-01, D-05, D-16, D-22 (Tahap 3) masih Terbuka → syarat 1 |
| A7 | ✅ | Guard hash aktif; WABA Kemitraan terpisah; Admisi/Hotline/Halo AI tidak disentuh |
| A8 | ✅ | gitleaks + guard; bukti hanya 6 digit terakhir |
| A9 | ✅ | Dokumen konektor, coexistence, runbook, bukti |
| A10 | ✅ | Staging terverifikasi, worker berjalan, backup harian + offsite |

## B — Proteksi mundur
| # | Hasil | Dasar |
|---|---|---|
| B1 | ✅ | `@tahap-1` 180 lulus (tidak turun), verifikasi independen |
| B2 | ✅ | Migrasi 0002/0003 pada snapshot Tahap 1; restore server 6 migrasi |
| B3 | ✅ | Kontrak #3/#5 diperkuat (ADR-0006/0008); tanpa perubahan tanpa ADR |
| B4 | ✅ | `whatsapp_connector` default mati; staging: `inbox`/`ai_simulation` mati |
| B5 | 🟡 | G2 nyata: pesan masuk/keluar & status (dinyatakan), echo (terbukti); kirim ulang webhook nyata belum |
| B6 | ✅ | CI #76 |
| B7 | ✅ | Restore terbukti di server; backup harian + Google Drive |
| B8 | ⏳ | Rencana kembali ke `tahap-1-diterima` ada; tag belum dikonfirmasi dibuat |

## C — CCP Gate 2
| CCP | Hasil | Bukti |
|---|---|---|
| 2.1 Tanda tangan raw body | ✅ simulasi + insiden nyata 25 Nov (App Secret salah → event ditolak) | Test + pernyataan pemilik |
| 2.2 Simpan sebelum 200 | ✅ simulasi | Test |
| 2.3 Idempotensi ≥ 100 | ✅ simulasi | Test |
| 2.4 Pemetaan channel / karantina tak dikenal | ✅ simulasi + nyata (event `channel_tidak_dikenal` dikarantina) | Test + hitungan staging |
| 2.5 Daftar penerima uji | ✅ simulasi + **nyata** (pesan & echo di luar daftar dikarantina) | `m11-echo-2026-11-26.md` |
| 2.6 Hasil kirim tidak pasti | ✅ simulasi; penyapu aktif di staging (worker) | Test + `rebuild-staging-…` |
| 2.7 Jendela layanan | ✅ simulasi; satu kirim nyata dalam jendela (dinyatakan) | Test |
| 2.8 Echo WhatsApp Business App | ✅ **nyata** | `m11-echo-2026-11-26.md` |
| 2.9 History | ✅ simulasi · ⏳ nyata (SMB App Data ditolak 131000/10) | `runbook-m12-6319.md` |
| 2.10 Coexistence nyata | 🟡 **sebagian nyata**: `is_on_biz_app=true`, terhubung ke aplikasi TE-One, echo berjalan; impor riwayat belum → **"belum lulus penuh" untuk bagian riwayat** | idem |

**C: 8/10 penuh, 2 sebagian.**

## Formulir keputusan (diisi pemilik)
```
GATE 2 — Konektor WhatsApp
Tanggal rapat     : 26 November 2026 (keputusan tertulis di sesi audit)
Commit diaudit    : 7f4577b (kode = 046355936dc4 = staging)
Auditor           : sesi AI terpisah (independen: ya)
Ringkasan A: 8/10 (+2 sebagian/tertunda) · B: 6/8 (+2 sebagian/tertunda) · C: 8/10 (+2 sebagian)
Temuan terbuka    : kritis 0 · tinggi 1 (impor riwayat, lingkup terbatas) · sedang 1 (G2-B05) · rendah 1 (F1-03)
Yang baru terbukti simulasi (belum nyata): 2.2, 2.3, 2.6; 2.9 nyata; kirim ulang webhook nyata
Rekomendasi auditor: LANJUT TERBATAS
KEPUTUSAN: [ ] LANJUT   [x] LANJUT TERBATAS   [ ] TAHAN      (pernyataan pemilik: "Gate 2: LANJUT TERBATAS")
Lingkup terbuka + PIC + tenggat: impor riwayat (pemilik/developer, keputusan ≤ 20 Des 2026)
Syarat sebelum uji nyata Tahap 3: D-01/D-05/D-16/D-22 → DIPUTUSKAN (default, 26 Nov); event channel_tidak_dikenal; tag tahap-1-diterima
Tag dibuat        : tahap-2-diterima-terbatas — BELUM (dibuat pemilik lewat GitHub Releases pada 046355936dc4)
Diputuskan oleh   : Pemilik proyek          Tanggal: 26 November 2026
```
