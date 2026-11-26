# Audit independen Gate 2 — TE One

**Tanggal:** 21 November 2026 (WIB). **Repository:** https://github.com/fawwazchaidir-bit/chat-TEOne. **Branch:** `claude/lucid-carson-blf4x0`. **Commit diaudit:** `e7b9c4e0500c7d29a4bb22cf03e60e97b9a5a361`. **Auditor:** sesi terpisah dari pembangun. Lingkup: Gate 2, tindak lanjut Gate 1, dan keterhubungan antarmodul. Audit tidak mengubah kode aplikasi, menghubungkan Meta, mengirim pesan, atau mengakses Halo AI dan nomor operasional.

## Rekomendasi: TAHAN

Gate 2 belum layak dinyatakan lulus atau digunakan dengan nomor nyata. Terdapat temuan tinggi terkait kebenaran identitas pelanggan, jendela layanan dan pemrosesan history, serta uji nyata Meta/coexistence belum dilakukan. Gate 1 sendiri masih menunggu keputusan dan audit ulang. Pengembangan simulasi yang terisolasi dapat dikerjakan sebagai perbaikan atas instruksi pemilik; itu bukan penerimaan Gate 1/Gate 2. Keputusan resmi ada pada pemilik, bagian formulir dibiarkan kosong.

## Temuan menurut prioritas

### G2-A01 — Tinggi: identitas dua pelanggan dapat tercampur

**Bukti:** `src/modules/whatsapp-adapter/normalize.ts:108–110` memilih `contacts[0]` bila `wa_id` yang cocok dengan `message.from` tidak ditemukan. `src/modules/conversations-messages/ingest.ts:90–96` menggabungkan `message.from` dengan `contact.userId`; `src/modules/contacts/service.ts` menyimpan kedua identitas pada satu kontak bila keduanya belum ada.

**Reproduksi sintetis:** pesan memiliki `from=A`, sedangkan satu-satunya entri contacts berisi `wa_id=B` dan `user_id=B`. Pengujian unit independen terhadap normalizer mengonfirmasi output `message.from=A` tetapi `contact.userId=B`. Alur kode berikutnya dapat mengaitkan identitas B ke kontak A. Efek akhirnya pada database disimpulkan dari kode dan belum dijalankan independen karena DB tidak tersedia; tidak ada bukti bahwa data nyata pernah tercampur.

**Risiko antarmodul:** kontak lintas channel → percakapan → pencarian/media/integrasi selanjutnya dapat mengaitkan informasi dua orang yang berbeda; masalah dapat bertahan setelah payload awal hilang. **Perbaikan:** hanya gabungkan identitas dengan hubungan yang dapat dibuktikan dari payload resmi; bila tidak cocok/ambigu, karantina atau simpan identitas yang pasti tanpa mengaitkan identitas lain. Tambahkan uji integrasi multi-kontak, kontak hilang, user_id bentrok, channel berbeda, dan pemulihan data yang telanjur terasosiasi. **PIC:** developer. **Batas:** sebelum Gate 2 ulang.

### G2-A02 — Tinggi: timestamp hilang dapat membuka jendela 24 jam tanpa bukti waktu pesan

**Bukti:** `normalize.ts` `parseTs` mengembalikan null untuk timestamp hilang/tidak valid; `ingest.ts:98` memakai `new Date()` sebagai waktu pesan pelanggan. `touchConversation` memperbarui `lastCustomerMessageAt`; `window.ts` dan `send.ts` memperlakukan waktu itu sebagai dasar izin kirim pesan bebas.

**Reproduksi:** uji unit sintetis mengonfirmasi pesan tanpa timestamp dinormalisasi dengan `ts=null` dan `evaluateWindow(new Date())` menyatakan terbuka. Hubungan persistensi sampai pengiriman adalah hasil pembacaan kode, belum dibuktikan end-to-end. Bila pesan sebenarnya sudah lama tetapi notifikasinya tertunda atau tidak membawa waktu sah, waktu kedatangan tidak membuktikan kapan pesan dibuat: sistem dapat mengizinkan pesan di luar 24 jam. Pengiriman saat ini dibatasi daftar penerima uji; masalah bukan bukti pesan nyata sudah terkirim.

**Perbaikan:** simpan waktu kedatangan terpisah dari waktu pesan; bila asal/umur tak dapat dibuktikan, jangan memperbarui dasar jendela dan tolak kirim bebas. Uji timestamp kosong, rusak, masa depan, pengiriman ulang tertunda >24 jam, serta batas waktu saat proses unggah/antrian. **PIC:** developer; sebelum gate ulang.

### G2-A03 — Tinggi: pesan yang sudah tercatat sebagai history dapat memicu hook ketika event langsung datang belakangan

**Bukti:** `ingest.ts:43–48` mengubah pesan `isHistory=true` menjadi pelanggan dan mengembalikan `inserted:true` ketika event langsung dengan provider ID sama datang kemudian; `ingest.ts:98–107` kemudian menyentuh jendela dan memancarkan `emitCustomerMessage`. `tests/integration/tahap2-messages.test.ts:194–210` memang mengharapkan hook pada event langsung yang terlambat. History sendiri tidak memicu hook; celahnya adalah penggolongan ulang salinan pesan yang sama berdasarkan urutan kedatangan, tanpa pemeriksaan apakah pesan lama/layak untuk otomatisasi.

**Risiko:** pada integrasi Tahap 3–6, pesan lama dapat dianggap pesan baru untuk AI, unread, label atau follow-up. Saat ini subscriber otomatisasi belum dibangun, sehingga dampak kirim otomatis belum terbukti. **Perbaikan:** pisahkan pembaruan data dari kelayakan event otomatisasi; pakai bukti waktu/cutoff dan dedup lintas history/live secara konservatif, perlakukan ketidakpastian sebagai tidak layak. Uji history→live lama/baru, live→history, webhook terlambat dan duplikat setelah restart, termasuk pengujian dengan subscriber tiruan. **PIC:** developer; sebelum menghubungkan otomatisasi dan sebelum gate ulang.

### G2-A04 — Tinggi: verifikasi koneksi dapat dicatat pada pemetaan channel yang sudah berubah

**Bukti:** `connection.ts:110–121` mengambil pemetaan A, memanggil pemeriksaan jaringan, lalu memperbarui hasil berdasarkan `channelId` saja. Sementara itu `saveConnection` dapat mengganti WABA/phone ID menjadi B dan mereset status. Jika perubahan B terjadi saat verifikasi A masih berjalan, respons A yang tiba belakangan dapat menandai baris B sebagai terverifikasi. Ini analisis interleaving kode; belum direproduksi dengan PostgreSQL.

**Risiko:** status yang ditunjukkan ke admin tidak lagi membuktikan pemetaan yang tampil; dapat menyebabkan salah diagnosis atau penggunaan channel yang belum diverifikasi. **Perbaikan:** update bersyarat pada pasangan ID/versi yang sama atau optimistic concurrency; jika berubah, batalkan hasil dan wajib verifikasi ulang. Tambahkan uji dua permintaan bersamaan dengan mock yang dapat ditunda. **PIC:** developer; sebelum gate ulang.

### G2-A05 — Sedang: status verifikasi bisa positif walaupun webhook tidak berlangganan atau belum diketahui

`connection.ts:95–103` menambahkan masalah bila `webhookSubscribed=false`, tetapi `verified` hanya memakai `phoneOk && member`; `tests/integration/tahap2-connection.test.ts:88–89` secara eksplisit mengharapkan `verified=true` dan `webhookSubscribed=false`. Ini dapat dibaca benar sebagai verifikasi **kepemilikan/pemetaan nomor**, tetapi menyesatkan bila UI atau SOP memaknainya sebagai koneksi siap menerima pesan. Bahkan jumlah aplikasi berlangganan >0 tidak otomatis membuktikan aplikasi TE One yang benar. Perlu label terpisah untuk pemetaan terverifikasi, subscription aplikasi yang tepat, serta webhook benar-benar menerima event uji; `unknown` tetap belum terbukti. Uji kondisi false/null/aplikasi lain. **PIC:** developer.

### G2-A06 — Sedang: pesan keluar dapat tertahan `diproses` setelah proses mati

`send.ts:108–110` membuat pesan `diproses` sebelum panggilan Meta. Jika proses mati setelah pengiriman atau setelah penyimpanan namun sebelum `settle`, `reconcile.ts` hanya mencari `belum_pasti`; penyelesaian manual juga membatasi status tersebut. Pesan dapat menetap `diproses` dan tidak masuk alur rekonsiliasi. Ini analisis kode, bukan simulasi crash pada DB. Pertahankan larangan retry buta; tandai `diproses` yang kedaluwarsa sebagai `belum_pasti`, rekonsiliasi atau sediakan penyelesaian manual teraudit. Uji crash sebelum dan sesudah panggilan provider, status webhook terlambat, dan dua worker. **PIC:** developer.

### G2-A07 — Tinggi: bukti nyata dan prasyarat Gate 1 belum lengkap

Tidak ada bukti pengujian Meta/coexistence nyata, echo nyata atau G2 nyata; `docs/reports/tahap-2.md` menyatakannya secara terbuka. Staging HTTPS, image/compose, backup offsite, keputusan bisnis dan tag/backup Gate 1 belum dibuktikan. Pengujian independen dengan PostgreSQL dan E2E juga belum dapat berjalan pada lingkungan ini. Ini keterbatasan bukti, bukan bukti bahwa konektor aktual gagal. Lakukan uji dengan akun/aplikasi Meta milik TE One dan nomor uji yang disetujui, tanpa mengubah Admisi, Hotline atau Halo AI. PIC: pemilik dan developer.

## Hubungan dengan Gate 1

| Temuan Gate 1 | Tinjauan terkini dan pengaruh terhadap Gate 2 |
|---|---|
| G1-A01 — penjaga CI | `package.json` kini menjalankan `scripts/run-test-report.mjs`, yang mempertahankan exit code Vitest dan menghapus laporan lama; pelapor memeriksa status suite. **19 uji `ci-guard` termasuk dalam 50 unit test terisolasi yang lulus.** Pada percobaan `npm run test:report` kali ini, database tidak tersedia dan perintah keluar 1: kegagalan tidak tersembunyi. Ini bukti perbaikan atas kasus tertentu, bukan penerimaan penuh Gate 1. |
| G1-A02 — bukti independen | **Masih terbuka:** PostgreSQL/psql tidak ada; E2E mengalami EPERM. Semua tes integrasi dan drill perlu dijalankan pada lingkungan terisolasi setara CI. |
| G1-A03 — CI commit audit | [Run 44823965100](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44823965100) diperiksa melalui ringkasan GitHub: ketiga job sukses, termasuk regresi/E2E simulasi dan backup; laporan pembangun mengaitkannya dengan `95b9cc8`. Run tersebut bukan HEAD `e7b9c4e`. Status run pada HEAD belum diverifikasi. |
| G1-A04 — keputusan, tag, titik-kembali | Laporan `gate-1.md` telah masuk repository, tetapi formulir keputusan masih kosong. Tag penerimaan dan backup titik-kembali belum dibuktikan. |
| G1-A05 — staging/backup | Masih menunggu bukti staging, restore server dan salinan terpisah; media Tahap 2 menambah kebutuhan backup yang konsisten dengan DB. |

## Peta keterkaitan antarmodul

| Alur | Pengaman yang terlihat | Risiko/yang perlu dibuktikan |
|---|---|---|
| Sesi & izin Gate 1 → alat integrasi → channel | `needTool`/`sendOutbound` memeriksa flag, akses channel dan `integration.test` di server; media memeriksa cakupan channel. | Uji API lintas channel lengkap belum dijalankan independen; G2-A01 dapat merusak identitas lintas channel. |
| Webhook → validasi HMAC → antrean → worker → pesan | Raw body diverifikasi sebelum parse; store sebelum 200; event key unik; proses pesan dan status event dalam transaksi. | Tes DB mati, dedup ≥100 dan konkurensi hanya tersedia dalam suite/laporan pembangun; perlu dijalankan ulang. Bentuk coexistence nyata belum dibuktikan. |
| Kontak → percakapan → pesan → jendela → pengiriman | Percakapan terpisah per kontak/channel; allowlist diperiksa di server; pengiriman memakai idempotency key. | G2-A01 dan G2-A02 dapat memengaruhi identitas dan izin jendela; perlu pengujian integrasi menyeluruh. |
| History/echo → event domain → otomatisasi mendatang | Cabang history/echo tidak langsung memanggil hook. | G2-A03: history yang kemudian mendapat event langsung dapat memicu hook. Hook pasca-commit bersifat in-memory; keandalan pengiriman ke subscriber mendatang perlu desain durable sebelum dipakai. |
| Channel → konfigurasi → verifikasi → webhook | Ada keunikan phone ID, karantina tak dikenal dan reset status jika pemetaan berubah. | G2-A04/A05: race dan arti status verifikasi; konfirmasi pemetaan, subscription dan event nyata secara terpisah. |
| Pesan keluar → provider → status/reconciliation | Timeout/jaringan/5xx dicatat `belum_pasti` dan tidak di-retry buta; status memakai channel dan provider ID. | G2-A06: crash dapat meninggalkan `diproses`; simulasikan crash dan event status yang tiba lebih dulu. |
| Backup DB → media → restore | Drill DB tersedia. | Backup/restore media dan konsistensinya dengan DB belum terbukti pada server. |

## Bukti pengujian auditor

- `npm ci`: berhasil; Node auditor 24.22.3, sedangkan CI menetapkan Node 22.
- Lint, typecheck, guard nomor dan secret scan lokal: lulus. Guard memindai 231 berkas dan tidak memakai daftar hash nomor; tidak membuktikan keadaan akun eksternal. Scan lokal tidak membuktikan seluruh riwayat bebas rahasia.
- Uji unit terisolasi tanpa global setup database: **50 lulus** (3 berkas: `tahap2-units`, `permission-engine`, `ci-guard`). Ini bukan suite integrasi penuh.
- Dua pengujian sintetis auditor: **2 lulus** dalam menunjukkan perilaku fallback identitas dan timestamp; bukan bukti terjadinya insiden nyata atau hasil DB end-to-end.
- `npm run test:report`: gagal dengan `ECONNREFUSED` ke PostgreSQL; 0 test dijalankan; exit 1 diteruskan dengan benar.
- `npm run e2e`: webServer gagal karena IPC socket `EPERM`; database juga tidak tersedia; tidak ada E2E dijalankan.
- `bash scripts/backup-restore-drill.sh`: berhenti karena `psql` tidak tersedia; tidak ada restore dijalankan.
- `npm run build`: lulus setelah dependensi dipasang lokal dan file uji sementara auditor dihapus. Percobaan awal dengan symlink dependensi dan satu percobaan saat file uji sementara masih ada gagal karena kondisi penyiapan audit, bukan kegagalan kode commit.
- Status CI run `44823965100`: tiga job sukses berdasarkan ringkasan GitHub, bukan run commit HEAD. Angka yang dilaporkan pembangun: 246 Vitest dan 6 E2E (3 G1, 3 G2 simulasi); angka detail belum diverifikasi auditor lewat artefak lengkap. Meta, echo dan coexistence nyata belum diuji.

## A — Gate maju

✅ diverifikasi; ❌ gagal; ⏳ belum dapat dibuktikan; N/A tidak berlaku.

| Butir | Hasil | Dasar |
|---|---|---|
| A1 Laporan tahap lengkap | ✅ | `docs/reports/tahap-2.md` tersedia dan memisahkan klaim pembangun. |
| A2 CI hijau pada commit audit | ⏳ | Run sukses yang diperiksa dikaitkan dengan commit sebelumnya, bukan HEAD. |
| A3 Seluruh CCP lulus | ❌ | G2-A02/A03; CCP nyata dan uji integrasi belum terbukti. |
| A4 Kritis/tinggi nol | ❌ | G2-A01–A04 serta A07 masih terbuka. |
| A5 Nyata/simulasi terpisah | ✅ | Laporan tahap menyebut belum ada Meta/coexistence nyata. |
| A6 Keputusan bisnis | ⏳ | D-01/D-02/D-03 dan keputusan relevan belum dibuktikan diputuskan/disetujui pada rapat gate. |
| A7 Nomor operasional/Halo AI tidak diubah | ⏳ | Guard dan pernyataan laporan tersedia; keadaan eksternal tidak diverifikasi langsung. |
| A8 Rahasia/data pelanggan | ⏳ | Scan lokal lulus; tidak membuktikan seluruh riwayat atau semua data. |
| A9 Dokumentasi | ⏳ | Laporan dan prompt tahap ada; `docs/jalur-0.md` belum tersedia. |
| A10 Prasyarat tahap berikut | ⏳ | Staging, data uji, keputusan dan rencana bertanggal belum terbukti lengkap. |

## B — Proteksi mundur

| Butir | Hasil | Dasar |
|---|---|---|
| B1 Regresi Gate 1 | ⏳ | 11 unit permission + 19 CI guard termasuk 50 lulus; integrasi G1/E2E belum dijalankan independen, CI sukses pada commit sebelumnya. |
| B2 Migrasi DB kosong dan snapshot | ⏳ | Ada test migrasi/laporan pembangun; tidak berjalan dalam audit. |
| B3 Kontrak inti | ❌ | G2-A03 berpotensi membuat pesan history/terlambat layak otomatisasi; G2-A01 berkaitan dengan integritas identitas. |
| B4 Flag dan perilaku saat mati | ⏳ | Ada pemeriksaan flag dalam API/webhook; tes integrasi belum dijalankan. |
| B5 Golden E2E staging | ⏳ | Staging belum tersedia; G1/G2 tidak berjalan di lingkungan auditor. |
| B6 Guard/secret scan | ✅ | Keduanya lulus secara lokal; gitleaks riwayat di CI commit sebelumnya sukses menurut ringkasan job. |
| B7 Backup titik-kembali/restore | ⏳ | Belum ada bukti titik-kembali Gate 1; drill lokal tidak berjalan; job CI sebelumnya sukses. |
| B8 Rencana kembali ke tag diterima | ⏳ | Tag `tahap-1-diterima` belum ada, jadi rollback ke tag belum dapat dibuktikan. |

## C — CCP Gate 2

| CCP | Hasil | Dasar |
|---|---|---|
| 2.1 Signature raw body | ⏳ | Urutan verifikasi terlihat di webhook; unit/test tersedia, seluruh tes negatif integrasi belum dijalankan. |
| 2.2 Simpan sebelum 200 | ⏳ | `storeEvents` sebelum 200 terlihat; tes DB mati dan pemulihan belum dijalankan auditor. |
| 2.3 Idempotensi ≥100 | ⏳ | Unique event key dan test tersedia; uji DB/paralel belum dijalankan auditor. |
| 2.4 Pemetaan channel | ⏳ | Pemetaan dan karantina ada; tes DB serta hubungan identitas lintas channel belum terbukti. G2-A01/A04 perlu diselesaikan. |
| 2.5 Daftar penerima uji | ⏳ | Cek server `isListedRecipient` ada dalam `sendOutbound`; tes server dan log pengiriman nyata belum dijalankan. |
| 2.6 Hasil kirim tidak pasti | ⏳ | Timeout/jaringan/5xx tidak retry buta di kode; G2-A06 untuk crash. Tes DB/mock belum dijalankan. |
| 2.7 Jendela layanan | ❌ | G2-A02: timestamp tidak dapat dibuktikan tetapi fallback membuka jendela. |
| 2.8 Echo WhatsApp Business App | ⏳ | Hanya simulasi dilaporkan; pengujian nomor nyata diwajibkan dan belum tersedia. |
| 2.9 History | ❌ | G2-A03: event langsung terlambat dapat menaikkan history dan memicu hook otomatisasi. |
| 2.10 Coexistence nyata | ⏳ | Belum diuji nyata; tahap belum lulus penuh. |

## Syarat audit ulang dan urutan tindakan

1. Developer memperbaiki G2-A01–A04, menambah test integrasi yang membuktikan skenario dan regresinya; tangani pula A05–A06.
2. Jalankan lint, typecheck, build, pemindaian rahasia riwayat, guard, seluruh test Gate 1–2, G1/G2 simulasi dan drill DB dari snapshot serta kosong pada **commit yang sama**. Periksa laporan dan exit code, sertakan tautan run dan commit.
3. Audit ulang Gate 1, putuskan dan catat keputusan pemilik; setelah diterima buat tag dan backup titik-kembali sesuai prosedur.
4. Siapkan staging terpisah, HTTPS, server, backup DB dan media; putuskan akses Meta, nomor uji, D-01/D-02/D-03 dan kebijakan retensi. Lakukan verifikasi resmi dan uji echo, history, kirim/terima serta coexistence nyata di nomor uji. Jangan mengubah nomor Admisi, Hotline, atau Halo AI.
5. Auditor menilai ulang seluruh CCP berdasarkan bukti baru; pemilik mengisi keputusan gate.

## Formulir keputusan pemilik — belum diisi

Tanggal rapat: ____  Peserta: ____  Commit: ____

Keputusan D-xx dan dasar: ____

KEPUTUSAN: [ ] LANJUT  [ ] LANJUT TERBATAS  [ ] TAHAN

Jika terbatas/ditahan: lingkup, syarat, PIC dan tenggat: ____

Tag penerimaan dan backup titik-kembali: ____  Diputuskan oleh: ____

---

## Keputusan pemilik — 26 November 2026
**Gate 2: LANJUT TERBATAS** (pernyataan tertulis pemilik di sesi audit), dasar: [`audit-ulang-gate-2-2026-11-26.md`](audit-ulang-gate-2-2026-11-26.md), commit `7f4577b` (kode = `046355936dc4` = staging).
**Lingkup terbuka:** impor riwayat (CCP 2.9 nyata, bagian riwayat CCP 2.10) — PIC pemilik (tiket Meta, keputusan Tech Provider) + developer (PR S-12); keputusan ≤ 20 Des 2026, bila tidak → go-live 15 Jan tanpa impor riwayat. Golden E2E G2 kirim-ulang webhook nyata — bersama uji Gate 3.
D-01, D-05, D-16, D-22 diputuskan (usulan default) pada tanggal yang sama. Tahap 3 boleh diuji nyata setelah dua syarat sisa: event `channel_tidak_dikenal` diperiksa; tag `tahap-1-diterima` dikonfirmasi.
- **Syarat event `channel_tidak_dikenal` — selesai (26 Nov):** satu event (id 1, 25 Nov 18:27 WIB, `message`, `phone_number_id` …6123, WABA …0) = pola **contoh webhook bawaan Meta** (tombol "Test" di dashboard; ID fiktif …123456123 / "0"). Bukan data pelanggan; dikarantina benar (CCP 2.4 nyata). Payload dikosongkan pemilik — diverifikasi `1|f` (payload_tersimpan = false).
