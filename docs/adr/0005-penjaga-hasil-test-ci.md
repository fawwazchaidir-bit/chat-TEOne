# ADR-0005 — Penjaga hasil test CI: exit code adalah kebenaran (G1-A01)

- **Status:** Diusulkan · menunggu persetujuan pemilik · berasal dari temuan **G1-A01 (tinggi)** audit independen Gate 1 (`docs/gates/gate-1.md`)
- **Tahap:** 1 (fondasi regresi, GATE-CHECKLIST 1.9 / AGENTS.md §10)

## Konteks
`npm run test:report` semula `vitest run --reporter=json …; node scripts/test-tag-report.mjs` — pemisah `;` membuat **exit code Vitest dibuang**; status job ditentukan pelapor yang
hanya memeriksa status tiap *assertion*. Auditor mereproduksi: test lulus + `afterAll` melempar error ⇒ Vitest exit **1**, JSON `success:false`/`numFailedTestSuites>0`, semua assertion `passed` ⇒ pelapor
mencetak "Tidak ada masalah" dan exit **0** ⇒ **CI lolos**. Kami mengonfirmasi bentuk JSON yang sama pada Vitest 5.1.1. Belum terbukti bahwa run historis berisi kegagalan tersembunyi.

## Keputusan
1. **Pembungkus** `scripts/run-test-report.mjs` (dipanggil `npm run test:report`): menghapus hasil lama; menjalankan Vitest; **mencatat exit code asli** di `.test-results/vitest-exit.json`;
   selalu menjalankan pelapor (agar diagnosis tercetak); keluar **≠ 0 bila Vitest atau pelapor gagal**. Exit code `null` (sinyal/gagal start) = gagal.
2. **Pelapor** `scripts/test-tag-report.mjs` kini **gagal** bila: hasil Vitest hilang / rusak / usang (> `--max-age-min`, default 180) / kosong (0 test); `success !== true`; `numFailedTestSuites`,
   `numRuntimeErrorTestSuites`, atau `numFailedTests` > 0; **berkas** hasil berstatus ≠ `passed` (mis. `afterAll`/teardown/impor gagal) walau assertion-nya lulus; bukti exit code hilang/≠ 0/usang;
   hasil Playwright berisi `errors`, `stats.unexpected > 0`, atau usang. Perilaku lama (assertion gagal/dilewati, baseline, placeholder resmi, `--require-e2e`) **tidak dilonggarkan**.
3. `npm run e2e` menghapus `playwright.json` lama sebelum berjalan.
4. **Test regresi nyata** `tests/unit/ci-guard.test.ts` (19 test, tag `@tahap-1`): lapis A menjalankan **Vitest sungguhan** pada proyek fixture sementara yang sengaja rusak (afterAll melempar error, assertion gagal,
   gagal impor, global teardown gagal, promise tak tertangani, tanpa test, hasil lama tertinggal) lewat pembungkus; lapis B memberi pelapor hasil hilang/usang/rusak/kosong/berbentuk-kegagalan-suite/E2E bermasalah.
5. **Uji mutasi:** dengan perilaku lama dipulihkan (pelapor lama + exit code dibuang) **14 dari 19 test gagal** (5 sisanya menguji perilaku lama yang memang dipertahankan) — test benar-benar menangkap G1-A01.
6. `scripts/verify-all.sh`: verifikasi menyeluruh satu commit dengan log per langkah, kode keluar, durasi; langkah tanpa prasyarat dilaporkan **TIDAK DAPAT DIJALANKAN** (bukan lulus).
7. CI: `workflow_dispatch` (dapat dijalankan manual pada commit mana pun), ringkasan test ditulis ke `$GITHUB_STEP_SUMMARY`, `vitest-exit.json` ikut diunggah.

## Dampak pada test Tahap 1 (transparansi, AGENTS.md §10.2)
`tests/unit/guards.test.ts` (grup "penjaga regresi jumlah test") memakai fixture Vitest/Playwright **minimal** (tanpa `success`, ringkasan, status berkas, waktu mulai, dan tanpa bukti exit code) — bentuk yang kini
**sengaja ditolak**. Fixture diganti dengan bentuk **realistis** keluaran Vitest/Playwright; **tidak ada ekspektasi yang dihapus, di-skip, atau dilonggarkan**. Baseline `@tahap-1` Vitest naik 124 → **143** (hanya boleh naik).

## Konsekuensi
- `npm run test:report` **wajib** dipakai (menjalankan `vitest` manual lalu pelapor akan gagal karena bukti exit code tidak ada) — disengaja.
- Kegagalan infrastruktur (mis. PostgreSQL tidak terjangkau) kini tampil sebagai kegagalan job, bukan "tidak ada masalah".
- Batas keterbatasan: penjaga memeriksa hasil yang dilaporkan Vitest/Playwright; test yang tidak pernah dijalankan karena salah konfigurasi `include` hanya tertangkap oleh baseline jumlah test per tag.
