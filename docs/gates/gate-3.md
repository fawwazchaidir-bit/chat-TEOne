# Audit independen Gate 3 — Inbox, routing, pengambilalihan, kill switch

**Tanggal:** 27 November 2026 (WIB). **Commit diaudit:** `main` `82ac197` (merge PR #4; memuat Tahap 3, S-12, dan struktur Tahap 4).
**Auditor:** sesi AI terpisah yang tidak membangun kode Tahap 3 (independen: ya). Audit tidak mengubah kode aplikasi, tidak menyentuh Meta, nomor operasional, atau Halo AI, dan tidak mengirim pesan.

## Rekomendasi auditor: **TAHAN untuk penerimaan penuh** · boleh **LANJUT TERBATAS** setelah uji nyata S1–S8 dijalankan

Kode Tahap 3 kuat **secara simulasi**: seluruh test lulus pada lingkungan auditor (bukan hanya laporan pembangun), CCP 3.1–3.7 terpenuhi pada mock. Namun **tidak ada satu pun bukti nyata** untuk Gate 3: rencana uji nyata `docs/tahap-3/rencana-uji-nyata-gate-3.md` (S1–S8) **belum dijalankan**, dan staging masih menjalankan kode Tahap 2 (`0463559`) sehingga inbox belum pernah dicoba di server. Karena go-live Kemitraan ≤ ±6 Jan 2027 bergantung langsung pada Gate 3 (D-04, D-14), CCP yang dapat diuji nyata (3.1, 3.2, 3.5, 3.7) wajib dibuktikan nyata sebelum keputusan.

## Bukti yang dijalankan auditor (27 Nov 2026)
Lingkungan: Node 22.23.5, PostgreSQL 16 lokal, Chromium 1243 (`PW_CHROMIUM_PATH`).

| Perintah | Hasil aktual |
|---|---|
| `npm run lint` · `npm run typecheck` | lulus |
| `npm run guard:operational` · `npm run scan:secrets` | lulus (lihat temuan G3-A02 tentang aturan G2) |
| `npm audit --omit=dev` | lulus |
| `npm run build` | lulus |
| `npm run test:report` (Vitest 5.1.1) | **549 test, 0 gagal, 0 dilewati**, exit 0 — `@tahap-1` 180 · `@tahap-2` 258 · `@tahap-3` 86 · `@tahap-4` 25 (= baseline, tidak turun) |
| `npm run e2e` | **10 lulus, 7 placeholder resmi** (G1×3, G2×3 termasuk S-12, G3, G5-aktivasi, G8 — semua SIMULASI) |
| `node scripts/test-tag-report.mjs --require-e2e` | "Tidak ada masalah" |
| `bash scripts/backup-restore-drill.sh` | lulus (9 migrasi, media identik SHA-256). Catatan: run pertama gagal karena auditor menjalankan E2E bersamaan (keduanya mengatur ulang kata sandi role uji) — gangguan lingkungan, bukan kode; diulang sendirian → lulus |
| gitleaks seluruh riwayat | tidak dijalankan lokal (biner tidak ada); **CI run #126 pada `82ac197` hijau** termasuk gitleaks — [run](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/45992220036) |

Pemeriksaan kode langsung: `src/modules/automation/jobs.ts` — titik komit dalam satu transaksi dengan `SELECT … FOR UPDATE` atas percakapan; urutan cek: kill switch 4 tingkat → AI aktif → versi AI sama → kelayakan pesan (history/batas aktivasi) → jendela → penerima uji → idempotensi; kill switch diperiksa lagi lewat `preSend` tepat sebelum Meta; tanpa retry pada hasil tidak pasti. Sesuai kontrak inti #4–#7.

## A — Gate maju
| # | Hasil | Dasar |
|---|---|---|
| A1 | ✅ | `docs/reports/tahap-3.md` lengkap format §12 |
| A2 | ✅ | CI #126 hijau pada `82ac197` |
| A3 | 🟡 | 7/7 CCP terpenuhi **simulasi**; 0/7 nyata |
| A4 | ❌ | Tinggi terbuka: T3-F01 (tanpa bukti nyata), G3-A02 (= G2-B08, guard G2 salah akhiran) |
| A5 | ✅ | Laporan memisahkan nyata/simulasi dengan jujur; placeholder E2E "NYATA" tidak diklaim |
| A6 | ✅ untuk Gate 3 · ❌ untuk Tahap 4 | D-05, D-16, D-22, D-01 Diputuskan 26 Nov. Tahap 4 butuh D-09, D-10, D-15, D-20, D-21, D-23 (masih Terbuka) |
| A7 | ✅ | Tidak ada kode yang memanggil Meta nyata dari Tahap 3; guard + hash G4 aktif; keadaan akun eksternal tidak diverifikasi langsung auditor |
| A8 | ✅ | scan lokal + gitleaks CI #126 |
| A9 | ✅ | `docs/tahap-3/*` (panduan inbox, routing, kill switch, alur AI–admin, rencana uji nyata), ADR-0007/0008/0009 |
| A10 | ⏳ | Staging ada, tetapi **belum di-deploy kode Tahap 3** (migrasi 0004–0008 belum di server); rencana uji nyata ada, belum bertanggal |

## B — Proteksi mundur
| # | Hasil | Dasar |
|---|---|---|
| B1 | ✅ | `@tahap-1` 180, `@tahap-2` 258 = baseline; 0 skip. Perubahan test lama Tahap 3 tercatat di ADR-0007 §5 (sempit, tidak melemahkan) |
| B2 | ✅ | Test migrasi pada DB kosong + snapshot (`tahap2-migration-retention`, `tahap4-migration`); drill memulihkan 9 migrasi |
| B3 | ✅ | Kontrak #4/#6/#7 diwujudkan lewat ADR-0008 (belum dibekukan — beku setelah Gate 3 diterima) |
| B4 | ✅ | `inbox`, `ai_simulation`, `ai_agents` default mati; `ai_simulation` ditolak di production oleh server |
| B5 | ⏳ | G3/G5/G8 lulus **simulasi**; versi NYATA masih placeholder; G2 kirim-ulang webhook nyata (sisa Gate 2) belum |
| B6 | 🟡 | Lulus, tetapi aturan G2 memeriksa akhiran yang salah (G3-A02) |
| B7 | ✅ | Drill lokal lulus; restore staging terbukti 26 Nov (`bukti/restore-staging-…`) |
| B8 | ✅ | Tag `tahap-1-diterima` dan `tahap-2-diterima-terbatas` ada pada `7f4577b` (diverifikasi `git ls-remote`) |

## C — CCP Gate 3
| CCP | Hasil | Bukti / yang kurang |
|---|---|---|
| 3.1 Visibilitas per channel | ✅ simulasi · ⏳ nyata | `tahap3-inbox`, E2E G3 · nyata = S1 + S4 |
| 3.2 Akses percakapan dialihkan | ✅ simulasi · ⏳ nyata | `tahap3-routing-reply` · nyata = S3 |
| 3.3 Ambil alih atomik | ✅ simulasi | balapan 6 putaran; nyata baru mungkin saat AI nyata (Tahap 4) |
| 3.4 Aktivasi ulang AI | ✅ simulasi | E2E G5 · bagian nyata = S8 (tanpa kirim) |
| 3.5 Kirim manual tanpa duplikat | ✅ simulasi · ⏳ nyata | 12 permintaan serentak → 1 pesan · nyata = S2 |
| 3.6 Kill switch 4 tingkat | ✅ simulasi | E2E G8 · bagian nyata = S6 |
| 3.7 Echo dari HP | ✅ simulasi · ⏳ nyata | Echo nyata sudah terbukti di Gate 2 (M-11), tetapi efek **AI Off** (D-05) belum diuji nyata · S5 |

**C: 7/7 simulasi · 0/7 nyata.**

## Temuan
| ID | Prioritas | Temuan | Tindakan | PIC |
|---|---|---|---|---|
| G3-A01 (= T3-F01) | **Tinggi** | Tidak ada bukti nyata Gate 3; staging belum menjalankan kode Tahap 3 | Deploy `main` ke staging (flag `inbox` nyala, `ai_simulation` mati), jalankan S1–S8, simpan bukti teks di `docs/reports/bukti/` | Operator + developer |
| G3-A02 (= G2-B08) | **Tinggi** | `scripts/guard-operational.mjs:32` `OP_SUFFIX = ["1119","0124"]`; nomor operasional sebenarnya …196319/…246319. PR #4–#6 sudah di-merge tanpa perbaikan yang diminta di `perintah-developer-d09-dan-pr-4-5-6.md` §2.3 | Ganti ke akhiran 6 digit + test `@tahap-1` (186319 lolos; 196319/246319 ditolak). Mitigasi saat ini: aturan G3 (nomor lengkap) + G4 (hash) | Developer |
| G3-A03 | Sedang | PR #4, #5, #6 di-merge ke `main` sebelum audit independen yang direncanakan (§2.2 perintah developer: urutan audit #4 → #5 → #6) | Audit gabungan dilakukan di sini; ke depan merge setelah audit | Pemilik |
| G3-A04 (= T3-F04) | Sedang | Pesan pelanggan > 10 menit terlambat tidak diproses otomatisasi dan tidak ditandai | Putuskan perilaku (usulan: tandai "perlu ditinjau" di inbox) sebelum AI nyata | Pemilik → developer |
| G3-A05 (= T3-F07) | Rendah | Belum ada retensi untuk tabel Tahap 3 (outbox, job, event AI, catatan, pembaca) padahal D-18 sudah diputuskan | Tambah ke job retensi | Developer |
| G3-A06 (= T3-F10) | Rendah | E2E hanya Chromium | UAT perangkat nyata admin (Tahap 7) | Developer |

## Syarat untuk keputusan Gate 3
1. Perbaiki G3-A02 (PR kecil, `@tahap-1`), CI hijau.
2. Deploy `main` terbaru ke staging lewat `scripts/build-staging-image.sh` dengan `-p deploy`; backup sebelum migrasi 0004–0008.
3. Jalankan S1–S8 (`rencana-uji-nyata-gate-3.md`); bukti teks disamarkan.
4. Auditor menilai bukti → rekomendasi akhir (target: **LANJUT TERBATAS**; 3.3/3.4/3.6 tetap simulasi sampai AI nyata).

## Formulir keputusan (diisi pemilik)
```
GATE 3 — Inbox, routing, pengambilalihan, kill switch
Tanggal rapat     :
Commit diaudit    : 82ac197
Auditor           : sesi AI terpisah (independen: ya)
Ringkasan A: 7/10 (+1 sebagian, 1 tertunda, 1 gagal) · B: 6/8 (+1 sebagian, 1 tertunda) · C: 7/7 simulasi, 0/7 nyata
Temuan terbuka    : kritis 0 · tinggi 2 · sedang 2 · rendah 2
Yang baru terbukti simulasi (belum nyata): 3.1–3.7 seluruhnya
Rekomendasi auditor: TAHAN sampai S1–S8 + G3-A02; target LANJUT TERBATAS

KEPUTUSAN: [ ] LANJUT   [ ] LANJUT TERBATAS   [ ] TAHAN
Jika LANJUT TERBATAS — bagian yang belum terbukti, PIC, tenggat:
Tag yang dibuat    : tahap-3-diterima   (ya/tidak)
Backup titik-kembali:
Diputuskan oleh   :                     Tanggal:
```
