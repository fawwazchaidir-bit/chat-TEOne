# Catatan bukti uji Meta nyata di staging — 25 November 2026

> **Sifat dokumen ini (baca dulu).** Dicatat dari **laporan operator staging/pemilik** (instruksi developer Gate 1–2). Pembangun **tidak memiliki akses** ke server staging, akun Meta, maupun log-nya; **belum ada log/tangkapan layar yang disamarkan di repository**. Karena itu, menurut istilah AGENTS.md §4, setiap butir di bawah berstatus **"Dilaporkan lulus (nyata) — bukti belum terlampir"**, **belum** "Terbukti nyata" (definisi: *diuji nyata **dan** buktinya tersedia*). Status naik menjadi **Terbukti nyata** hanya setelah bukti disamarkan (§5) dilampirkan dan ditinjau. Dokumen ini **tidak mengubah** laporan audit asli (`docs/gates/gate-1*.md`, `gate-2.md`); tanggapan terhadapnya ada di `docs/gates/tindak-lanjut-gate-1-2-2026-11-25.md`.

## 1. Identitas uji
| Hal | Nilai |
|---|---|
| Tanggal | **25 November 2026** (jam mulai/selesai: **belum dicatat** — isi dari log) |
| Repository / commit yang berjalan | `fawwazchaidir-bit/chat-TEOne` · `9c297d36149bdac2133d0c6da1f53fef41629245` (branch `claude/lucid-carson-blf4x0`) |
| Lingkungan | **Staging** (`APP_ENV=staging`), domain `staging-chat.trilogikaedutama.id`, HTTPS lewat Caddy (menurut operator) |
| Channel uji | **Kemitraan Uji** |
| Nomor penguji yang diizinkan | berakhiran **4062** (daftar penerima uji) |
| Nomor WhatsApp Business uji | berakhiran **6319** |
| Yang **tidak** disentuh | Admisi (…1119), Hotline (…0124), koneksi/aplikasi Halo AI — sesuai instruksi; **pembangun tidak dapat memverifikasinya** dari sisi akun Meta |
| Catatan commit | Commit `9c297d3` **memuat kode Tahap 3 (simulasi)**; semua fitur Tahap 3 berada di balik flag **default mati** dan **dikunci server terhadap Meta asli** (lihat §4). Yang diuji di bawah adalah fungsi **Tahap 2** |

## 2. Hasil yang dilaporkan
| # | Hasil | Status pembuktian | Kaitan CCP/temuan | Batas pembuktian (apa yang TIDAK dibuktikan) |
|---|---|---|---|---|
| 1 | Pemetaan nomor ↔ WABA **terverifikasi** lewat Graph API | **Dilaporkan lulus (nyata)** — bukti belum terlampir | CCP 2.4, J0-01/02 | "Terverifikasi" = **pemetaan nomor saja** (bukan "siap menerima pesan"; G2-A05). Mode verifikasi harus tercatat **`nyata`** (bukan `simulasi`) — **periksa di panel koneksi** |
| 2 | Aplikasi TE One **terkonfirmasi berlangganan** pada WABA uji | **Dilaporkan lulus (nyata)** — bukti belum terlampir | G2-A05, G2-A07 | Bentuk respons `subscribed_apps` **belum diverifikasi ke dokumentasi Meta** (T2-F02); hasil ini hanya menunjukkan kode kita berhasil menafsirkan respons nyata **sekali** |
| 3 | Pesan **nyata** dari nomor 4062 **diterima & tersimpan** | **Dilaporkan lulus (nyata)** — bukti belum terlampir | CCP 2.1–2.4 (jalur masuk) | Jenis pesan yang diuji: **teks** (diasumsikan). Tidak membuktikan gambar/PDF, echo, history, atau volume |
| 4 | Pengirim **di luar daftar uji dikarantina** | **Dilaporkan lulus (nyata)** — bukti belum terlampir | CCP 2.5, D-03 | Nomor/identitas pengirim yang dipakai **belum dicatat**; tidak membuktikan perilaku untuk semua bentuk identitas (mis. `user_id`/BSUID) |
| 5 | Pesan **teks keluar** dari TE One **diterima** nomor 4062 | **Dilaporkan lulus (nyata)** — bukti belum terlampir | CCP 2.5–2.7 (jalur keluar) | **Satu** jalur sukses; tidak membuktikan gagal/belum pasti nyata, penolakan di luar jendela 24 jam, template, atau rate limit nyata |
| 6 | Status pesan keluar menjadi **Diterima** lewat webhook | **Dilaporkan lulus (nyata)** — bukti belum terlampir | status pesan (Tahap 2) | Hanya status **Diterima**; **Dibaca** tidak termasuk (lihat §3) |
| 7 | **Error Meta 10** saat kirim **teratasi** setelah izin akun pengiriman pesan diperbarui | **Dilaporkan** (kejadian + perbaikan) — bukti belum terlampir | T2-F02 (kode galat) | Pemetaan `10 → izin` di adapter **konsisten** dengan kejadian ini, tetapi **tabel kode galat belum diverifikasi ke dokumentasi Meta**. Perbaikannya ada di **konfigurasi akun Meta**, bukan di kode |
| 8 | Webhook sempat **gagal karena App Secret staging tidak sesuai**; setelah diperbaiki, event baru masuk | **Dilaporkan** (kejadian + perbaikan) — bukti belum terlampir | CCP 2.1 (tanda tangan) | Tanda tangan tidak cocok ⇒ webhook **ditolak (401) dan event tidak disimpan** (sesuai rancangan). Event yang tiba selama gangguan **tidak dijamin pulih** (bergantung pengiriman ulang Meta). Lihat §4 |
| 9 | Status **Dibaca**, echo, history, media, coexistence menyeluruh | **BELUM DIUJI** | CCP 2.8, 2.10 | Lihat §3 — tidak boleh dianggap lulus dari hasil 1–8 |

## 3. Yang BELUM terbukti dari hasil di atas (jangan disimpulkan lulus)
- **Status "Dibaca"** (`read`): tidak ada bukti; perlu penerima membuka pesan dengan tanda baca aktif.
- **Echo** dari WhatsApp Business App di ponsel (CCP 2.8) dan **history/sinkronisasi** (CCP 2.9 nyata): belum diuji. Status coexistence nomor 6319 (terhubung coexistence atau hanya Cloud API) **tidak diketahui pembangun**.
- **Media** (gambar/PDF masuk dan keluar), **jendela layanan 24 jam nyata**, **webhook duplikat nyata**, **kirim gagal/belum pasti nyata**, **rate limit nyata**, **template**.
- **Coexistence menyeluruh** (CCP 2.10): satu jalur teks tidak membuktikannya. Matriks uji terkontrol: `docs/tahap-2/matriks-uji-coexistence.md`.
- **Keandalan operasional** di staging: pemulihan, backup di server, kinerja, E2E G1 melalui HTTPS staging (GATE B5).

## 4. Temuan operasional dari uji nyata (masukan untuk perbaikan)
| ID | Prio | Temuan | Tindakan |
|---|---|---|---|
| **S-01** | sedang | **Kekeliruan App Secret tidak terlihat jelas**: webhook yang ditolak karena tanda tangan tidak menyimpan apa pun (rancangan benar), tetapi operator hanya menyadarinya karena "event tidak masuk". Tidak ada penghitung penolakan tanda tangan yang terlihat di alat uji integrasi | **Usulan (belum dikerjakan):** hitung penolakan tanda tangan (tanpa menyimpan payload) dan tampilkan di panel integrasi, agar kesalahan secret terdiagnosis cepat. Menunggu persetujuan lingkup |
| **S-02** | sedang | **Event yang ditolak selama gangguan secret dapat hilang** (bergantung retry Meta; periode & jumlahnya tidak dikendalikan kita) | Dicatat sebagai risiko; setelah memperbaiki secret, periksa pesan pelanggan yang mungkin terlewat melalui WhatsApp Business App sebelum menganggap data lengkap |
| **S-03** | tinggi (mitigasi sudah ada) | **Staging menjalankan commit yang memuat kode otomatisasi Tahap 3 (simulasi) dengan Meta ASLI.** Flag `ai_simulation` default mati, tetapi di staging dapat dinyalakan Super Admin dan akan mengirim teks `[SIMULASI]` lewat Graph API nyata | **Diperbaiki di commit lanjutan:** server **menolak** `ai_simulation` bila `META_GRAPH_BASE_URL` = `graph.facebook.com` (tes `Meta ASLI`); default (flag mati) terbukti 0 job & 0 panggilan Graph meski subscriber terdaftar. **Operator: pastikan flag `inbox` dan `ai_simulation` MATI di staging** (halaman Kill switch & flag) |
| **S-04** | rendah | Pemetaan error `10 → izin` baru terkonfirmasi lewat satu kejadian nyata | Verifikasi tabel kode galat ke dokumentasi Meta resmi (A7) |

## 5. Bukti yang harus dilampirkan agar status naik menjadi "Terbukti nyata"
Lampirkan di `docs/reports/bukti/` (**disamarkan**: tanpa token/App Secret/Verify Token/password, nomor hanya 4 digit akhir, tanpa isi chat pelanggan nyata):
1. Tangkapan layar panel koneksi channel (**mode `nyata`**, langganan **terkonfirmasi**, event diterima terakhir) — butir 1–3.
2. Potongan log webhook: respons 200 untuk pesan masuk; penolakan karantina (hanya `reason`, tanpa nomor lengkap) — butir 3–4.
3. Tampilan pesan keluar dengan status **Diterima** (+ waktu) — butir 5–6.
4. Potongan log galat Meta `10` (kode + kategori, tanpa token) dan hasil kirim setelah perbaikan izin — butir 7.
5. Catatan perbaikan App Secret (hanya fakta + waktu; **tanpa nilai**) — butir 8.
6. Nilai dari `docker image inspect` (revision label, id) dan `git rev-parse HEAD` di server — mengaitkan hasil ke commit/image (lihat laporan tindak lanjut §1).
