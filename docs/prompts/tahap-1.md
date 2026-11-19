# TAHAP 1 — Fondasi Produksi (v2)

**Peran:** Lead Software Architect, Full-Stack Developer, dan Application Security Engineer.
**Target waktu:** 18 Nov – 1 Des 2026 · **Gate 1:** ±2 Des 2026

---

## 0. Mulai dari sini

1. Periksa kondisi repository: branch, commit, dan isi. Jangan menimpa pekerjaan yang sudah ada. Jangan force push.
2. Jika belum ada di repository, tambahkan file dari paket v2 melalui PR pertama:
   - `AGENTS.md` (root)
   - `docs/decisions.md`
   - `docs/jalur-0.md`
   - `docs/gates/GATE-CHECKLIST.md`
   - `docs/prompts/tahap-1.md` … `tahap-9.md`

   Jika repository benar-benar kosong, buat `main` berisi file tersebut dan README minimal, lalu kerjakan Tahap 1 di branch `tahap-1-fondasi`.
3. Baca `AGENTS.md` dan `docs/decisions.md`. **Semua aturan di sana berlaku** dan tidak diulang di prompt ini.

---

## 1. Tujuan

Bangun fondasi yang dapat dijalankan, diuji, diaudit, dan dikembangkan ke Tahap 2 tanpa membangun ulang. Hasilnya berupa **kode yang berjalan**, bukan rancangan atau mockup.

## 2. Di luar lingkup

Koneksi WhatsApp nyata, inbox, AI, label, pipeline, follow-up, integrasi Internal Portal / Training & Operations, deployment production.

---

## 3. Arsitektur dan lingkungan

- Modular monolith sesuai AGENTS.md §5. Catat versi dan pertimbangan di **ADR-0001**.
- **ADR-0002:** mekanisme antrean/worker yang akan dipakai Tahap 2 untuk pemrosesan webhook yang tahan restart. Disarankan berbasis PostgreSQL agar tidak menambah infrastruktur. Tahap 1 cukup memutuskan dan menyiapkan kerangkanya.
- Tiga lingkungan: development, staging, production. Database dan rahasia terpisah. `.env.example` tanpa nilai rahasia. Panduan staging mencakup HTTPS, cookie, dan kontrol jaringan.
- Jika server staging belum tersedia (Jalur 0, J0-03), siapkan konfigurasinya dan catat **staging belum terverifikasi**.
- Endpoint health hanya menampilkan informasi seperlunya, tanpa konfigurasi sensitif.

## 4. Akun dan keamanan sesi

1. Akun TE One terpisah dari Internal Portal.
2. Pengguna berwenang dapat membuat, mengaktifkan, dan menonaktifkan pengguna serta mengatur identitas dasarnya.
3. Argon2id; session di server; session dicabut saat pengguna dinonaktifkan; pembatasan percobaan login; perlindungan CSRF; validasi input di server.
4. **2FA TOTP:**
   - **Wajib** untuk Super Admin. Akses administratif ditolak sebelum TOTP berhasil.
   - **Opsional** untuk pengguna lain, dan dapat diwajibkan oleh Super Admin per pengguna atau per peran.
   - Kode pemulihan sekali pakai (disimpan dalam bentuk hash) dan prosedur pemulihan akun yang terdokumentasi.
5. Super Admin pertama dibuat lewat **perintah bootstrap satu kali** (CLI). Tidak ada password bawaan.

## 5. Peran, izin, cakupan channel, dan tim

**Peran awal** (contoh, dapat diubah Super Admin): Super Admin, Manajer, Admin Admisi, Admin Hotline, Admin Kemitraan.

**Izin = aksi + cakupan.** Cakupan berupa *semua channel* atau *channel tertentu*. Contoh: Admin Hotline boleh `chat.balas` hanya di channel Hotline.

**Daftar izin minimal:**
kelola pengguna · kelola peran & izin · kelola tim · lihat channel · kelola channel · lihat chat · balas chat · ubah AI On/Off · alihkan chat · kelola balasan cepat · kelola agent · kelola Kartu Program & knowledge · kelola label & aturan · kelola pipeline · kelola template & follow-up · lihat laporan · ekspor data · lihat audit · kelola kill switch.

Izin untuk fitur yang belum dibuat boleh disiapkan; UI-nya diberi penanda **Belum tersedia**.

**Aturan:**
- Default menolak.
- Penolakan spesifik per pengguna mengalahkan izin yang diberikan peran.
- Hanya Super Admin yang dapat memberi atau mencabut hak Super Admin.
- Super Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan haknya.
- Perubahan izin berlaku pada permintaan berikutnya.

**Tim:** entitas sederhana (nama, anggota, channel yang ditangani). Dipakai untuk antrean dan routing di Tahap 3. Pada Tahap 1 cukup CRUD dan audit.

## 6. Channel

- Batas channel aktif/tidak diarsipkan adalah **pengaturan organisasi** (default 5). Batas ditegakkan di tingkat database agar aman dari permintaan bersamaan.
- Field:
  - nama;
  - **fungsi** (teks bebas, contoh: Admisi, Hotline, Kemitraan, Finance, Operator);
  - keterangan;
  - **jenis integrasi rencana**: `Cloud API — Coexistence` atau `Cloud API — API saja`;
  - lingkungan;
  - **status TE One** (default *Belum dikonfigurasi*);
  - penanda **operasional** (dipakai guard CI);
  - aktif/arsip;
  - pembuat & pengubah beserta waktunya.
- Arsip membebaskan slot; jejak audit tetap. Jelaskan aturan penggunaan ulang slot.
- Seed contoh (hanya development/staging, bertanda **CONTOH**): *Admisi — contoh*, *Hotline — contoh*, *Kemitraan — contoh*.
- Jangan membuat tombol "Hubungkan WhatsApp" yang tampak berfungsi.

## 7. Audit log

- **Peristiwa minimal:** login/logout, login gagal yang relevan, pembuatan dan perubahan pengguna, aktivasi/nonaktivasi, perubahan peran/izin/cakupan, perubahan tim, perubahan channel, perubahan pengaturan keamanan dan organisasi, perubahan kill switch.
- **Isi:** waktu, aktor, jenis tindakan, objek, hasil, ID korelasi.
- Append-only bagi aplikasi (misalnya hak database terpisah atau trigger yang menolak UPDATE/DELETE).
- Dokumentasikan batas perlindungan terhadap administrator database.

## 8. Fondasi regresi dan kontrol (dipakai semua tahap)

- CI sesuai AGENTS.md §10: lint, typecheck, build, test, **secret scanning**, dan **guard nomor operasional**. Guard memeriksa bahwa identitas channel bertanda operasional tidak muncul di konfigurasi, seed, atau fixture non-production.
- Konvensi tag test `@tahap-N`.
- Mekanisme **feature flag** per lingkungan, default mati.
- **Registri kill switch**: struktur data, fungsi pemeriksaan, dan UI Super Admin dasar dengan cakupan per chat, per channel, per fitur, dan global. Belum ada otomatisasi nyata yang dihentikan; uji dengan fungsi contoh.
- **Kerangka golden E2E**: G1 berjalan; G2–G8 disiapkan sebagai placeholder bertanda belum tersedia (lihat GATE-CHECKLIST bagian B).

## 9. Rancangan data lanjutan (dokumen, belum tabel)

**ADR-0003:** model `Kontak` → `Percakapan` (per kontak–channel) → `Pesan`.
- Identitas pelanggan memakai identitas yang disediakan Meta, tidak bergantung pada nomor yang tampil.
- Relasi ke sumber lead, label, pipeline, dan follow-up.
- Identitas internal stabil untuk integrasi Training & Operations di masa depan.

Tabelnya dibuat di Tahap 2.

## 10. Privasi

Dokumen klasifikasi data dan rancangan retensi sesuai **D-18** (masih usulan). Belum ada data pelanggan pada tahap ini.

## 11. Backup dan restore

- Backup database terenkripsi dengan akses terbatas.
- Rancangan penyimpanan salinan di lokasi terpisah.
- **Restore nyata** ke database terpisah memakai data contoh, verifikasi data terbaca, dan catat waktu serta hasil.
- RPO/RTO dicatat sebagai **D-12 belum dinilai**.
- Rancangan backup media untuk tahap berikutnya.

## 12. Tampilan

Halaman: login, dashboard awal, pengguna, peran & izin (termasuk cakupan channel), tim, channel, audit log, pengaturan organisasi (batas channel, zona waktu), kill switch (khusus Super Admin), dan penanda modul yang belum tersedia.

Identitas: **TE One — Enterprise Customer Relationship Management Platform**. Responsif, Bahasa Indonesia, dengan penanda lingkungan non-production.

---

## 13. CCP Tahap 1

Wajib lulus: **GATE-CHECKLIST bagian C — Gate 1 (1.1–1.9)**.

## 14. Uji minimum

**Autentikasi**
- Login benar dan salah.
- Pengguna nonaktif tidak bisa masuk dan session lamanya tidak berlaku.
- Logout membatalkan session.
- Pembatasan percobaan login.
- TOTP Super Admin wajib; kode pemulihan hanya berlaku sekali.

**Izin**
- Akses tanpa izin ditolak di server, baik lewat UI maupun API langsung.
- **Cakupan channel:** pengguna Hotline tidak dapat membaca data channel Admisi.
- Penolakan spesifik mengalahkan peran.
- Perubahan izin langsung berlaku.
- Pengguna biasa tidak dapat menjadikan dirinya Super Admin.
- Super Admin terakhir terlindungi.

**Channel**
- Data contoh tampil.
- Batas sesuai pengaturan; channel ke-(batas+1) ditolak.
- **≥ 20 permintaan paralel** tidak melewati batas.
- Arsip dan penggunaan ulang slot.
- Status tidak pernah tampil "terhubung".

**Audit dan data**
- Migrasi pada database kosong.
- Perubahan penting menghasilkan audit.
- Audit tidak dapat diubah dari aplikasi.
- Pengguna tanpa izin tidak dapat melihat audit.
- Backup–restore berhasil.
- Aplikasi dapat dijalankan ulang mengikuti README.

**Kontrol**
- Secret scan dan guard berjalan di CI.
- Feature flag mati berarti fitur tidak aktif.
- Kill switch contoh bekerja.

## 15. Dokumen yang diserahkan

README · arsitektur + ADR-0001..0003 · panduan development · panduan staging · keamanan & izin (termasuk cakupan channel dan tim) · backup & restore beserta hasil uji · **rencana integrasi Meta Tahap 2** (bagian 16) · klasifikasi data & rancangan retensi · daftar temuan & risiko peluncuran · laporan `docs/reports/tahap-1.md` (AGENTS.md §12).

## 16. Isi rencana integrasi Meta Tahap 2

Dokumentasikan hal yang harus dibuktikan sebelum Tahap 2:
- kepemilikan dan akses Meta Business, WABA, dan aplikasi Meta milik TE One;
- jalur akses **D-02** (Tech Provider atau BSP) dan persyaratan Embedded Signup untuk coexistence;
- nomor uji **D-03** dan syarat kelayakannya;
- mekanisme webhook dan validasinya;
- perilaku echo dari WhatsApp Business App;
- batas sinkronisasi riwayat;
- dampak pada perangkat tertaut;
- keterbatasan grup (**D-01**);
- kemungkinan harus memutus provider lama saat perpindahan;
- rencana migrasi yang **belum dijalankan**.

## 17. Kriteria selesai

Memenuhi **Gate 1** serta GATE-CHECKLIST bagian A dan B.

Jika staging belum tersedia: audit kode dan pengujian lokal dapat dilakukan, sedangkan bagian yang bergantung pada staging dinyatakan **tertunda**. Jangan memberikan persentase kesiapan.
