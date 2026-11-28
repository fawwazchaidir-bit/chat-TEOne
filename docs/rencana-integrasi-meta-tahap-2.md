# Rencana integrasi Meta — Tahap 2 (hal yang HARUS DIBUKTIKAN sebelum membangun)

> **Pembaruan Tahap 2 (19 Nov 2026):** kode konektor selesai dan terbukti **simulasi**. **Seluruh butir di bawah tetap "Belum terbukti"** — tidak ada akses Meta/nomor uji/staging. Hasil dan arah verifikasi: [`tahap-2/`](tahap-2/README.md), terutama [`tahap-2/coexistence.md`](tahap-2/coexistence.md).

> Dokumen ini **bukan** klaim tentang perilaku Meta. Pembangun Tahap 1 tidak memiliki akses ke akun Meta TE One dan tidak memverifikasi
> dokumentasi Meta. Semua butir bertanda **Belum terbukti** dan harus diisi dengan bukti (tautan dokumentasi resmi + tanggal akses,
> tangkapan layar disamarkan, atau hasil uji nomor uji) pada Tahap 2. AGENTS.md §7 mewajibkan verifikasi terhadap dokumentasi Meta **terbaru**.
> **Rencana migrasi di bawah belum dijalankan.** Nomor Admisi (…196319; dulu ditulis "…1119") & Hotline (…246319; dulu ditulis "…0124") dan koneksi Halo AI **tidak boleh disentuh** sebelum Tahap 9.

## Ringkasan butir
| # | Hal | Yang harus dibuktikan | Cara membuktikan | PIC / tenggat | Status |
|---|---|---|---|---|---|
| 1 | Kepemilikan & akses **Meta Business, WABA, aplikasi Meta milik TE One** | TE One memakai aplikasi Meta **sendiri** (bukan aplikasi Halo AI); siapa admin; akses cadangan | Bukti akses (disamarkan), daftar admin | _isi_ | Belum terbukti |
| 2 | **D-02** jalur akses (Tech Provider sendiri vs BSP resmi) | Apakah coexistence/Embedded Signup mensyaratkan status Tech Provider/Solution Partner untuk TE One; status pengajuan; kapan disetujui (usulan batas 15 Des 2026) | Dokumentasi Meta + status pengajuan | _isi_ | Belum terbukti |
| 3 | **D-03** nomor uji coexistence | Nomor Kemitraan memenuhi syarat coexistence; tidak dipublikasikan sampai GO; pengirim di luar daftar uji tidak diproses otomatisasi dan dilaporkan | Uji pada nomor | _isi_ | Belum terbukti |
| 4 | Mekanisme webhook & validasi | Verifikasi langganan; **validasi tanda tangan pada raw body** (kandidat: HMAC-SHA256 dengan app secret pada header tanda tangan Meta — konfirmasi di dokumentasi); respons setelah commit (ADR-0002) | Test CCP 2.1–2.3 | _isi_ | Belum terbukti |
| 5 | **Echo** dari WhatsApp Business App | Format event echo; dicatat sebagai pesan keluar sumber "WhatsApp Business App"; tidak membuka/memperpanjang jendela layanan; admin pengirim tidak ditebak | Uji nyata nomor uji (CCP 2.8, 3.7); D-05 (AI Off bila pesan dari HP) | _isi_ | Belum terbukti |
| 6 | **Batas sinkronisasi riwayat** | Batas waktu & jumlah permintaan sinkronisasi; rentang riwayat teks/media; event history ditandai `is_history` dan tidak memicu otomatisasi (CCP 2.9) | Dokumentasi + uji | _isi_ | Belum terbukti |
| 7 | **Dampak pada perangkat tertaut** | Apa yang terjadi pada perangkat/WhatsApp Business App saat onboarding; pemutusan perangkat tertaut; PIN verifikasi dua langkah | Dokumentasi + uji nomor uji | _isi_ | Belum terbukti |
| 8 | **Keterbatasan grup (D-01)** | Konteks proyek: chat grup WhatsApp Business App **tidak** tersinkron ke Cloud API pada coexistence; Groups API resmi sangat terbatas (lihat `decisions.md` D-01). **Butuh keputusan D-01 (Tahap 3 dimulai ±22 Des 2026)**: usulan Opsi A (grup tetap di app sebagai pengumuman; link/materi lewat template utility dari Hotline) | Keputusan pemilik + verifikasi dokumentasi | Pemilik | Terbuka |
| 9 | **Memutus provider lama saat perpindahan** | Apakah nomor harus diputus dari provider sebelumnya (Halo AI/WAHA?) agar dapat dipakai TE One; konsekuensi pada layanan berjalan; teknologi nomor Hotline (J0-04: diduga WAHA, **belum terverifikasi**) | Dokumentasi + J0-04 | _isi_ | Belum terbukti |
| 10 | Batas throughput & rate limit | Batas kirim/terima; penanganan rate limit & error eksplisit (AGENTS.md §7) | Dokumentasi + uji | _isi_ | Belum terbukti |
| 11 | Jendela layanan 24 jam & template | Jendela dibuktikan dari waktu server/provider; template disetujui & sesuai WABA channel | Test CCP 2.7, 6.5 | _isi_ | Belum terbukti |

## Prasyarat teknis (dari Tahap 1)
Siap: model identitas (ADR-0003), antrean tahan restart (ADR-0002), feature flag `whatsapp_connector` (mati), kill switch, daftar penerima uji **harus ditambahkan** (CCP 2.5), role DB/hak minimum.
Belum ada: server staging dengan HTTPS publik (webhook Meta butuh URL publik), aplikasi Meta TE One, nomor uji.

## Rencana migrasi nomor (belum dijalankan; urutan D-14)
Kemitraan → Admisi → Hotline; tidak ada perpindahan 4–15 Mar 2027 (freeze); observasi ≥ 5 hari kerja antar nomor; runbook per nomor (Tahap 8). Tahap 1 **tidak** menjalankan satu langkah pun dari rencana ini.
