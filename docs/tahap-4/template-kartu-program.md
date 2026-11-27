# Template Kartu Program (untuk AI agent Tahap 4)

**Aturan (AGENTS.md §8):** AI hanya boleh menyebut **harga, jadwal, tanggal tutup pendaftaran, persyaratan, dan tautan** yang berasal dari **Kartu Program aktif**. Validasi tanggal dilakukan **kode**: program yang lewat tanggal tutup / tidak aktif / tanpa tautan → AI **tidak** mengirim tautan dan mengeskalasi. Isi satu kartu per program/batch. Spreadsheet: `template-kartu-program.csv`.

| Kolom | Wajib | Contoh isian | Catatan |
|---|---|---|---|
| kode_program | ✅ | TOT-BNSP-JAN27 | Unik, dipakai di log |
| nama_program | ✅ | Training of Trainers (BNSP) | Nama resmi |
| channel | ✅ | Admisi | Channel yang boleh menjawab |
| status | ✅ | aktif / tutup / draf | Hanya `aktif` dipakai AI |
| harga_normal | ✅ | Rp3.500.000 | Angka persis, tanpa "mulai dari" bila tidak resmi |
| harga_promo | — | Rp2.950.000 | Kosongkan bila tidak ada |
| promo_berlaku_sampai | bila promo | 2027-01-10 | Format YYYY-MM-DD |
| metode_pembayaran | ✅ | Transfer BCA; cicilan 2x | Persis seperti kebijakan |
| jadwal_mulai | ✅ | 2027-01-20 | |
| jadwal_selesai | ✅ | 2027-01-23 | |
| jam_dan_zona | ✅ | 08.00–16.00 WIB | |
| mode | ✅ | luring / daring / campuran | |
| lokasi | bila luring | Sleman, DIY | |
| tutup_pendaftaran | ✅ | 2027-01-15 | Dipakai kode untuk menolak tautan |
| kuota | — | 25 | |
| persyaratan | ✅ | Min. S1/D3; pengalaman mengajar | Satu baris per syarat (pisah `;`) |
| sertifikat | ✅ | Sertifikat Kompetensi BNSP (bila lulus uji) | Jangan menjanjikan kelulusan |
| tautan_pendaftaran | ✅ | https://… | Wajib https; kosong → AI tidak kirim tautan |
| jawaban_faq | — | "Apakah ada cicilan?" → "Ya, 2x…" | Hanya jawaban yang disetujui |
| tidak_boleh_dijanjikan | ✅ | Diskon di luar promo; jaminan lulus; jadwal ulang | AI menolak & eskalasi |
| pemicu_eskalasi | ✅ | Kelompok ≥5 orang; instansi; komplain; minta manusia | D-20 |
| pic_program | ✅ | Nama/role penanggung jawab | Untuk eskalasi |
| versi | ✅ | 3 | Naik setiap perubahan |
| diverifikasi_oleh | ✅ | Nama/role | Pemeriksa isi |
| diverifikasi_tanggal | ✅ | 2026-12-01 | Kartu > 30 hari tanpa verifikasi → peringatan |

**Penanda data contoh:** baris contoh di CSV ditandai `CONTOH` dan fiktif (AGENTS.md §4) — hapus sebelum dipakai.
**Prioritas pengisian:** mulai dari 3–5 program dengan iklan aktif terbesar untuk Admisi, lalu Kemitraan.
