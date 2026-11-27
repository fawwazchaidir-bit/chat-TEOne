# Audit independen Gate 4 — AI agent, Kartu Program, knowledge, simulator, eskalasi

**Tanggal:** 27 November 2026 (WIB). **Commit diaudit:** `main` `82ac197`. **Auditor:** sesi AI terpisah (independen: ya).

## Rekomendasi auditor: **TAHAN — tahap belum dapat diaudit sebagai fitur**

Tahap 4 baru berisi **struktur** (PR #6): skema + migrasi 0007–0008, 9 izin terdaftar `available: false`, ADR-0010/0011, 25 test `@tahap-4` (semuanya lulus di lingkungan auditor). **Belum ada** modul `ai-agents`, `program-cards`, `knowledge`, adapter provider, pipeline jawab, sepuluh pemeriksaan sebelum kirim, eskalasi, simulator, penjaga biaya, maupun UI (`src/modules/` tidak memuat satu pun). `docs/reports/tahap-4.md` belum ada. Ini dinyatakan jujur oleh pembangun (`docs/tahap-4/README.md`) — bukan pelanggaran, tetapi semua CCP 4.x berstatus **Belum dibuat**.

## A — Gate maju (ringkas)
| # | Hasil | Dasar |
|---|---|---|
| A1 | ❌ | `docs/reports/tahap-4.md` belum ada |
| A2 | ✅ | CI #126 hijau (struktur saja) |
| A3 | ❌ | 0/7 CCP |
| A4 | ⏳ | Temuan di bawah; tidak ada kritis |
| A5 | ✅ | README tahap-4 jujur: struktur saja |
| A6 | ❌ | D-09 (tanpa default), D-10, D-15, D-20, D-21, D-23 Terbuka; definisi "jadwal belum lewat" belum dikonfirmasi |
| A7 | ✅ | Tidak ada panggilan provider AI/Meta dari kode Tahap 4 |
| A8 | ✅ | Set uji memakai nomor tersamar; scan lulus |
| A9 | 🟡 | Prompt, ADR, set uji, metode pemilihan model ada; laporan tahap belum |
| A10 | ❌ | Gate 3 belum diputuskan; data Kartu Program/JADWAL AKTIF (J0-08) belum dimasukkan |

## C — CCP Gate 4
| CCP | Status (AGENTS §4) | Catatan |
|---|---|---|
| 4.1 Filter knowledge & Kartu Program sebelum model | Belum dibuat | Skema akses dua arah ada (`program_card_agents`, `knowledge_source_agents`) |
| 4.2 Validasi jadwal & tautan oleh kode | Belum dibuat | Lihat G4-A01: skema belum sesuai D-25 |
| 4.3 Set uji AI (D-21, 0 fabrikasi) | Terbukti simulasi (indikatif, antarmuka chat) | Haiku 5.5 low memenuhi 4 ambang secara tipis; GPT6 Luna low gagal 2 ambang. Belum lewat API, belum 3× ulang. D-21 masih Terbuka |
| 4.4 Pemeriksaan ulang 10 syarat | Belum dibuat | Pipeline `automation/jobs.ts` Tahap 3 sudah menutup syarat 1, 4–8; syarat 2, 3, 9, 10 belum |
| 4.5 Eskalasi & routing | Belum dibuat | D-20, D-23 Terbuka |
| 4.6 Batas biaya & kill switch AI | Belum dibuat (kill switch fitur AI ada dari Tahap 3) | D-09 tanpa default |
| 4.7 Simulator terisolasi | Belum dibuat | — |

## Temuan
| ID | Prioritas | Temuan | Tindakan | PIC |
|---|---|---|---|---|
| G4-A01 | **Tinggi** | Skema `program_card_versions` (migrasi 0007) hanya punya satu `registration_close_at` + `price_text` per versi kartu. D-25 (Diputuskan 26 Nov) mewajibkan tabel **JADWAL AKTIF** per batch: kode program, kode batch, mulai/selesai, cut-off WIB, harga, DP, link, status manual; status efektif dihitung kode | Migrasi aditif `program_batches` (expand) + `statusEfektif(batch, now)` + test batas (23.59 WIB, H-1, hari H, Tutup manual, sel `[ISI]`) | Developer |
| G4-A02 | **Tinggi** (jadwal) | D-04 diubah: **go-live dengan AI (mode B)**; D-14: Kemitraan live ≤ ±6 Jan 2027, freeze 7–14 Jan. Prompt Tahap 4 menargetkan Gate 4 ±2 Feb 2027. Dengan 0 kode perilaku per 27 Nov, Gate 4 sebelum 6 Jan sangat berisiko | Pemilik memilih: AI menyusul setelah go-live (flag mati) **atau** pertahankan AI dengan lingkup minimum dan menerima risiko jadwal secara tertulis | Pemilik |
| G4-A03 | Sedang | Hasil uji model berasal dari antarmuka chat (bukan API, tanpa ulangan); Haiku lulus jawaban benar tipis (91,4% vs 90%) | Harness API 3× ulang setelah D-09; penilaian auditor | Developer + auditor |
| G4-A04 | Sedang | Definisi "jadwal belum lewat" (ADR-0010 §5) belum dikonfirmasi; D-25 secara efektif memakai cut-off | Konfirmasi: cut-off D-25 menggantikan "tanggal mulai" | Pemilik |
| G4-A05 | Rendah | Set uji `set-uji-ai-chelsea.xlsx` (kunci) berada di repo yang sama dengan harness yang akan dibuat — risiko kontaminasi | Harness dilarang membaca berkas kunci; test statis | Developer |

## Formulir keputusan (diisi pemilik)
```
GATE 4 — AI agent
Tanggal rapat     :
Commit diaudit    : 82ac197 (struktur saja)
Ringkasan C: 0/7 dibuat
Rekomendasi auditor: TAHAN (belum ada fitur untuk diaudit)
KEPUTUSAN: [ ] LANJUT   [ ] LANJUT TERBATAS   [ ] TAHAN
Diputuskan oleh   :                     Tanggal:
```
