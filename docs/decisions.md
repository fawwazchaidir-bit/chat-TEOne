# Catatan Keputusan Proyek TE One

Status: **Terbuka** · **Diputuskan** · **Diubah**.

Selama suatu keputusan masih **Terbuka**, developer memakai kolom *Usulan default* sebagai **ASUMSI** dan menandainya di kode, dokumen, dan laporan. Asumsi tidak boleh dilaporkan sebagai keputusan final.

Cara mengisi: ubah *Status*, tulis keputusan akhir di kolom *Keputusan akhir*, lalu isi siapa yang memutuskan dan tanggalnya. Jangan menghapus baris; jika keputusan berubah, tulis status **Diubah** beserta alasannya.

---

## Ringkasan

| ID | Keputusan | Usulan default | Dibutuhkan sebelum | Status | Keputusan akhir | Oleh / tanggal |
|---|---|---|---|---|---|---|
| D-01 | Kebutuhan grup WhatsApp lama | Opsi A (lihat rincian) | Tahap 3 dimulai (±22 Des 2026) | Terbuka | | |
| D-02 | Jalur akses Meta untuk coexistence | Ajukan Tech Provider sendiri; jika belum disetujui per 15 Des 2026, pakai BSP resmi untuk uji | Tahap 2 (±1 Des 2026) | Terbuka | | |
| D-03 | Nomor uji coexistence | Kemitraan, **tidak dipublikasikan** sampai GO; pesan dari pengirim di luar daftar uji tidak diproses otomatisasi dan dilaporkan | Tahap 2 (±1 Des 2026) | **Diputuskan** | Nomor uji = …6319 (channel Kemitraan Uji), satu-satunya nomor siap; pemilik menyatakan tidak ada chat masuk ke nomor ini. M-12 (history) hanya bila tidak ada chat pelanggan 180 hari terakhir — lihat `gates/keputusan-pemilik-fase-0-2026-11-26.md` §2 | Pemilik proyek / 26 Nov 2026 |
| D-04 | Cakupan go-live dan jadwal | Lihat rincian | Gate 1 (±2 Des 2026) | Terbuka | | |
| D-05 | Pesan keluar dari HP (WhatsApp Business App) mematikan AI | **Ya**, AI Off pada chat terkait | Tahap 3 | Terbuka | | |
| D-06 | Waktu kirim FU-2 | Target T+23 jam; jika di luar jam kirim, kirim pada slot jam kirim terakhir sebelum (T+24 jam − 30 menit) | Tahap 6 | Terbuka | | |
| D-07 | FU-1 yang tertunda dan jarak FU-1 → FU-2 | Jarak minimum 3 jam; jika lebih dekat, FU-1 dilewati | Tahap 6 | Terbuka | | |
| D-08 | Skenario follow-up hingga 72 jam | Tidak aktif saat go-live | Tahap 6 | Terbuka | | |
| D-09 | Provider & model AI, batas biaya, data yang dikirim | **Wajib diisi pemilik** (tidak ada default) | Tahap 4 memakai provider berbayar | Terbuka | | |
| D-10 | Pemberitahuan bahwa pelanggan dilayani AI | Sapaan pertama menyebut "asisten virtual Trilogika" | Tahap 4 | Terbuka | | |
| D-11 | Pipeline, status, dan kolom tambahan | Lihat rincian | Tahap 5 | Terbuka | | |
| D-12 | Target RPO / RTO | Usulan awal: RPO ≤ 1 jam, RTO ≤ 4 jam kerja (perlu dinilai biayanya) | Tahap 7 (desain sejak Tahap 1) | Terbuka | | |
| D-13 | Target performa | p95 buka inbox/chat < 1 detik pada 10 pengguna bersamaan | Tahap 7 | Terbuka | | |
| D-14 | Urutan & jadwal perpindahan nomor | Kemitraan → Admisi → Hotline; tidak ada perpindahan 4–15 Mar 2027; observasi ≥ 5 hari kerja antar nomor | Tahap 8 | Terbuka | | |
| D-15 | Janji waktu respons eskalasi & jam kerja tim | Pesan eskalasi **tanpa** janji waktu sampai disetujui | Tahap 4 | Terbuka | | |
| D-16 | Status belum dibaca | Per pengguna | Tahap 3 | Terbuka | | |
| D-17 | Label otomatis saat AI Off | Mati | Tahap 5 | Terbuka | | |
| D-18 | Retensi data & UU PDP | Lihat rincian — **perlu tinjauan pemilik / penasihat hukum** | Tahap 7 (struktur sejak Tahap 1) | Terbuka | | |
| D-19 | Server production & lokasi data | VPS tersendiri; lokasi dicatat | Tahap 8 | Terbuka | | |
| D-20 | Routing eskalasi kelompok / lembaga / ≥ 5 peserta | Ke Tim Kemitraan | Tahap 4 | Terbuka | | |
| D-21 | Ambang lulus set uji AI | 0 harga/jadwal/tautan dikarang; ≥ 95% eskalasi benar (minta manusia & komplain); ≥ 90% jawaban benar untuk pertanyaan yang tersedia | Tahap 4 | Terbuka | | |
| D-22 | Penanganan lead nyasar | Calon pelanggan baru di Hotline/Kemitraan dialihkan ke Tim Admisi **di percakapan yang sama** (pelanggan tidak diminta pindah nomor) | Tahap 3 | Terbuka | | |
| D-23 | Kategori keluhan Hotline | Teknis kelas · Materi · Sertifikat · Pembayaran · Trainer · Lainnya | Tahap 4 | Terbuka | | |
| D-24 | Fitur harian Halo AI yang boleh hilang saat go-live | Tidak ada, sampai inventaris J0-05 selesai | Tahap 7 | Terbuka | | |

---

## Rincian

### D-01 — Grup WhatsApp lama

Kebutuhan awal: membaca dan membalas grup WhatsApp yang sudah ada dari dashboard TE One. Pada coexistence, chat grup WhatsApp Business App **tidak** tersinkron ke Cloud API. Groups API resmi Meta saat ini sangat terbatas (jumlah peserta kecil, syarat Official Business Account, tidak untuk nomor WhatsApp Business App).

| Opsi | Cara kerja | Konsekuensi |
|---|---|---|
| **A (usulan)** | Grup dikelola di WhatsApp Business App sebagai grup pengumuman (hanya admin mengirim di luar sesi tanya jawab). Link, materi, dan pengingat dikirim lewat template utility dari Hotline. Pertanyaan pribadi dan keluhan diarahkan ke chat 1:1, yang masuk TE One. | Resmi dan aman. Grup tidak terlihat di TE One. Kebutuhan awal diubah secara eksplisit. |
| **B** | Gateway grup tidak resmi yang terisolasi, memakai **nomor terpisah** (bukan Admisi/Hotline/Kemitraan), sebagai modul yang dapat dimatikan. | Grup terbaca di TE One. Nomor gateway berisiko diblokir permanen. Mengubah larangan AGENTS §3.3 untuk modul itu saja. |
| **C** | Diskusi kelas dipindah ke LMS/forum; WhatsApp hanya untuk notifikasi. | Paling mudah diskalakan. Peserta harus mengubah kebiasaan. |

### D-04 — Cakupan go-live dan jadwal

**Wajib saat go-live**
- Inbox multi-channel, tim, routing, balasan cepat, catatan internal
- Izin per channel, audit, kill switch
- AI agent dengan Kartu Program, knowledge, eskalasi, simulator, set uji
- Label manual + label otomatis kata kunci
- Pipeline (Admisi, Kemitraan, Komplain Hotline) + laporan dasar
- Template manual dari inbox
- Follow-up FU-1/FU-2 dengan **teks tetap**

**Setelah go-live (di balik feature flag, mati)**
- Label berbasis AI
- Follow-up yang disusun AI
- Skenario hingga 72 jam
- Asisten internal
- Laporan lanjutan

**Jadwal target**

| Pekerjaan | Target |
|---|---|
| Jalur 0 + Tahap 1 | 18 Nov – 1 Des 2026 |
| Tahap 2 | 2 – 22 Des 2026 |
| Tahap 3 ∥ Tahap 4 (bagian simulator) | 23 Des 2026 – 12 Jan 2027 |
| Tahap 4 (uji nyata) + Tahap 5 + Tahap 6 | 13 Jan – 2 Feb 2027 |
| Tahap 7 (audit & UAT) | 3 – 23 Feb 2027 |
| Tahap 8 (pilot) + keputusan GO | 24 Feb – 3 Mar 2027 |
| **Freeze** (tidak ada perpindahan nomor / rilis baru) | 4 – 15 Mar 2027 |
| Tahap 9, nomor pertama | mulai 16 Mar 2027 |

### D-11 — Pipeline

Tiga pipeline default. Setiap status memiliki kategori **Terbuka / Menang / Gagal**.

| Pipeline | Status default |
|---|---|
| Admisi | Lead Baru → Tertarik → Penawaran Dikirim → Menunggu Bayar → **Closing (Menang)** / **Gagal** |
| Kemitraan | Lead → Kebutuhan Digali → Proposal → Negosiasi → **Deal (Menang)** / **Gagal** |
| Komplain Hotline | Baru → Diproses → Menunggu Peserta → **Selesai (Menang)** / **Ditutup tanpa penyelesaian (Gagal)** |

Kolom: 7 kolom yang telah disepakati (Judul, Status, Chat terkait, Deskripsi, Prioritas, Tenggat, PIC), ditambah **Nilai (Rp)**, **Alasan gagal** (wajib saat status Gagal), **Sumber lead** (otomatis, hanya baca), dan **Kategori keluhan** (khusus pipeline Komplain).

### D-18 — Retensi data & UU PDP (usulan awal untuk dibahas)

- Payload webhook mentah: ≤ 30 hari.
- Isi chat & media: sesuai kebutuhan operasional (usulan 2 tahun), lalu diarsipkan atau dihapus.
- Log teknis: ≤ 90 hari, tanpa isi chat.
- Permintaan hapus/akses data dari pelanggan: ditangani ≤ 14 hari kerja oleh pengguna berwenang, teraudit.
- Data yang dikirim ke provider AI: hanya konteks percakapan yang diperlukan, tanpa nomor telepon.
- Lokasi penyimpanan dan pihak ketiga (Meta, provider AI) dicatat.

Angka-angka di atas **usulan**, bukan nasihat hukum.
