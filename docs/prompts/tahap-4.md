# TAHAP 4 — AI Agent, Kartu Program, Knowledge, Simulator, dan Eskalasi (v2)

**Peran:** Lead Full-Stack Developer, AI Application Architect, dan Application Security Engineer.
**Target waktu:** 23 Des 2026 – 2 Feb 2027 · **Gate 4:** ±2 Feb 2027
Bagian agent, Kartu Program, knowledge, dan simulator boleh berjalan paralel dengan Tahap 3. Uji nyata ke WhatsApp dilakukan setelah Gate 3.

---

## 0. Baca dulu

`AGENTS.md` (terutama §8), `docs/decisions.md` (D-09, D-10, D-15, D-20, D-21, D-22, D-23), laporan Tahap 1–3, dan GATE-CHECKLIST Gate 4.

Bahan dari Jalur 0: **J0-08** (data Kartu Program) dan **J0-09** (set pertanyaan uji).

## 1. Gate masuk

- Agent, Kartu Program, knowledge, dan simulator: boleh dimulai setelah Gate 2 dengan data simulasi.
- Pengiriman AI ke WhatsApp nyata: setelah **Gate 3** diterima.
- **D-09** (provider, model, batas biaya) **wajib** sudah Diputuskan sebelum memakai provider berbayar.

## 2. Tujuan

AI agent yang:
- dapat dikonfigurasi;
- menjawab hanya dari sumber yang diizinkan;
- memvalidasi jadwal dan tautan lewat kode;
- melakukan eskalasi ke tim yang tepat;
- berhenti saat admin mengambil alih;
- dapat dihentikan kapan saja.

## 3. Di luar lingkup

Label & pipeline (Tahap 5), follow-up (Tahap 6), **asisten internal** (ditunda sampai setelah go-live), integrasi Training & Operations, nomor operasional.

---

## 4. AI Agents

Halaman **AI Agents** untuk pengguna berwenang:
- buat agent;
- ubah nama, peran, identitas, bahasa, gaya, sapaan, penggunaan emoji, dan instruksi;
- pilih sumber (Kartu Program dan knowledge);
- atur eskalasi dan tim tujuan;
- nonaktifkan agent;
- lihat channel yang memakai agent;
- alur **draft → terbit** dengan izin terbit terpisah;
- riwayat versi.

**Aturan**
- Nama tidak dikunci di kode (*Chelsea* hanyalah data).
- Satu channel hanya memiliki satu agent aktif; satu agent boleh dipakai di banyak channel.
- Agent yang sedang dipakai tidak boleh dihapus tanpa penanganan penempatannya.
- Semua perubahan teraudit.

**Agent contoh** (bertanda CONTOH):
- **Chelsea — Admisi**
- **Agent Hotline — contoh** (pertanyaan dan keluhan peserta)
- **Agent Uji Kedua** (untuk membuktikan pemisahan knowledge)

## 5. Pergantian agent

- Riwayat percakapan tetap tersedia.
- Agent baru hanya menangani pesan pelanggan baru setelah pergantian.
- Chat yang AI Off tetap Off; pergantian tidak mengaktifkan chat secara massal.
- Hasil agent lama diperiksa ulang sebelum dikirim.
- Riwayat chat yang sama boleh dipakai sebagai konteks, tetapi bukan sebagai antrean pesan yang harus dijawab.
- Perubahan dicatat dengan waktu, pengguna, agent lama, dan agent baru.

## 6. Gaya awal Chelsea

Dapat diubah tanpa mengubah kode.
- Bahasa Indonesia; resmi, ramah, dan sopan; sapaan *Bapak/Ibu*.
- Maksimal **2 kalimat** per balasan, **15 kata** per kalimat, dan **1 pertanyaan** per balasan.
- Bertanya secara bertahap dan menunggu jawaban pelanggan sebelum lanjut.

**Pengecualian brief program:** boleh mengirim satu pesan teks yang lebih panjang sesuai Kartu Program. Flyer hanya dikirim jika tersedia dan diizinkan.

Aturan gaya divalidasi oleh aplikasi sebelum kirim. Jika jawaban melanggar, sistem memperbaiki sekali melalui model atau melakukan eskalasi, sesuai konfigurasi.

**Pemberitahuan AI** mengikuti **D-10** (default: sapaan pertama menyebut "asisten virtual Trilogika").

## 7. Kartu Program (data terstruktur)

Kartu Program adalah **entitas form**, bukan dokumen. Field:
- nama dan kode program;
- kategori;
- mode (online/offline) dan lokasi/kota;
- jadwal (tanggal mulai–selesai, zona waktu);
- **tanggal tutup pendaftaran**;
- harga dan ketentuan yang boleh disebut;
- persyaratan;
- **tautan pendaftaran resmi** (URL tervalidasi);
- flyer/PDF (media yang diizinkan);
- brief teks;
- alur percakapan khusus (opsional);
- status (Draft / Aktif / Diarsipkan);
- versi;
- agent yang boleh memakai.

**Validasi oleh kode, bukan oleh model.** Tautan hanya boleh dikirim jika:
- program berstatus Aktif;
- tanggal tutup pendaftaran ≥ sekarang (Asia/Jakarta);
- jadwal belum lewat;
- URL tercantum.

Jika salah satu syarat gagal: jangan kirim tautan, sampaikan bahwa informasi akan dikonfirmasi, lalu lakukan eskalasi.

Harga, diskon, atau cicilan yang tidak ada di Kartu Program → eskalasi.

Kartu Program menjadi sumber tunggal informasi program. Data awal dari J0-08 dimasukkan manual oleh pengguna berizin di staging.

## 8. Knowledge (tidak terstruktur)

- Dua jenis: **shared** dan **khusus agent**.
- Format: teks langsung, TXT, PDF berbasis teks, DOCX. OCR untuk hasil scan menjadi pekerjaan terpisah.
- Status: Draft / Sedang diproses / Siap ditinjau / Aktif / Gagal diproses / Diarsipkan.
- Hanya sumber **Aktif** yang diizinkan untuk agent tersebut yang boleh dipakai.
- Versi dan audit untuk setiap perubahan.
- Shared knowledge tidak otomatis berlaku untuk semua agent.
- Akses difilter **sebelum** materi dikirim ke model.
- Metode retrieval (full-text, vektor, atau kombinasi) ditentukan developer dan dicatat dalam ADR.

## 9. Jawaban

- Hanya memakai sumber aktif dan diizinkan.
- Harga, jadwal, persyaratan, lokasi, dan tautan **wajib** berasal dari Kartu Program.
- Catat ID dan versi sumber untuk setiap jawaban.
- Untuk keperluan internal, tampilkan hanya sumber yang benar-benar dipakai.
- Jangan mengklaim bahwa AI bebas dari kesalahan.

## 10. Eskalasi

**Kondisi eskalasi:**
- pelanggan minta berbicara dengan manusia;
- komplain;
- pertanyaan di luar knowledge;
- program tidak ada di Kartu Program;
- bantuan pendaftaran yang tidak dapat dilakukan agent;
- negosiasi, diskon, paket, cicilan, atau invoice di luar Kartu Program;
- kebutuhan untuk tim, karyawan, lembaga, sekolah, instansi, atau kelompok;
- **≥ 5 peserta**;
- jadwal atau pendaftaran sudah lewat, tidak tercantum, atau tidak pasti.

**Tim tujuan dapat dikonfigurasi per alasan.** Default:
- kelompok/lembaga/≥ 5 peserta → **Tim Kemitraan** (D-20);
- komplain di Hotline → **Tim Hotline**, dengan kategori keluhan (D-23);
- alasan lain → tim channel tersebut.

**Lead nyasar (D-22):** jika agent di channel selain Admisi mendeteksi calon pelanggan baru, lakukan eskalasi dan alihkan ke **Tim Admisi di percakapan yang sama**.

**Kebutuhan kelompok tanpa jumlah:** boleh menanyakan perkiraan jumlah peserta satu kali, lalu eskalasi. Jika pelanggan sudah menyebut jumlahnya, jangan ditanyakan ulang. Jika pelanggan meminta manusia atau menyampaikan komplain, eskalasi segera tanpa mengumpulkan data tambahan.

**Pesan pengantar eskalasi** dapat dikonfigurasi. Tidak boleh menjanjikan waktu respons sampai **D-15** diputuskan.

**Saat eskalasi terjadi:**
1. tandai percakapan butuh admin;
2. AI Off;
3. catat alasan, waktu, dan versi agent;
4. tampilkan status di inbox;
5. kirim notifikasi di dalam TE One ke tim tujuan.

Pesan pengantar hanya dikirim jika lolos pemeriksaan ulang dan admin belum lebih dulu mengambil alih.

## 11. Pemeriksaan sebelum setiap balasan AI dikirim

1. Chat masih **AI Aktif** dan versi statusnya masih sama.
2. Channel dan agent masih aktif.
3. Agent masih agent yang ditetapkan untuk channel itu.
4. **Kill switch** tidak aktif (chat, channel, fitur, global).
5. Pesan pelanggan layak diproses: bukan history, bukan duplikat, dan setelah batas aktivasi.
6. Admin belum mengambil alih.
7. Jendela layanan masih terbuka.
8. Penerima termasuk daftar uji (non-production).
9. Jawaban lolos validasi aplikasi: gaya, tautan dari Kartu Program, media yang diizinkan.
10. Batas biaya belum tercapai.

Jika salah satu gagal: jangan kirim, catat alasannya, dan tandai untuk admin bila perlu. Pekerjaan AI diproses **berurutan per percakapan**.

## 12. Kesalahan AI

Jika model tidak tersedia, kredensial tidak valid, terjadi timeout, knowledge gagal diakses, sumber tidak jelas, hasil melanggar aturan, atau batas biaya tercapai:
- jangan mengarang jawaban;
- jangan mengirim pesan berulang;
- catat kesalahan tanpa membocorkan rahasia;
- tandai percakapan untuk admin.

## 13. Provider AI

- Adapter provider dapat diganti lewat konfigurasi.
- Provider dan model mengikuti **D-09**; kredensial terpisah per lingkungan.
- Pemakaian dan biaya dicatat. Jika provider tidak memberikan data biaya, tulis *belum diketahui*.
- **Batas biaya harian/bulanan menghentikan pemanggilan** saat tercapai.
- Dokumentasikan data apa saja yang dikirim ke provider, dan kirim seminimal mungkin (konteks terbatas, tanpa nomor telepon).

## 14. Simulator

Fitur simulator:
- pilih agent dan versinya (aktif atau draft);
- ketik pesan pelanggan contoh;
- lihat jawaban, keputusan menjawab atau eskalasi beserta tim tujuan, sumber yang dipakai, versi, dan waktu;
- ulangi kasus;
- jalankan **set uji secara batch** (bagian 15).

Ditandai jelas sebagai **SIMULASI**. Simulator tidak mengirim WhatsApp dan tidak mengubah status chat, label, pipeline, atau follow-up.

## 15. Set uji AI (evaluasi terukur)

- Dataset 50–100 pertanyaan dari J0-09 (disamarkan), ditambah kasus eskalasi dan kasus injeksi. Simpan di repository tanpa data asli, lengkap dengan jawaban/keputusan yang diharapkan.
- Jalankan secara batch lewat simulator dan laporkan hasil per kategori.
- Ambang lulus mengikuti **D-21**. Default:
  - **0** harga, jadwal, atau tautan yang dikarang;
  - ≥ 95% eskalasi benar untuk kasus minta manusia dan komplain;
  - ≥ 90% jawaban benar untuk pertanyaan yang informasinya tersedia.
- Simpan hasil per versi agent agar dampak perubahan instruksi dapat dibandingkan (regresi kualitas).

## 16. Keamanan AI

- Pesan pelanggan dan isi dokumen adalah data tak tepercaya.
- Pelanggan tidak dapat mengubah aturan sistem, hak akses, atau sumber yang dibaca agent.
- Jangan mengirim rahasia ke model.
- Agent tidak boleh menjalankan aksi di luar fitur yang disetujui.
- Uji injeksi: meminta rahasia, membaca knowledge agent lain, mengabaikan eskalasi, mengirim tautan atau harga palsu.

## 17. Hak akses dan audit

**Izin:** lihat agent · ubah agent · terbitkan agent · tempatkan agent di channel · kelola Kartu Program · terbitkan Kartu Program · kelola knowledge · terbitkan knowledge · gunakan simulator · jalankan set uji · ubah AI On/Off · lihat audit AI · kill switch AI.

**Audit:** perubahan dan penerbitan versi, penempatan agent, Kartu Program dan knowledge, eskalasi, AI On/Off, kegagalan AI dan pengiriman, tercapainya batas biaya.

---

## 18. CCP Tahap 4

Wajib lulus: **GATE-CHECKLIST bagian C — Gate 4 (4.1–4.7)**.

## 19. Uji minimum

**Multi-agent**
- Dua agent dengan nama berbeda; ubah nama agent.
- Satu agent dipakai di dua channel; satu channel tidak memiliki dua agent aktif.
- Ganti agent tanpa menjawab ulang pesan lama; chat AI Off tetap Off.

**Kartu Program**
- Program aktif → tautan yang benar terkirim.
- Tanggal tutup lewat, jadwal lewat, tanggal kosong, URL kosong → tidak ada tautan, eskalasi.
- Zona waktu server berbeda dari Asia/Jakarta.
- Kartu Program yang diarsipkan tidak dipakai; versi tercatat.

**Knowledge**
- Shared yang diizinkan dipakai; knowledge khusus agent dipakai oleh agent pemiliknya.
- Agent tidak dapat membaca knowledge agent lain.
- Sumber nonaktif tidak dipakai; sumber gagal diproses tidak dinyatakan siap.
- Versi dan audit tercatat; sumber yang ditampilkan sama dengan yang benar-benar dipakai.

**Jawaban dan gaya**
- Aturan 2 kalimat / 15 kata / 1 pertanyaan; bertahap.
- Pengecualian brief program; pengiriman flyer.
- Pemberitahuan AI sesuai D-10.

**Eskalasi**
- Minimal satu kasus untuk setiap kondisi, dengan beberapa variasi bahasa.
- Tim tujuan benar.
- Lead nyasar dialihkan ke Tim Admisi.
- Kategori keluhan Hotline tercatat.

**AI dan admin**
- Semua kasus Tahap 3 diulang dengan AI (mock dan provider nyata).
- Hasil AI yang terlambat ditahan setelah admin mengambil alih.
- Pergantian agent tidak mengirim hasil agent lama.

**Kontrol**
- Kill switch AI per channel dan global.
- Batas biaya menghentikan pemanggilan.
- Simulator tidak mengirim WhatsApp.
- API key tidak muncul di log atau simulator.
- Non-production hanya mengirim ke peserta uji.

**Set uji:** hasil batch dibandingkan dengan ambang D-21.

**Uji nyata (setelah Gate 3):** peserta uji bertanya → AI menjawab dari Kartu Program → peserta minta manusia → eskalasi → admin membalas → AI tetap Off → AI diaktifkan kembali → AI menunggu → peserta mengirim pesan baru → AI menjawab.

**Regresi:** seluruh test `@tahap-1` sampai `@tahap-3` lulus. Golden E2E G4 dan G5 berjalan.

## 20. Kriteria selesai

Memenuhi **Gate 4**. Tahap 4 **belum lulus penuh** jika:
- agent hanya berupa tampilan tanpa jawaban yang dapat diuji;
- AI dapat membaca knowledge yang bukan haknya;
- eskalasi utama gagal;
- AI masih membalas setelah admin mengambil alih;
- AI menjawab ulang pesan lama;
- AI mengirim tautan saat jadwal tidak pasti;
- set uji di bawah ambang D-21;
- uji nyata yang disyaratkan belum dilakukan.

## 21. Dokumen yang diserahkan

- Arsitektur AI agent.
- Panduan agent; panduan Kartu Program; panduan knowledge.
- Simulator dan set uji.
- Aturan eskalasi dan routing.
- Alur AI On/Off.
- Validasi jadwal dan tautan.
- Provider dan data yang dikirim ke provider.
- Dataset uji yang disamarkan beserta hasilnya.
- Laporan `docs/reports/tahap-4.md`.
