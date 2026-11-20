# Audit ulang Gate 1 — TE One

Tanggal: 21 November 2026 WIB. Repository: https://github.com/fawwazchaidir-bit/chat-TEOne. Branch `claude/lucid-carson-blf4x0`, commit `e7b9c4e0500c7d29a4bb22cf03e60e97b9a5a361`. Audit dilaksanakan pada salinan terpisah dan database PostgreSQL sementara dengan data sintetis. Tidak ada pesan Meta, nomor operasional atau koneksi Halo AI yang disentuh.

## Rekomendasi: TAHAN untuk penerimaan penuh Gate 1

Bukti telah meningkat: **246 test Vitest lulus** pada Node 22 dan PostgreSQL 16, termasuk seluruh 143 test Tahap 1, 103 test Tahap 2 dan pengujian migrasi snapshot. Perbaikan G1-A01 terverifikasi terhadap test regresi yang tersedia. Namun, E2E G1 berbasis browser dan drill restore belum dapat dijalankan independen di lingkungan ini, CI pada commit tepat yang diaudit belum diverifikasi, dan staging belum tersedia. Karena batas kritis checklist belum sepenuhnya terbukti, rekomendasi auditor adalah TAHAN untuk penerimaan penuh. Pemilik dapat memberi instruksi pengembangan atau pengujian simulasi yang terisolasi sambil memperbaiki temuan; tindakan tersebut tidak sama dengan menerima Gate 1 atau Gate 2.

## Hasil aktual auditor

| Pemeriksaan | Hasil dan batas |
|---|---|
| Node / PostgreSQL | Node **22.23.5**; PostgreSQL **16.16**, database uji sementara di localhost. |
| Lint, typecheck, build | **Lulus** pada Node 22. |
| Guard nomor operasional / secret scan lokal | **Lulus**, 229 berkas; guard tanpa daftar hash. Tidak membuktikan keadaan akun eksternal atau seluruh riwayat Git. |
| Audit dependensi produksi | `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities** pada saat pemeriksaan. |
| `npm run test:report` | **246 test lulus, 0 gagal, 0 dilewati**: 143 Tahap 1 + 103 Tahap 2, termasuk migrasi snapshot. |
| E2E | Konfigurasi audit sementara menetapkan hostname localhost dan mengganti peluncur lokal tsx dengan `node --import tsx`, tanpa mengubah kode repository. **1 test API simulasi lulus; 5 test browser gagal dimulai** karena Chromium `socket() EPERM`; **7 placeholder dilewati**. Tidak ada hasil lulus untuk E2E G1 dalam lingkungan auditor. Eksekusi default semula juga terhalang Unix socket/Next.js interface. |
| Penjaga laporan | Keluar gagal ketika E2E gagal; tidak menampilkan hasil hijau. |
| Gitleaks seluruh riwayat | Belum dijalankan independen: biner tidak tersedia. Ringkasan job CI pada run `44823965100` menunjukkan langkah gitleaks sukses pada commit perbaikan sebelumnya menurut dokumentasi. |
| Drill backup/restore | Belum dijalankan independen: `psql`, `pg_dump`, `pg_restore` tidak tersedia. Job backup pada run CI sebelumnya tercatat sukses; belum merupakan bukti restore di server yang disiapkan. |
| Staging / HTTPS / E2E G1 | Belum diuji: staging sedang disiapkan. |

Pada percobaan pertama PostgreSQL menggunakan port 55432: 245/246 test lulus dan test migrasi snapshot gagal koneksi. `tests/integration/tahap2-migration-retention.test.ts:19` masih menyetel `localhost:5432` secara tetap, sementara tes lain mendukung `TEST_DB_HOST`. Pada ulangan dengan port 5432, semua 246 lulus. Ini masalah portabilitas test/konfigurasi, bukan bukti kegagalan migrasi. Rekomendasi: pakai `TEST_DB_HOST` secara konsisten dan tambahkan pemeriksaan port nonstandar.

## Tindak lanjut temuan Gate 1

- **G1-A01 — tinggi:** **perbaikan diverifikasi untuk kasus yang diaudit**. Pembungkus meneruskan exit code Vitest; pelapor memeriksa status suite dan kegagalan, dan 19 test `ci-guard` termasuk dalam 246 test lulus. Kegagalan E2E pada audit juga membuat pelapor akhir gagal. Ini tidak membuktikan semua kemungkinan kegagalan CI tertutup.
- **G1-A02 — tinggi:** **sebagian terpenuhi**. Test integrasi dan migrasi kini dijalankan independen. E2E browser dan drill restore masih tertunda karena pembatasan/biner lingkungan, bukan lulus.
- **G1-A03 — sedang:** run [44823965100](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44823965100) memperlihatkan tiga job sukses pada ringkasan GitHub; dokumentasi mengaitkan run dengan `95b9cc8`. Itu bukan HEAD `e7b9c4e`; CI pada commit tepat yang diaudit belum diverifikasi.
- **G1-A04 — sedang:** `gate-1.md` sudah ada, tetapi keputusan pemilik, tag penerimaan dan backup titik-kembali belum dibuat. `docs/jalur-0.md` belum ada; tidak perlu mengarangnya.
- **G1-A05 — sedang:** staging, HTTPS dan backup/restore di server belum dibuktikan. RPO/RTO serta retensi masih usulan, belum keputusan.

## Rekomendasi G1-A04: keputusan, Jalur 0 dan titik-kembali

1. Susun `docs/jalur-0.md` sebagai daftar kerja yang jujur: item, status, PIC, target, bukti dan keputusan. Gunakan **belum tersedia/belum diputuskan** bila data belum ada. Minimal: server terpisah TE One, DNS/TLS, isolasi staging, backup/restore, akses Meta milik TE One, nomor uji, verifikasi karakteristik Hotline, dan inventaris penggunaan Halo AI.
2. Pemilik mencatat keputusan dalam formulir gate setelah menelaah bukti. **Jangan membuat tag `tahap-1-diterima` atau menyebut Gate 1 diterima sebelum keputusan LANJUT tercatat dan syarat gate dipenuhi.**
3. Saat diterima, tentukan dan catat commit persis yang disetujui, hasil CI dan hash, lalu buat tag dan backup titik-kembali terenkripsi yang telah diuji restore. HEAD audit sudah mengandung kode Tahap 2; jika tag menunjuk HEAD tersebut, catat jelas bahwa tag merekam snapshot kode yang memuat Tahap 2 tetapi **tidak** berarti Gate 2 diterima. Pertimbangkan memisahkan baseline bila tim memerlukan rollback murni Tahap 1; tetapkan pendekatan sebelum membuat tag.
4. Tetapkan PIC teknis untuk membuat backup dan PIC pemeriksa terpisah untuk memverifikasi checksum, restore dan bukti. Catat lokasi salinan terpisah, waktu, skema/migrasi, cara memperoleh kunci serta hasil uji; jangan menyimpan rahasia di Git.

## Rekomendasi G1-A05: staging dan backup

- Siapkan server TE One terpisah dari VPS HRIS/keuangan seperti `AGENTS.md`; staging memakai subdomain dan rahasia sendiri, HTTPS, firewall, database tidak terbuka ke publik, dan penanda STAGING. Pakai data sintetis serta daftar penerima uji; belum ada migrasi Admisi/Hotline/Halo AI.
- **D-12 usulan kerja:** pertahankan rancangan proyek RPO ≤1 jam dan RTO ≤4 jam kerja sebagai target untuk dinilai, bukan prestasi yang sudah terbukti. Jadwal backup harus konsisten dengan RPO yang disetujui dan diverifikasi: backup harian saja tidak menjamin RPO satu jam. Tentukan mekanisme yang sesuai, pantau keberhasilan, dan ukur restore dengan data yang mewakili penggunaan nyata.
- Backup terenkripsi, kunci terpisah dari database/server, salinan terenkripsi di lokasi/akun berbeda, akses terbatas dan verifikasi berkala; uji restore ke lingkungan terisolasi, termasuk konsistensi database dan media, tanpa mengirim pesan atau menjalankan worker otomatis. Tetapkan PIC dan prosedur pemulihan kehilangan server/kunci.
- **D-18 tetap usulan:** payload mentah ≤30 hari, log teknis ≤90 hari, chat/media 2 tahun dan penanganan permintaan ≤14 hari kerja adalah angka rancangan dalam `docs/decisions.md`, bukan ketentuan yang sudah disetujui. Pemilik bersama penasihat yang berwenang perlu menentukan dasar, masa retensi, penghapusan termasuk backup, pengecualian dan tanggung jawab sebelum data pelanggan digunakan.
- Setelah server tersedia jalankan kembali G1 E2E via HTTPS serta backup dan restore di server, catat commit, waktu, ukuran, hasil, lokasi dan durasi. Jangan menyatakan RPO/RTO tercapai sampai dibuktikan.

## Langkah audit ulang berikutnya

1. Jalankan CI pada commit final yang akan diputuskan dan simpan tautan run beserta seluruh job.
2. Sediakan lingkungan yang mengizinkan Chromium dan utilitas PostgreSQL; jalankan G1 E2E, full regression, scan riwayat, dan drill backup/restore secara independen pada commit yang sama.
3. Siapkan staging, lalu buktikan HTTPS/G1 serta restore dan backup di server; dokumentasikan risiko yang masih tertunda.
4. Pemilik menetapkan keputusan gate dan D-12/D-18 yang relevan; hanya setelah syarat terpenuhi lakukan tag dan backup titik-kembali.
5. Temuan Gate 2 G2-A01–A07 tetap harus diperbaiki dan diaudit ulang secara terpisah. Hasil test hijau di sini tidak membuktikan risiko identitas, timestamp, history dan race pada laporan Gate 2 telah tertutup.

Keputusan pemilik: belum diisi. Auditor tidak membuat tag, mengubah repository, atau menerima gate atas nama pemilik.
