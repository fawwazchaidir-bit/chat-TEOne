# Laporan Perbaikan Fase 1 (hasil audit independen Gate 1 & 2, putaran ke-3)

> PR perbaikan, bukan tahap baru. Bukan keputusan gate; **tidak ada tag**; tidak ada klaim "terbukti nyata". Format AGENTS.md §12.

## 1. Ringkasan hasil
Tujuh butir Fase 1 dikerjakan (P1–P7), masing-masing dengan kode + tes bertag + uji mutasi. **21 mutan, semuanya tertangkap tes.** `verify-all` **11/11 LULUS** pada `67d68b3`; CI **4 job hijau** (run #34). Jumlah test naik 383 → 432, 0 gagal, 0 dilewati. Yang **bukan** bagian PR ini (tugas operator/PR terpisah) tetap terbuka (§12).

## 2. Repository, branch, commit
`fawwazchaidir-bit/chat-TEOne` · branch `tahap-2-perbaikan-fase-1` (basis `82290cf` = `claude/brave-davinci-41pegh`) → PR ke `claude/lucid-carson-blf4x0`. Commit: `d0ef115` P1 · `8b5514e` P2 · `3a705e1` P3 · `d55bbd9` P4 · `9d543ba` P5 · `fc70705` P6+P7 · `1ca2d51` baseline · `67d68b3` perbaikan tes guard · + commit laporan ini. **Tag yang diusulkan: tidak ada.**

## 3. Status per butir (istilah §4)
| Butir | Status | Isi dan batasnya |
|---|---|---|
| **P1** G2-B03 kick inline | **Terbukti simulasi** | `createKicker`: kick saat berjalan menandai `dirty` dan putaran mengulang; batas 10 batch → putaran berikutnya; galat sementara dicoba ulang (maks. 5). Lonjakan 450 event semua diproses. Belum di staging |
| **P2** S-10/A-4 worker | **Terbukti simulasi**; menyalakan di server = **di luar lingkup (operator)** | `name: deploy` + service worker + perintah di `docs/staging.md` §5b; `scripts/worker.ts` kini dijalankan tes sebagai proses nyata (`--once`, kode keluar 0; DB mati → 1) |
| **P3** G2-B04/S-11 echo `to_user_id` | **Terbukti simulasi** (bentuk payload cocok dengan dokumentasi resmi yang dibaca; uji nyata M-11 **belum**) | `to`/`to_user_id`/keduanya/tidak ada; `contacts[]` hanya bila terbukti (tanpa fallback); konflik → `identitas_bentrok`; admin pengirim tidak ditebak |
| **P4** G1-B04 guard | **Dibuat, diuji simulasi; aktif di CI hanya setelah pemilik mengisi secret** | G5 (hash ID Meta); peringatan jelas + `::warning` bila daftar hash kosong; `GUARD_REQUIRE_HASHES=1` opsional |
| **P5** D-12 backup terjadwal | **Terbukti simulasi** (tes + drill CI nyata: 3 backup → 2 set, offsite, kode 4); pemasangan cron/offsite = **di luar lingkup (operator)** | `scripts/backup-rotate.sh`, contoh crontab di `docs/backup-restore.md` |
| **P6** D-18 log/retensi | Retensi: **Terbukti simulasi**. Caddyfile log: **Dibuat; sintaks tervalidasi CI (`caddy validate`)**, perilaku di server **belum diuji** | log akses 720 jam tanpa header/body, query verify-token disamarkan, tanpa debug; log kontainer dibatasi ukuran |
| **P7** D-02/D-03 | Dokumen/komentar saja | Penanda ASUMSI → Diputuskan; perilaku kode tidak berubah |

## 4. Hasil pengujian
- **Simulasi (bukan Meta/server):** `bash scripts/verify-all.sh` pada `67d68b3` (pohon bersih): lint 3 · typecheck 2 · guard 1 · secret scan 0 · gitleaks 0 · npm audit 1 · build 4 · **Vitest 432/0 gagal/0 dilewati (106 dtk)** · **E2E 9 lulus + 7 placeholder "BELUM TERSEDIA" (59 dtk; bukan bukti)** · penjaga akhir 0 · drill backup/restore 38 dtk — **semua LULUS**. Ringkasan lengkap: PR.
- **CI GitHub pada `67d68b3`:** run #34 <https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/45725765839> — Lint·Typecheck·Guard·Secret scan ✔ · Build·Test regresi·E2E ✔ · Drill backup & restore ✔ · Image Docker (termasuk `caddy validate` + compose) ✔.
- **Run gagal yang diperbaiki:** run #33 (`1ca2d51`) gagal di test regresi karena tes guard saya mewarisi `GITHUB_ACTIONS=true` dari CI (cacat tes; direproduksi lokal, diperbaiki di `67d68b3`; seluruh suite lulus dengan dan tanpa lingkungan CI).
- **Uji mutasi (21 mutan, semua tertangkap):** P1: kick tak menandai kerja (1 tes), batas 10 batch tak diulang (2) · P2: once tanpa pemeliharaan (2), loop tanpa pemeliharaan (1), tanpa `name: deploy` (1) · P3: normalizer abaikan `to_user_id` (9), ingest abaikan (7), tanpa validasi ulang `contacts[]` (1), fallback `contacts[0]` (1) · P4: G5 mati (1), peringatan mati (3), nilai entri tak valid dicetak (1) · P5: off-by-one (2), offsite ditelan (1), `KEEP=00` lolos (1), tanpa cek checksum (1) · P6/P7: penanda kembali (2), `resp_headers` (1), rotasi (1), debug (1), logging worker (1). Batas: tes integrasi "event disimpan saat kick berjalan" bergantung waktu; penjaga deterministiknya adalah tes unit.
- **Nyata: tidak ada** (tanpa akses Meta/staging). **Belum dapat diuji:** perilaku Caddy log, worker, dan cron di VPS; guard G4/G5 dengan hash nyata; offsite nyata.

## 5. CCP
Tidak ada CCP baru. Regresi CCP 1.1–1.9 dan 2.1–2.10 (simulasi) tetap lulus dalam 432 test; **CCP 2.8/2.10 tetap belum terpenuhi nyata**.

## 6. Regresi (jumlah test sebelum → sesudah)
Vitest: `@tahap-1` 159 → **180** (+21) · `@tahap-2` 138 → **166** (+28) · `@tahap-3` 86 → 86 · total 383 → **432**. E2E: 3/3/3 tetap; 9 lulus + 7 placeholder. `tests/baseline-counts.json` hanya naik. Tidak ada test dihapus/di-skip/dilemahkan (satu judul `describe` retensi diganti menyebut D-18 Diputuskan).

## 7. Database dan migrasi
**Tidak ada.** Skema tidak berubah; event echo lama di antrean tetap terbaca (bidang baru opsional).

## 8. Environment
Development: semua di atas. **Staging: TIDAK diubah** (rebuild image, menyalakan worker, subscribe field, cron = tugas operator). Production: belum ada.

## 9. Temuan
| ID | Prio | Dampak / bukti | Tindakan · PJ · status |
|---|---|---|---|
| F1-01 | rendah | Log kontainer dibatasi **ukuran**, bukan **umur** (json-file): batas 30 hari D-18 belum ditegakkan untuk log kontainer (`docker-compose.staging.yml`) | Penjadwal/driver log · developer · terbuka |
| F1-02 | sedang | D-12 minta kunci terpisah dari VPS; `backup.sh` memakai passphrase simetris di berkas VPS agar cron berjalan | Opsi GPG kunci-publik · developer + pemilik · terbuka (`docs/backup-restore.md` §3) |
| F1-03 | rendah | Jalur `history` (`threads[].id`) belum mendukung BSUID (lingkup P3 hanya echo) | Bersama S-12 · developer · terbuka |
| F1-04 | rendah | Nilai dokumen berbeda dari keputusan D-18 (log teknis 90 vs staging 30; chat/media 2 tahun vs dihapus saat reset) — **dianotasi, tidak diubah diam-diam** (`klasifikasi-data-dan-retensi.md`) | Pemilik menyelaraskan tabel · terbuka |
| F1-05 | rendah | Tes bergantung lingkungan CI (run #33) | Diperbaiki `67d68b3` · tertutup |
| G1-B04 | sedang | Kode G5 siap; aktif setelah secret `OPERATIONAL_NUMBER_HASHES`/`OPERATIONAL_META_ID_HASHES` diisi | Pemilik · terbuka |
| G2-B03 / S-10 | sedang | Kode diperbaiki; **tertutup penuh setelah operator menyalakan worker** dan kueri baca-saja dicatat | Operator · menunggu audit |
| G2-B04 / S-11 | rendah-sedang | Echo `to_user_id` didukung (simulasi) | Menunggu audit; uji nyata M-11 belum |

## 10. Asumsi/keputusan yang dipakai
D-02, D-03, D-12, D-18 = **Diputuskan** (26 Nov 2026). D-05 (echo → AI Off) tetap **ASUMSI**; D-16, D-22 tetap Terbuka. Tidak ada kontrak inti (§6) yang berubah ⇒ ADR tidak diperlukan (identitas echo mengikuti §6.2: identitas yang benar-benar disediakan Meta).

## 11. Bukti nomor operasional dan Halo AI tidak diubah
Guard nomor operasional lulus (lokal dan CI); semua data uji sintetis; tidak ada akses/panggilan ke Meta, Admisi (…1119), Hotline (…0124), atau Halo AI; tidak ada rahasia/ID mentah di diff (secret scan + gitleaks seluruh riwayat lulus).

## 12. Prasyarat tahap berikutnya
**Operator (Fase 2):** titik pemulihan → rebuild image dari commit PR (`build-staging-image.sh`, `-p deploy`, dua `--env-file`) → nyalakan worker (`docs/staging.md` §5b) → isi `docs/staging.md` §6, G1 E2E via HTTPS → pasang cron backup + offsite + uji restore → pemilik mengisi secret hash dan membuat `main` + branch protection → audit ulang singkat Gate 1.
**Di luar lingkup PR ini (butir berikutnya):** pemicu sinkronisasi history/kontak (S-12, G2-B01a) di PR terpisah; F1-01…F1-04; uji nyata M-11/M-12 pada nomor uji bersih.
