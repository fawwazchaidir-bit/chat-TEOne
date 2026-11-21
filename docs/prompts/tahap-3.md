# TAHAP 3 — Inbox Tim, Routing, Pengambilalihan, dan Kill Switch (v2)

**Peran:** Lead Full-Stack Developer, Software Architect, dan Application Security Engineer.
**Target waktu:** 23 Des 2026 – 12 Jan 2027 · **Gate 3:** ±12 Jan 2027
Boleh berjalan paralel dengan bagian simulator Tahap 4.

---

## 0. Baca dulu

`AGENTS.md`, `docs/decisions.md` (D-01, D-05, D-16, D-22), laporan Tahap 1–2, dan GATE-CHECKLIST Gate 3.

## 1. Gate masuk

- Gate 2 diterima, **atau** LANJUT TERBATAS dengan mock. Dalam kondisi terbatas, semua uji nyata inbox ditandai *belum lulus integrasi langsung*.
- D-05, D-16, dan D-22 sudah Diputuskan, atau dipakai sebagai ASUMSI tercatat.

## 2. Tujuan

Inbox bersama untuk sekitar 10 admin lintas channel: melihat, mencari, membalas, menugaskan, mengalihkan antartim, mengambil alih dari AI, dan menghentikan otomatisasi.

## 3. Di luar lingkup

AI yang benar-benar menjawab (Tahap 4), label & pipeline (Tahap 5), template & follow-up (Tahap 6), grup WhatsApp (D-01), broadcast.

---

## 4. Halaman inbox

**A. Navigasi**
- Semua percakapan yang boleh diakses pengguna.
- Per channel, per tim/antrian, *Ditugaskan ke saya*, dan *Belum ditugaskan*.
- Indikator kondisi channel sesuai data nyata.

**B. Daftar percakapan**
- Nama/identitas kontak, channel, ringkasan pesan terakhir, waktu, status belum dibaca.
- Status AI atau admin, tim dan PIC chat, penanda eskalasi.
- Pesan history yang masuk terlambat tidak memindahkan chat lama ke urutan teratas.

**C. Isi percakapan**
- Pesan masuk/keluar, waktu, jenis, dan status.
- Sumber pesan: *TE One* / *WhatsApp Business App* / *History*.
- Penanda media tidak tersedia atau jenis belum didukung, serta status belum pasti.
- **Catatan internal:** tampil berbeda dan **tidak pernah dikirim** ke pelanggan.

**D. Panel informasi**
- Data kontak dan sumber lead.
- **Riwayat percakapan kontak yang sama di channel lain**, hanya jika pengguna berizin pada channel tersebut.
- Status AI, tim, PIC, dan aktivitas penting.

## 5. Pencarian, filter, urutan, dan pemuatan

- Pencarian berdasarkan nama atau identitas kontak.
- Filter: channel, tim, PIC, belum dibaca, status AI, eskalasi.
- Pagination atau pemuatan bertahap.
- Semua filter dan **jumlah** menerapkan izin channel di server.

## 6. Status belum dibaca

Sesuai **D-16** (default: per pengguna). Webhook duplikat dan history tidak menambah jumlah belum dibaca. Dokumentasikan aturannya.

## 7. Tim, antrian, penugasan, dan routing

- Percakapan baru masuk ke antrian **tim default channel** (dapat diatur per channel).
- Penugasan terdiri atas tim dan PIC chat (opsional). Dapat diubah atau dilepas sesuai izin. Perubahan bersamaan terdeteksi dan teraudit.
- **Alihkan ke tim lain di percakapan yang sama**, misalnya lead nyasar di Hotline dialihkan ke Tim Admisi (**D-22**). Pelanggan tidak diminta pindah nomor.
- **Akses tim tujuan dibatasi pada percakapan yang dialihkan**, bukan seluruh channel. Seluruh akses tercatat.
- Penanda manual **Lead Nyasar** tersedia. Deteksi otomatis dikerjakan di Tahap 4.
- PIC chat berbeda dari PIC pipeline (Tahap 5).

## 8. Balasan manual dan balasan cepat

- Jenis: teks, gambar, PDF.
- Dikirim lewat channel percakapan yang benar; penerima diambil dari percakapan; izin diperiksa di server.
- Jendela layanan diperiksa; jika tertutup, tampilkan alasannya.
- Idempoten; status sesuai bukti provider; tidak ada retry buta.
- Admin membalas → **AI Off** pada chat tersebut. AI tetap Off walaupun pengiriman gagal.
- **Balasan cepat:** pustaka teks per channel/tim dengan variabel aman (misalnya nama kontak), dikelola pengguna berizin dan teraudit. Balasan cepat tetap melewati pemeriksaan jendela layanan.

## 9. Status AI dan pengambilalihan

Mesin status per percakapan (AGENTS.md §6.4):
- **AI Aktif** atau **AI Off**, dengan alasan: admin mengambil alih, admin membalas, eskalasi, balasan dari HP, kill switch, atau manual.
- Setiap perubahan mencatat versi, aktor, dan waktu.

Aksi yang tersedia:
- **Ambil alih / Matikan AI.**
- **Aktifkan kembali AI**, manual dan satu per satu.

Aturan aktivasi ulang:
- Saat diaktifkan, sistem mencatat **batas**. Hanya pesan pelanggan baru setelah batas yang layak diproses.
- Pesan lama, history, duplikat, dan event terlambat yang waktunya sebelum batas **tidak layak**.
- Jika urutan tidak dapat dipastikan: tandai untuk ditinjau, jangan diproses.

Tampilan UI harus jujur: tampilkan **"AI disiapkan — agent belum terhubung"** sampai Tahap 4 tersedia.

Echo dari HP diproses sesuai **D-05** (default: pesan keluar baru dari HP → AI Off). Event lama atau duplikat tidak boleh membalik status yang sudah diperbarui.

## 10. Pencegahan benturan AI dan admin

- Pengambilalihan memperbarui status dan versi secara **atomik**.
- Job AI simulasi yang belum terkirim memeriksa ulang versi, lalu dibatalkan atau ditahan.
- Job yang sudah dikirim ke Meta ditampilkan sebagai **"sedang dikirim / belum pasti"**. Jangan menjanjikan pesan tersebut bisa dibatalkan.

Uji seluruhnya memakai job AI simulasi.

## 11. Kill switch (wajib dibuat sebelum ada otomatisasi nyata)

- Berlaku untuk semua pengiriman otomatis, pada empat tingkat:
  - per chat (AI Off);
  - per channel (*Jeda otomatisasi channel*);
  - per fitur (AI, follow-up);
  - global.
- Diperiksa **tepat sebelum kirim**.
- Tidak pernah menyala kembali sendiri.
- Hanya dapat diubah pengguna berizin, teraudit, dan tampil jelas di UI.

## 12. Pembaruan tampilan

Gunakan polling atau realtime (SSE/WebSocket). Ketentuannya:
- izin diperiksa di server untuk setiap event;
- tidak membocorkan isi percakapan ke pengguna yang tidak berhak;
- tidak menimbulkan duplikasi tampilan;
- pulih setelah koneksi browser terputus;
- beban server terkendali.

Catat pilihan dan alasannya dalam ADR.

## 13. Hak akses dan audit

**Izin per cakupan channel:** lihat inbox, balas, ubah AI, ubah penugasan/tim, alihkan, kelola balasan cepat, tulis catatan internal, kelola kill switch.

**Audit:** pengambilalihan, AI On/Off, penugasan dan pengalihan, permintaan kirim manual, kegagalan atau hasil belum pasti, kill switch, perubahan balasan cepat.

## 14. Keamanan

- Validasi input di server.
- Perlindungan XSS untuk isi pesan dan nama file.
- Query yang aman.
- Akses media mengikuti izin percakapan.
- Pengguna nonaktif ditolak, termasuk lewat session lama.
- Log tanpa isi chat yang berlebihan.

---

## 15. CCP Tahap 3

Wajib lulus: **GATE-CHECKLIST bagian C — Gate 3 (3.1–3.7)**.

## 16. Uji minimum

**Inbox**
- Daftar tampil sesuai channel dan izin.
- Kontak yang sama di dua channel tidak tertukar.
- Panel riwayat lintas channel menghormati izin.
- Pencarian, filter, dan jumlah tidak membocorkan data.
- Unread sesuai D-16.
- History tidak muncul sebagai pesan baru.

**Routing**
- Percakapan baru masuk antrian default.
- Pengalihan ke tim lain.
- Akses tim tujuan terbatas pada percakapan yang dialihkan.
- Dua admin mengubah penugasan bersamaan.

**Balasan**
- Teks, gambar, dan PDF ke peserta uji lewat nomor uji.
- Pengguna tanpa izin ditolak.
- Klik ganda tidak membuat pesan ganda.
- Status gagal dan belum pasti tampil.
- Pengiriman di luar jendela diblokir.
- Balasan cepat berfungsi.
- Catatan internal tidak pernah terkirim.

**Status AI**
- Admin membalas → AI Off.
- Admin mengambil alih tanpa membalas → AI Off.
- AI tidak menyala kembali sendiri.
- Aktivasi ulang manual.
- Pesan lama tidak layak; pesan baru setelah aktivasi layak.
- Webhook terlambat atau duplikat tidak memicu pemrosesan.
- History tidak memicu pemrosesan.
- Job simulasi dibatalkan setelah pengambilalihan.
- Job yang sudah dikirim ditampilkan jujur.
- Echo dari HP diproses sesuai D-05.

**Kill switch**
- Tingkat per chat, channel, fitur, dan global menghentikan job simulasi dalam **< 1 menit**.
- Kill switch tidak menyala kembali sendiri.

**Kerja bersama**
- Dua admin membalas pada waktu berdekatan.
- Perubahan terlihat oleh pengguna lain tanpa refresh manual.
- Izin yang dicabut berlaku pada permintaan berikutnya.
- Pembaruan realtime tidak membocorkan data.

**Regresi:** seluruh test `@tahap-1` dan `@tahap-2` lulus. Golden E2E G1–G3, G5 (bagian aktivasi), dan G8 berjalan.

## 17. Kriteria selesai

Memenuhi **Gate 3**. Tanpa uji nyata dengan nomor uji, tahap dinyatakan **belum lulus untuk integrasi langsung**.

## 18. Dokumen yang diserahkan

- Panduan inbox.
- Tim, antrian, dan routing (termasuk aturan akses percakapan yang dialihkan).
- Alur AI–admin.
- Kill switch.
- Status belum dibaca dan penugasan.
- ADR pembaruan tampilan.
- Laporan `docs/reports/tahap-3.md`.
