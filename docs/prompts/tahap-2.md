# TAHAP 2 — Konektor WhatsApp Cloud API & Coexistence (v2)

**Peran:** Lead Backend Developer, WhatsApp Integration Engineer, dan Application Security Engineer.
**Target waktu:** 2 – 22 Des 2026 · **Gate 2:** ±22 Des 2026
Uji nyata bergantung pada Jalur 0: **J0-01** (D-02), **J0-02** (D-03), dan **J0-03** (staging HTTPS).

---

## 0. Baca dulu

`AGENTS.md`, `docs/decisions.md` (D-01, D-02, D-03, D-18), laporan dan gate Tahap 1, serta GATE-CHECKLIST Gate 2.

## 1. Gate masuk

- Gate 1 diterima (tag `tahap-1-diterima`).
- Jika akses Meta, staging, atau nomor uji belum tersedia: kerjakan dengan fixture/mock, laporkan **uji nyata belum dilakukan**, dan Tahap 2 berstatus **belum lulus penuh**.

## 2. Tujuan

Konektor resmi Meta Cloud API yang aman, idempoten, dan **terbukti nyata** dengan nomor uji, termasuk coexistence.

## 3. Di luar lingkup

Inbox tim (Tahap 3), AI (Tahap 4), label & pipeline (Tahap 5), UI template & follow-up (Tahap 6), migrasi nomor operasional, impor data Halo AI.

---

## 4. Akses dan lingkungan uji

- Gunakan **aplikasi Meta milik TE One** (bukan milik Halo AI) dan jalur akses sesuai **D-02**.
- Gunakan nomor uji sesuai **D-03**. Jika nomor Kemitraan dipakai sebagai nomor uji:
  - nomor belum dipublikasikan;
  - pesan dari pengirim di luar daftar uji disimpan seminimal mungkin, **tidak** diproses otomatisasi apa pun, ditandai, dan dilaporkan.
- **Sebelum** onboarding coexistence nomor uji, dokumentasikan dari dokumentasi Meta terbaru:
  - syarat Embedded Signup dan status partner;
  - versi WhatsApp Business App yang dibutuhkan;
  - pemutusan perangkat tertaut;
  - PIN verifikasi dua langkah;
  - batas waktu dan jumlah permintaan sinkronisasi riwayat;
  - rentang riwayat teks dan media;
  - batas throughput;
  - kemungkinan harus memutus provider sebelumnya.

  Buktikan pada nomor uji, lalu tuliskan **implikasinya untuk Kemitraan, Admisi, dan Hotline**. Dokumen ini menjadi bahan utama Tahap 8.
- Bedakan dua jenis uji:
  - **Uji Cloud API:** API dapat menerima dan mengirim pesan.
  - **Uji coexistence:** nomor yang sama aktif di WhatsApp Business App dan Cloud API.

## 5. Model data (implementasi ADR-0003)

- **`Kontak`:** identitas pelanggan dari Meta (jangan hanya nomor yang tampil). Satu kontak dapat memiliki percakapan di beberapa channel.
- **`Percakapan`:** satu per pasangan kontak–channel.
- **`Pesan`:** arah; sumber (*Pelanggan* / *TE One* / *WhatsApp Business App* / *History*); jenis; waktu provider; waktu diterima; status; ID Meta.
- **`SumberLead`:** data referral (misalnya Click-to-WhatsApp) jika disediakan Meta, ditautkan ke percakapan dan pesan pertama. Jangan mengasumsikan setiap pesan memilikinya.
- **Pemetaan channel:** ID internal ↔ WABA ↔ `phone_number_id` ↔ lingkungan ↔ status verifikasi. Status "terhubung" hanya berasal dari pemeriksaan nyata.

## 6. Adapter Meta

Modul terpisah dari inbox dan UI.
- Kirim pesan: teks, gambar, PDF.
- **Fungsi kirim template** (dipakai di Tahap 6; uji nyata pada tahap ini opsional).
- Unggah dan unduh media lewat mekanisme resmi.
- Normalisasi event dari webhook.
- **Rate limiter** sesuai batas throughput channel.
- Versi API Meta yang didukung, dicatat di dokumentasi.
- Kesalahan Meta dipetakan ke kategori operasional.
- Kredensial dari secret store per lingkungan. Jika harus disimpan persisten, enkripsi dengan kunci yang dikelola terpisah dari database.

## 7. Webhook

1. Verifikasi challenge sesuai mekanisme Meta.
2. Validasi `X-Hub-Signature-256` terhadap **raw body** dengan perbandingan yang aman, **sebelum** parsing.
3. Tolak permintaan dengan tanda tangan salah atau tidak ada.
4. Tangani payload yang berisi beberapa event.
5. **Simpan event valid secara andal sebelum respons sukses.** Jika penyimpanan gagal, jangan berikan respons sukses.
6. Proses lewat antrean yang tahan restart (ADR-0002), secara idempoten dengan kunci unik event.
7. Event yang tidak dikenal atau berasal dari channel tak dikenal → **karantina**, tidak pernah masuk ke channel lain.
8. Event gagal memiliki status dan cara pemrosesan ulang.
9. Payload mentah dibatasi retensinya (D-18) dan tidak pernah masuk log aplikasi.

## 8. Pesan masuk dan keluar

- **Jenis wajib:** teks, gambar, PDF. Jenis lain: simpan metadata yang tersedia, tampilkan "jenis pesan belum didukung", dan jangan menggagalkan pemrosesan percakapan.
- **Media:** privat; tipe dan ukuran divalidasi; URL dan token sementara tidak dicatat di log; akses selalu melewati pemeriksaan izin.
- Pengiriman manual hanya lewat alat uji (bagian 11) ke daftar penerima uji.
- **Kunci idempotensi** untuk setiap permintaan kirim.
- **Status:** diproses → diterima API → terkirim → diterima → dibaca / gagal / **belum pasti**. Tangani status yang datang berulang, tidak berurutan, atau sebelum pesan selesai dicatat.
- **Timeout** → status belum pasti → rekonsiliasi. **Tidak ada retry buta.**

## 9. Echo WhatsApp Business App dan riwayat

**Echo** (`smb_message_echoes` dan event setara yang tersedia):
- dicatat sebagai pesan keluar bersumber *WhatsApp Business App*;
- dideduplikasi;
- tidak memicu pengiriman ulang;
- tidak dianggap pesan pelanggan.

Dampak echo terhadap status AI diatur di Tahap 3 (**D-05**).

**Sinkronisasi riwayat dan kontak** (jika diizinkan pada nomor uji):
- tangani persetujuan maupun penolakan berbagi riwayat;
- tangani chunk yang tidak berurutan dan status progres;
- tangani media riwayat yang tidak tersedia;
- deduplikasi terhadap event langsung;
- tandai sebagai **History**;
- history **tidak** memicu AI, follow-up, label, maupun unread.

Riwayat yang tersimpan di Halo AI adalah hal terpisah dan tidak boleh dijanjikan ikut pindah.

## 10. Jendela layanan

- Hitung dari pesan pelanggan yang terbukti, memakai waktu server/provider. History dan echo tidak dihitung.
- Jika jendela tertutup atau tidak dapat dipastikan: blokir pesan bebas dan tampilkan alasannya.
- Pengiriman template di luar jendela dikerjakan di Tahap 6.

## 11. Alat uji integrasi

Halaman internal dengan izin khusus. Berisi:
- status channel uji;
- pesan dan status yang tersimpan;
- pengiriman teks, gambar, dan PDF ke peserta uji;
- kesalahan dan status belum pasti;
- penanda sumber pesan (*TE One* / *WhatsApp Business App* / *History*).

Daftar penerima uji ditegakkan di server. Alat ini **bukan** inbox operasional.

---

## 12. CCP Tahap 2

Wajib lulus: **GATE-CHECKLIST bagian C — Gate 2 (2.1–2.10)**.

## 13. Uji minimum

**Webhook dan keamanan**
- Challenge valid dan tidak valid.
- Tanda tangan valid, salah, tidak ada, dan payload yang diubah setelah ditandatangani.
- Beberapa event dalam satu payload.
- Event ganda: kirim ulang **≥ 100 event**.
- Channel tidak dikenal.
- Database mati saat event diterima.
- Restart worker.

**Pesan dan channel**
- Teks masuk dan tersimpan.
- Balasan teks ke peserta uji.
- Gambar dan PDF masuk/keluar.
- Echo dari HP dikenali sebagai pesan keluar.
- Status pesan sesuai bukti.
- Event terlambat tidak merusak status.
- Kontak yang sama di dua channel tidak tertukar.
- Simulasi 5 channel; pemetaan yang salah ditolak.
- Data referral tersimpan jika ada (gunakan fixture jika tidak ada iklan uji).

**Keandalan**
- Klik ganda.
- Timeout dengan hasil tidak diketahui.
- Status yang datang sebelum pesan selesai dicatat.
- Pengiriman di luar jendela diblokir.
- Alat uji tanpa izin ditolak.
- History tidak memicu apa pun.
- Pengirim di luar daftar uji tidak diproses otomatisasi.

**Regresi:** seluruh test `@tahap-1` lulus.

Pisahkan hasil menjadi: **otomatis/mock** · **nyata Meta** · **belum dapat diuji**.

## 14. Kriteria selesai

Memenuhi **Gate 2**. Jika coexistence nyata belum diuji, Tahap 2 dinyatakan **belum lulus penuh** meskipun uji mock lulus.

## 15. Dokumen yang diserahkan

- Arsitektur konektor dan alur data.
- Panduan konfigurasi staging dan daftar variabel lingkungan (tanpa rahasia).
- Panduan uji dengan nomor uji.
- Webhook dan validasi keamanan.
- Status pesan dan penanganan hasil belum pasti.
- **Catatan coexistence terverifikasi beserta implikasinya per nomor (Kemitraan, Admisi, Hotline)**.
- Keterbatasan grup (D-01).
- Laporan `docs/reports/tahap-2.md`.
