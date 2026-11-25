# Keputusan pemilik — Fase 0 (26 November 2026 WIB)

> Mencatat keputusan tertulis pemilik proyek yang disampaikan di sesi audit (lanjutan `audit-gate-1-2-2026-11-25.md` §6 Fase 0).
> Teks pemilik dikutip **apa adanya**. Catatan auditor ditulis terpisah dan tidak mengubah keputusan.
> Bukan keputusan gate; tidak membuat tag.

## 1. Keputusan yang sudah diambil

| Kode | Pernyataan pemilik (verbatim) | Dicatat sebagai | Syarat/catatan auditor |
|---|---|---|---|
| **D-03** nomor uji | "gunakan 6319 karena hanya nomor itu yang ready, ekosistem sudah dipastikan tidak ada chat masuk di nomor tersebut" | **Diputuskan:** nomor uji = …6319 (channel Kemitraan Uji); dasar: satu-satunya nomor siap; pemilik menyatakan tidak ada chat pelanggan masuk ke nomor ini | Lihat §2 — syarat sebelum M-12 |
| **A-4** worker staging | "ya setuju" | **Disetujui:** jalankan worker terpisah di staging (opsi W1, `pemeliharaan-inline-vs-worker.md`) | Jalankan setelah kueri baca-saja §5 dicatat (angka saja), dengan `-p deploy`. Menutup S-10 dan sebagian G2-B03 |
| **G12** koneksi …6319 | "ya tetap tersambung" | **Diputuskan:** …6319 tetap tersambung ke webhook staging | Pesan pengirim di luar daftar uji tetap dikarantina + payload dibuang (kode). Pantau hitungan karantina (angka saja) per minggu |
| **Bukti uji nyata** | "sudah dilakukan dalam staging dan berhasil" | **Dinyatakan pemilik** | Agar berstatus "Terbukti nyata" (AGENTS.md §4), keluaran teksnya perlu ada di `docs/reports/bukti/` — lihat §3 |

## 2. Syarat D-03 sebelum M-12 (sinkronisasi riwayat)

Dokumentasi resmi Meta (`tahap-2/verifikasi-dokumentasi-meta-2026-11-26.md` V-4): sinkronisasi riwayat mengirim **pesan 180 hari terakhir** yang ada di WhatsApp Business App nomor itu. Laporan Fase 0 (26 Nov, [OP]) mencatat ponsel …6319 **berisi chat pelanggan nyata**; pernyataan pemilik hari ini menyatakan tidak ada chat masuk.

Keduanya bisa sama-sama benar ("tidak ada chat **baru** masuk" vs "masih ada riwayat chat **lama**"). Karena itu:
- **M-11 (echo)** boleh berjalan pada …6319 sesuai izin 26 Nov (satu operator, tanpa aktivitas lain).
- **M-12 (history) pada …6319 hanya boleh** bila pemilik menyatakan tertulis bahwa **tidak ada chat pelanggan dalam 180 hari terakhir** di ponsel itu (cukup ya/tidak; tanpa isi). Bila ada, riwayat itu akan tersalin ke staging = data pelanggan nyata di non-production (AGENTS.md §3.5). Dalam kasus itu M-12 ditunda sampai ada nomor uji bersih, atau chat lama dihapus dari ponsel lebih dulu (keputusan pemilik).

## 3. Bukti teks yang diminta (tanpa tangkapan layar, tanpa isi pesan)

Tempel keluaran berikut dari VPS staging (cukup teks, nomor 4 digit akhir):
```bash
cd /home/TEAdmin/chat-TEOne && git rev-parse HEAD && git status --short
sudo docker image inspect teone-app:staging --format '{{.Id}} {{.Created}} {{ index .Config.Labels "org.opencontainers.image.revision" }}'
sudo docker compose -p deploy ps
```
dan hasil kueri hitungan (angka saja) di `tahap-2/runbook-uji-m11.md` paket kueri, ditambah `SELECT now();`. Itu cukup untuk jalur J2.

## 4. Keputusan yang masih perlu diambil — siap diputuskan

Cukup balas "D-xx setuju" atau tulis perubahan. Angka di bawah usulan auditor, **bukan nasihat hukum**.

### D-12 — RPO/RTO (dua tingkat)

| Lingkungan | RPO (data hilang maks.) | RTO (waktu pulih maks.) | Cara | Kapan berlaku |
|---|---|---|---|---|
| **Staging (sekarang)** | ≤ 24 jam | ≤ 1 hari kerja | `scripts/backup.sh` harian (DB + media, terenkripsi) via cron; simpan 7 backup harian; salinan terenkripsi di luar VPS (akun/penyimpanan berbeda); uji restore terisolasi tiap bulan dan setelah setiap migrasi | Segera |
| **Production (target)** | ≤ 1 jam | ≤ 4 jam kerja | Backup harian + arsip WAL kontinu (mis. pgBackRest/WAL-G) ke penyimpanan terpisah; uji restore sebelum go-live dan tiap bulan | Dibangun dan diuji di Tahap 7, sebelum nomor pertama pindah |

PIC: **pembuat** backup = operator staging; **pemeriksa** (cek checksum + restore) = orang berbeda. Kunci enkripsi disimpan terpisah dari VPS.
Alasan: staging hanya berisi data uji, jadi RPO 1 jam belum perlu; production tetap memakai target awal.

### D-18 — Retensi data (aturan sementara staging + arah production)

**Staging (berlaku segera):**
1. Staging **tidak boleh menyimpan data pelanggan nyata.** Pengirim di luar daftar uji → karantina, payload dibuang (sudah di kode).
2. Payload webhook mentah: ≤ 30 hari (sudah di kode; berjalan setelah worker A-4 aktif).
3. Log teknis (aplikasi, Caddy): ≤ 30 hari, tanpa isi chat; mode debug Caddy mati.
4. Chat/media penguji: dihapus saat staging di-reset, paling lambat sebelum go-live.
5. Backup staging: ikut rotasi 7 hari (D-12), jadi data yang dihapus hilang dari backup ≤ 7 hari kemudian.
6. Bila data pelanggan nyata ditemukan tersimpan di staging: catat insiden (jumlah, bukan isi), hapus ≤ 3 hari kerja, laporkan ke pemilik.

**Production (arah, final setelah tinjauan penasihat hukum sebelum Tahap 7):** payload mentah ≤ 30 hari · log teknis ≤ 90 hari · chat & media 2 tahun lalu dihapus/diarsip · permintaan akses/hapus data pelanggan ≤ 14 hari kerja, teraudit · data ke provider AI tanpa nomor telepon · pihak ketiga (Meta, provider AI) dan lokasi server dicatat.

### D-02 — Jalur akses Meta
Usulan: **Lanjut dengan aplikasi Meta milik sendiri "Trilogika Edutama TE-One"** (sudah dipakai di staging menurut pernyataan pemilik). Sebelum Tahap 8 (perpindahan Admisi/Hotline), pastikan status Tech Provider/Embedded Signup sesuai dokumentasi Meta terbaru; bila per 15 Des 2026 belum jelas, siapkan BSP resmi sebagai cadangan.
Yang perlu Anda isi: jalur apa yang **sebenarnya** dipakai saat onboarding …6319 (Tech Provider sendiri / BSP / lainnya).

### D-04 — Cakupan go-live dan jadwal
Usulan: **terima cakupan default** (`decisions.md` §D-04) tanpa perubahan. Jadwal tetap; nomor pertama mulai 16 Mar 2027, freeze 4–15 Mar 2027. Kode Tahap 3 sudah ada lebih awal (simulasi), jadi jadwal Tahap 3–4 punya cadangan waktu.

## 5. Dampak ke temuan audit

| Temuan | Dampak |
|---|---|
| G1-B02 (keputusan Terbuka) | D-03 diputuskan; D-02, D-04, D-12, D-18 menunggu §4 |
| G2-B02 (data pelanggan ke staging) | **Risiko diterima pemilik** dengan mitigasi karantina + syarat §2; tetap terbuka sampai D-18 staging diputuskan |
| G2-B03 / S-10 (tanpa worker) | Tertutup setelah worker berjalan dan kueri §5 dicatat |
| G2-B05 (bukti tanpa artefak) | Terbuka sampai bukti teks §3 ditempel |
