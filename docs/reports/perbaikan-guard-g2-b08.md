# Laporan Perbaikan G2-B08 — guard nomor operasional memakai akhiran 6 digit

> PR perbaikan kecil, bukan tahap baru. Bukan keputusan gate; **tidak ada tag**; tidak ada klaim "terbukti nyata". Format AGENTS.md §12.
> Rujukan: temuan G2-B08 (`docs/gates/keputusan-pemilik-fase-0-2026-11-26.md` §15) dan perintah developer §2.3.A (`docs/prompts/perintah-developer-d09-dan-pr-4-5-6.md`).

## 1. Ringkasan hasil
Aturan **G2** di `scripts/guard-operational.mjs` sebelumnya memeriksa akhiran `1119`/`0124`, yang bukan akhiran nomor operasional sebenarnya (Admisi …196319, Hotline …246319; dikonfirmasi pemilik 26 Nov 2026). Akibatnya G2 **tidak pernah dapat menangkap** kedua nomor itu; perlindungan efektif hanya dari G3 (nomor lengkap apa pun dilarang) dan G4 (hash, bila secret CI terisi). Kini `OP_SUFFIX = ["196319", "246319"]`.

Akhiran **sengaja 6 digit, bukan 4 digit `6319`**: nomor Kemitraan …186319 sah dipakai di staging dan akan ikut tertolak bila akhirannya dipersingkat. Hal ini dikunci oleh test.

## 2. Repository, branch, commit
`fawwazchaidir-bit/chat-TEOne` · branch `claude/lucid-carson-blf4x0` (di-fast-forward ke `main` `ba85b5d`; tidak ada force push, riwayat tidak ditulis ulang). Commit dan tag: lihat deskripsi PR. **Tag yang diusulkan: tidak ada.**

## 3. Status fitur (istilah §4)
| Butir | Status | Isi dan batasnya |
|---|---|---|
| G2 memakai akhiran 6 digit 196319/246319 | **Terbukti simulasi** | Test menjalankan skrip guard sungguhan pada direktori sintetis; **bukan** pada nomor atau channel nyata. Tidak ada nomor operasional yang disentuh. |
| Kemitraan …186319 tidak ditandai G2 | **Terbukti simulasi** | Penyebutan akhiran di dokumen lulus penuh; nomor lengkap berakhiran 186319 hanya kena G3 (aturan nomor lengkap, bukan aturan operasional). |
| G4/G5 (hash) | **Tidak diubah** | Tetap bergantung pada secret CI `OPERATIONAL_NUMBER_HASHES` / `OPERATIONAL_META_ID_HASHES`. |

## 4. Perubahan perilaku (wajib dicatat)
1. Nomor berakhiran `1119` atau `0124` **tidak lagi** menjadi syarat G2. Nomor lengkap berakhiran itu **tetap ditolak** sebagai G3 (nomor lengkap di repository), jadi tidak ada celah baru untuk nomor lengkap. Yang berubah hanya pesan/aturan yang mengenainya.
2. Penyebutan akhiran tanpa nomor lengkap (mis. "Admisi (…196319)" di dokumen) **tidak** memicu G2 maupun G3, sama seperti sebelumnya untuk 1119/0124. G2 hanya bekerja pada deretan yang berbentuk nomor telepon Indonesia lengkap.
3. Teks peringatan guard tidak lagi memuat angka akhiran (agar keluaran CI tidak ikut menyebarkannya). Keluaran temuan tetap menyamarkan nomor (hanya 3 digit awal dan 2 digit akhir).
4. Test lama G2 (1119/0124) **ditulis ulang**, bukan dihapus: seluruh 8 variasi format (JSON, string, tanda hubung, spasi, `+62`, `(+62)`, `62` + spasi) kini dijalankan untuk **kedua** akhiran baru, dengan akhiran yang melintasi batas kelompok empat-digit seperti penulisan sehari-hari. Perubahan ini diminta eksplisit oleh perintah developer §2.3.A.3.

## 5. Hasil pengujian
- **Simulasi:** `tests/unit/guards.test.ts` — 26 test lulus (sebelumnya 24); +2 test baru bertag `@tahap-1`, 1 test G2 ditulis ulang. Guard pada seluruh repo: **lulus** (tidak ada temuan baru di fixture/seed; tidak ada data yang diganti dan tidak ada pelonggaran guard).
- **Uji mutasi (6 mutan pada `OP_SUFFIX`, semua tertangkap):** dipersingkat jadi `["6319"]` (tertangkap test 186319) · kembali ke `["1119","0124"]` (2 test) · Hotline hilang (1) · Admisi hilang (1) · pola lama 1119/0124 ditambahkan kembali (test perubahan perilaku) · akhiran salah `["186319","246319"]` (2 test).
- **`verify-all` dan CI:** diisi pada bagian 6 setelah dijalankan.
- **Nyata: tidak ada.** **Belum dapat diuji:** G4/G5 dengan hash nyata (menunggu secret CI terisi penuh); perilaku guard terhadap nomor operasional sungguhan sengaja tidak diuji (larangan AGENTS.md §3.1/§3.5).

## 6. Hasil verifikasi penuh
- **Eksekusi 1 (tidak lengkap, BUKAN bukti lulus):** `bash scripts/verify-all.sh` pada pohon dengan perubahan ini: 8 langkah lulus, 3 langkah (05 gitleaks, 09 E2E, 10 penjaga akhir) **"tidak dapat dijalankan"** karena `gitleaks` tidak ada di PATH dan Chromium tidak ditemukan di lokasi bawaan Playwright. Ini kendala lingkungan lokal, bukan kegagalan kode; hasilnya tidak dihitung sebagai lulus.
- **Eksekusi 2 (lengkap):** dengan `PATH` memuat biner gitleaks ber-pin di `.tools/gitleaks` dan `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`: **11/11 langkah LULUS, 0 gagal, 0 tidak dapat dijalankan** — lint · typecheck · guard · secret scan · gitleaks seluruh riwayat · npm audit · build · Vitest (regresi + penjaga) · E2E Playwright · penjaga akhir dengan E2E · drill backup & restore nyata. Dijalankan pada dasar `ba85b5d` dengan perubahan ini belum di-commit (tercatat di `.verify/ringkasan.md`).
- **Hitungan aktual** (`.test-results/tag-report.md`): Vitest **551** test, 0 gagal, 0 dilewati; E2E 17 spesifikasi, 10 lulus, 7 placeholder resmi "BELUM TERSEDIA" (bukan bukti).
- **CI GitHub pada `5659b2d`** (commit kode): run #132 <https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/46001366704> — **success**, 4 job: Lint·Typecheck·Guard·Secret scan ✔ · Build·Test regresi·E2E ✔ · Drill backup & restore nyata ✔ · Image Docker ✔. Commit setelahnya hanya mengubah baris ini (dokumen).

## 7. CCP
Tidak ada CCP baru. Guard nomor operasional adalah bagian regresi CCP Tahap 1 (GATE-CHECKLIST B6).

## 8. Regresi (jumlah test sebelum → sesudah)
Vitest `@tahap-1`: 180 → **182** (+2). `@tahap-2` 258, `@tahap-3` 86, `@tahap-4` 25 tidak berubah. `tests/baseline-counts.json` dinaikkan (`@tahap-1` = 182); tidak ada test yang di-skip.

## 9. Database dan migrasi
Tidak ada.

## 10. Environment
Development saja. **Staging dan production tidak disentuh.**

## 11. Temuan
| ID | Prioritas | Dampak | Tindakan | Penanggung jawab | Status |
|---|---|---|---|---|---|
| G2-B08 | Tinggi | G2 tidak pernah menangkap nomor operasional | Akhiran 6 digit + test + mutasi (laporan ini) | Developer | **Dibuat, diuji simulasi** — menunggu audit independen |
| G2-B09 | Sedang | Beberapa dokumen aktif masih menyebut Admisi "…1119" / Hotline "…0124" sebagai identitas nomor (lihat §12) | Selaraskan dokumen lewat PR terpisah; tidak diubah di sini karena di luar cakupan perintah | Developer (atas persetujuan pemilik) | Terbuka |

## 12. Asumsi
Tidak ada asumsi D-xx baru. Identitas nomor mengikuti konfirmasi pemilik (keputusan Fase 0 §15) dan AGENTS.md §1/§3.1 pada `main`.

## 13. Bukti bahwa nomor operasional dan Halo AI tidak diubah
Perubahan hanya pada `scripts/guard-operational.mjs`, `tests/unit/guards.test.ts`, `tests/baseline-counts.json`, `docs/pengembangan.md`, dan laporan ini. Tidak ada konfigurasi channel, webhook, aplikasi Meta, atau akses jaringan ke Meta/Halo AI. Nomor pada test adalah **sintetis** (awalan karangan yang hanya meniru akhiran) dan dibangun saat runtime.

## 14. Prasyarat tahap berikutnya
Tidak ada yang baru. Catatan untuk audit: dokumen yang masih memakai identitas lama — `docs/tahap-2/runbook-uji-m12.md` (baris 30, 177), `docs/tahap-2/konfigurasi-staging.md` (baris 5), serta beberapa dokumen historis/laporan lama — perlu diselaraskan (G2-B09). Dokumen historis yang mencatat keadaan pada tanggalnya tidak perlu ditulis ulang, tetapi dokumen yang masih **berlaku sebagai instruksi** perlu dikoreksi.
