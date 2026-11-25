# Catatan coexistence dan implikasinya per nomor (Tahap 2)

> **PEMBARUAN 26 Nov 2026:** sebagian butir kini **diverifikasi ke halaman resmi Meta** (nama field `history`/`smb_app_state_sync`/`smb_message_echoes`, jendela sinkronisasi 24 jam dan sekali saja, cakupan echo = semua pesan dari Business App **dan perangkat tertaut**, bentuk payload echo, retry webhook hingga 7 hari, history dipicu Step 2 ke SMB App Data API) — lihat [`verifikasi-dokumentasi-meta-2026-11-26.md`](verifikasi-dokumentasi-meta-2026-11-26.md). Klaim di bawah bahwa host tidak terjangkau hanya benar untuk alat fetch subagen; `curl` lewat proxy sesi berhasil. **Belum terverifikasi:** V-5 (efek subscribe/cabut field terhadap registrasi), V-6 (`is_on_biz_app`/`platform_type`), V-9, dan **semua pembuktian pada nomor** (hasil uji M-11).
>
> ## STATUS (teks asli, 19 Nov): **BELUM TERVERIFIKASI — bukan "catatan terverifikasi"**
> Spesifikasi Tahap 2 (§4, §15) meminta catatan coexistence **terverifikasi** dari dokumentasi Meta terbaru **dan dibuktikan pada nomor uji**. Pada pembangunan ini:
> 1. host dokumentasi resmi Meta (`developers.facebook.com`) **tidak dapat dijangkau** dari lingkungan pembangun (DNS/jaringan diblokir; percobaan melalui subagen gagal), dan
> 2. **tidak ada** aplikasi Meta milik TE One, token, ataupun nomor uji — jadi **tidak ada** pembuktian pada nomor.
>
> Isi di bawah hanya **ringkasan hasil pencarian web (sumber SEKUNDER: dokumentasi vendor/BSP dan blog)** untuk memberi arah verifikasi. Setiap butir **wajib diverifikasi** terhadap dokumentasi Meta
> terbaru dan dibuktikan pada nomor uji sebelum dijadikan dasar keputusan (AGENTS.md §7). **Jangan** dipakai untuk memutuskan migrasi Admisi/Hotline. Dokumen ini adalah bahan awal Tahap 8, **bukan** bahan jadi.
> Tanggal pencarian: 19 Nov 2026 (sesi pembangunan Tahap 2).

## 1. Butir wajib (spesifikasi §4) — yang diketahui dari sumber sekunder dan yang HARUS dibuktikan
| # | Butir | Temuan sumber sekunder (BELUM terverifikasi) | Status | Cara membuktikan |
|---|---|---|---|---|
| 1 | Syarat Embedded Signup & status partner | Coexistence di-onboard lewat Embedded Signup; **satu sumber** menyebut hanya berfungsi bila sudah menjadi Solution Partner/Tech Provider dengan Embedded Signup + webhook yang berjalan, dan bukan sakelar mandiri ([Telnyx](https://developers.telnyx.com/docs/messaging/whatsapp/coexistence), [campaignhq](https://blog.campaignhq.co/whatsapp-coexistence-pros-cons-20-mps-scaling/), ringkasan pencarian) | **Belum terbukti** — terkait **D-02** (Tech Provider sendiri vs BSP) | Dokumentasi Meta + status pengajuan TE One |
| 2 | Versi WhatsApp Business App | **Satu sumber** menyebut versi minimal **2.24.17** (angka belum dapat dipastikan) | **Belum terbukti** | Dokumentasi Meta; cek versi di HP nomor uji |
| 3 | Pemutusan perangkat tertaut | **Tidak ditemukan** sumber yang jelas | **Tidak diketahui** | Dokumentasi Meta + amati perangkat tertaut sebelum/sesudah onboarding nomor uji |
| 4 | PIN verifikasi dua langkah | **Tidak ditemukan** sumber yang jelas | **Tidak diketahui** | Dokumentasi Meta + amati saat onboarding |
| 5 | Batas waktu & jumlah permintaan sinkronisasi riwayat | Sinkronisasi dilaporkan punya tenggat **24 jam** sejak onboarding/penyambungan ulang; `smb_app_state_sync` (kontak) dilaporkan hanya sekali kecuali offboard lalu onboard ulang ([Gupshup](https://docs.gupshup.io/docs/coexistence-events-webhooks), [Infobip](https://www.infobip.com/docs/whatsapp/manage-integration/coexistence)) | **Belum terbukti** | Dokumentasi Meta + uji pada nomor uji |
| 6 | Rentang riwayat teks & media | Riwayat dikirim bertahap (fase) lewat webhook `history`, **hingga 180 hari**, **bila pemilik bisnis menyetujui**; pemilik dapat menolak → muncul galat bahwa sinkron riwayat dimatikan ([360dialog](https://docs.360dialog.com/docs/waba-basics/phone-numbers/coexistence/coexistence-webhooks)). Rentang **media** tidak ditemukan | **Belum terbukti** | Dokumentasi Meta + uji (setujui dan tolak) |
| 7 | Batas throughput | Mayoritas sumber: **20 pesan/detik** untuk nomor coexistence; **satu sumber** menyebut 5; tidak jelas apakah pesan dari WhatsApp Business App ikut dihitung ([Telnyx](https://developers.telnyx.com/docs/messaging/whatsapp/coexistence), [WATI](https://www.wati.io/en/blog/coexistence-for-smbs/), [YCloud](https://helpdocs.ycloud.com/help-center/whatsapp-accounts-management/create-a-whatsapp-api-account/whatsapp-business-app-coexistence)) | **Belum terbukti** — angka **tidak** dipakai sebagai konstanta; limiter default 5/detik per koneksi (pengaturan per koneksi, **bukan** dasar keputusan) | Dokumentasi throughput Meta + uji beban kecil |
| 8 | Memutus provider sebelumnya | **Tidak ditemukan** sumber yang jelas | **Tidak diketahui** | Dokumentasi Meta + uji; **jangan** diuji pada Admisi/Hotline |

Catatan sumber lain: [Infobip](https://www.infobip.com/docs/whatsapp/manage-integration/coexistence) menyebut onboarding belum didukung untuk nomor terdaftar di Nigeria dan Afrika Selatan (Indonesia **tidak disebut**; belum diverifikasi apakah didukung — wajib dicek untuk nomor Kemitraan).
Halaman resmi yang harus dibaca pemegang akses: *Onboarding WhatsApp Business app users* (Embedded Signup) dan *Message History Events API* di `developers.facebook.com/documentation/business-messaging/whatsapp/` — **tidak berhasil dibaca** pada pembangunan.

## 2. Event coexistence yang diasumsikan (BELUM TERVERIFIKASI)
| Event | Dugaan arti (sumber sekunder) | Penanganan di TE One |
|---|---|---|
| `smb_message_echoes` | pesan yang dikirim dari WhatsApp Business App setelah onboarding; dikirim ke webhook nomor; klien companion yang tidak didukung tidak memicunya | Dicatat sebagai pesan **keluar**, sumber *WhatsApp Business App*; **dideduplikasi**; **tidak** membuka/memperpanjang jendela layanan; **tidak** memicu pengiriman; admin pengirim **tidak ditebak** |
| `history` | sinkronisasi riwayat dalam fase/chunk; dapat ditolak pemilik bisnis | Ditandai sumber *History* + `is_history`; **tidak** memicu hook/unread/label/follow-up; dedup terhadap event langsung; chunk tak berurutan dan progres/penolakan ditangani tanpa menggagalkan percakapan |
| `smb_app_state_sync` | sinkronisasi kontak | Dicatat sebagai `contact_sync` (hitungan); tidak membuat percakapan |

Nama field dan bentuk payload di atas ada di `src/modules/whatsapp-adapter/normalize.ts` dan **ditandai BELUM TERVERIFIKASI**; normalizer tidak pernah melempar, mengabaikan field asing, dan mengarantina yang tak dikenali.
Dampak echo terhadap status AI (D-05) diatur di **Tahap 3**, bukan di sini.

## 3. Dua jenis uji (spesifikasi §4)
| Jenis | Arti | Status |
|---|---|---|
| **Uji Cloud API** | API dapat menerima dan mengirim pesan | **Belum dilakukan** (tidak ada akses Meta); simulasi mock lulus |
| **Uji coexistence** | nomor yang sama aktif di WhatsApp Business App **dan** Cloud API | **Belum dilakukan** → Tahap 2 **belum lulus penuh** (spesifikasi §14) |

## 4. Implikasi per nomor — HIPOTESIS yang harus dibuktikan (bukan kesimpulan)
| Nomor | Kondisi yang diketahui (AGENTS.md §1) | Implikasi yang perlu dibuktikan | Aturan sekarang |
|---|---|---|---|
| **Kemitraan** (nomor 3) | Sudah terhubung ke Meta Business; kandidat nomor uji (D-03) | Layak/tidaknya coexistence (versi app, negara, status Meta Business, jalur D-02); perilaku echo & riwayat; pengirim di luar daftar uji dikarantina (D-03) | **Satu-satunya** kandidat uji; **belum** diuji |
| **Admisi** (…1119) | Coexistence di layanan lama (Halo AI) | Apakah nomor yang sudah coexistence di layanan lama dapat ditautkan ke aplikasi Meta TE One tanpa memutus yang lama; kemungkinan harus memutus provider sebelumnya; riwayat tersimpan di Halo AI **tidak ikut** pindah dan tidak boleh dijanjikan; risiko gangguan lead iklan → butuh runbook, observasi, dan rollback (Tahap 8) | **Tidak boleh disentuh** sebelum Tahap 9 dan GO tertulis |
| **Hotline** (…0124) | Centang biru; di Halo AI berlabel "WhatsApp On-premise" + menu "WAHA to WABA Migration"; **diduga WAHA, belum terverifikasi** (J0-04) | Bila benar WAHA: konektor tidak resmi (dilarang TE One, AGENTS.md §3.3) → perlu onboarding ulang ke jalur resmi, kemungkinan memutus WAHA, kemungkinan perubahan status verifikasi/centang biru yang **harus dipastikan**; grup (D-01) tidak ikut | **Tidak boleh disentuh** sebelum Tahap 9; teknologi nomor harus diverifikasi dulu (J0-04) |

## 5. Keterbatasan grup (D-01)
- Konteks proyek (`decisions.md` D-01): pada coexistence, chat grup WhatsApp Business App **tidak** tersinkron ke Cloud API; Groups API resmi sangat terbatas. **Dikutip dari dokumen proyek, belum diverifikasi ulang oleh pembangun ke dokumentasi Meta.**
- Konektor Tahap 2 **tidak** memiliki modul grup, **tidak** mengirim ke grup, dan **tidak diuji** dengan payload grup (bentuk payload grup tidak diketahui; jika ada, akan melewati jalur normal atau berakhir sebagai karantina `bentuk_tidak_dikenal`).
- **D-01 masih Terbuka** (diputuskan paling lambat saat Tahap 3 dimulai ±22 Des 2026). Usulan default Opsi A dipakai sebagai **ASUMSI (D-01)**: grup tetap di WhatsApp Business App, tidak terlihat di TE One; materi/link lewat template (Tahap 6). Opsi B (gateway tidak resmi) **tidak dibangun** dan membutuhkan keputusan eksplisit + isolasi.

## 6. Skenario uji coexistence (dijalankan di nomor uji setelah akses tersedia)
1. Catat sebelum onboarding: versi WhatsApp Business App, perangkat tertaut, status verifikasi dua langkah (tangkapan layar **disamarkan**).
2. Onboarding nomor uji lewat jalur D-02; catat langkah, PIN, pemutusan perangkat, dan waktu.
3. Setujui berbagi riwayat → amati `history` (fase, chunk, progres, media tidak tersedia); ulangi dengan menolak.
4. Kirim pesan dari HP → amati `smb_message_echoes`; pastikan tercatat sebagai keluar/*WhatsApp Business App*, tidak menggandakan, dan jendela layanan **tidak** terbuka karenanya.
5. Pesan pelanggan masuk → jendela terbuka; balas via alat uji dalam/di luar jendela.
6. Catat batas throughput yang teramati dan pesan galat Meta nyata → perbarui `errors.ts`.
7. Isi tabel §1 dengan tautan dokumentasi resmi + tanggal akses, lalu ubah status judul dokumen ini.
