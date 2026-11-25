# Pernyataan pemilik — hasil uji staging TE One, 25 November 2026

> **Sifat dokumen.** Mencatat **apa adanya** pernyataan tertulis pemilik yang juga operator staging, disampaikan melalui sesi pengembangan pada 25 Nov 2026. **Bukan** keputusan gate, **bukan** persetujuan langkah apa pun (A-1, A-1b, A-2, A-2b, A-3 di [`prosedur-uji-m11-m12.md`](prosedur-uji-m11-m12.md) §10 **tetap kosong**), dan **tidak** membuat tag. Tanpa tanda tangan formal; identitas pernyataan = pemilik proyek pada sesi ini.
> **Pembangun tidak mengamati satu pun kejadian di bawah** (tidak ada akses ke staging, akun Meta, atau ponsel). Dokumen ini tidak mengubah laporan audit asli (`docs/gates/gate-1*.md`, `gate-2.md`).

## 1. Teks pernyataan (verbatim)

> **Pernyataan Pemilik: Hasil Uji Staging TE One**
> Tanggal pengujian: 25 November 2026
> Lingkungan: Staging TE One
> Channel uji: Kemitraan Uji
> Nomor WhatsApp Business uji: berakhiran 6319
> Nomor penguji yang diizinkan: berakhiran 4062
> Commit checkout staging saat diperiksa: `9c297d36149bdac2133d0c6da1f53fef41629245`
> Saya selaku pemilik dan operator staging TE One menyatakan bahwa saya telah melakukan dan mengamati pengujian berikut:
>
> 1. Pemetaan koneksi: nomor uji dan WABA berhasil diverifikasi melalui Graph API Meta. Aplikasi TE One juga terkonfirmasi berlangganan webhook pada WABA uji.
> 2. Pesan masuk: pesan teks dari nomor penguji berakhiran 4062 berhasil diterima dan tersimpan di TE One pada channel Kemitraan Uji.
> 3. Pembatasan pengirim: saat pengujian menggunakan nomor yang tidak ada dalam daftar uji, event dikarantina dengan alasan `pengirim_di_luar_daftar_uji`.
> 4. Pesan keluar: pesan teks yang dikirim dari TE One berhasil diterima pada WhatsApp nomor penguji berakhiran 4062.
> 5. Status pesan: setelah pengiriman dari TE One, status pesan berubah menjadi Diterima melalui pembaruan webhook.
> 6. Kendala izin: pada percobaan sebelumnya, Meta mengembalikan error 10. Setelah izin pada akun pengiriman pesan diperbarui, pengiriman melalui Graph API Explorer dan TE One berhasil.
> 7. Kendala App Secret: webhook sempat tidak menerima event nyata karena App Secret pada staging tidak sama dengan App Secret aplikasi Meta. Setelah App Secret staging diperbaiki dan aplikasi dibuat ulang, pesan masuk baru tersimpan kembali di TE One.
> 8. Kondisi feature flag: pada pemeriksaan database staging, `inbox` dan `ai_simulation` berstatus mati, sedangkan `whatsapp_connector` berstatus aktif.
> 9. Kondisi nomor uji: nomor berakhiran 6319 masih aktif dan dapat digunakan melalui WhatsApp Business App di ponsel. Nomor yang sama juga telah digunakan untuk pengujian Cloud API. Versi WhatsApp Business App adalah 2.26.45.80 dan negara nomor adalah Indonesia.
> 10. Pilihan history saat onboarding: saya mengonfirmasi bahwa pilihan sinkronisasi riwayat diaktifkan saat onboarding. Saya belum menyatakan bahwa history telah diterima atau diproses oleh TE One.
> 11. Field webhook: pada pemeriksaan terakhir, field `messages` aktif. Field `smb_message_echoes` dan `history` terlihat tidak aktif.

## 2. Label status yang dipakai

| Label | Arti | Naik menjadi "Terbukti nyata" bila |
|---|---|---|
| **TERBUKTI NYATA** (AGENTS.md §4) | Diuji dengan Meta sungguhan **dan** buktinya tersedia | — |
| **DINYATAKAN PEMILIK — artefak belum terlampir** | Kesaksian tertulis **langsung** dari pelaku uji (bukan laporan sampingan). Lebih kuat daripada "dilaporkan operator", **tetapi** tidak dapat diperiksa pihak lain | Artefak disamarkan terlampir di `docs/reports/bukti/` (daftar: [`bukti-uji-staging-2026-11-25.md`](bukti-uji-staging-2026-11-25.md) §5) dan ditinjau auditor independen, **atau** pemilik menetapkan sendiri bahwa pernyataan ini cukup sebagai bukti Gate 2 (keputusan pemilik, bukan pembangun) |
| **BELUM DIUJI** | Tidak dinyatakan diuji | — |

Alasan tidak menaikkan otomatis: (1) pemilik adalah **satu-satunya saksi** dan sekaligus operator serta pengambil keputusan gate — auditor independen perlu artefak untuk menilai; (2) hasil diikat ke **checkout** `9c297d3`, bukan ke **image** yang berjalan (`417b30f8…`, tanpa label revisi; lihat [`prosedur-uji-m11-m12.md`](prosedur-uji-m11-m12.md) §2.1-3); (3) definisi §4 mensyaratkan bukti tersedia.

## 3. Pemetaan ke catatan sebelumnya dan status

| Pernyataan | Butir catatan sebelumnya | Status sekarang | Yang baru / yang tetap tidak dibuktikan |
|---|---|---|---|
| 1 | 1, 2 | **Dinyatakan pemilik** | Verifikasi = pemetaan nomor↔WABA + langganan webhook. Bukan "siap menerima pesan" (G2-A05). Mode `nyata` di panel koneksi belum diperlihatkan |
| 2 | 3 | **Dinyatakan pemilik** | **Baru:** jenis pesan dinyatakan **teks** (sebelumnya "diasumsikan"). Gambar/PDF tidak diuji |
| 3 | 4 | **Dinyatakan pemilik** | **Baru:** alasan karantina `pengirim_di_luar_daftar_uji` **cocok** dengan kode (`quarantineUnlisted`, **[KODE]**, terbukti simulasi). **Belum dicatat:** 4 digit akhir nomor yang dipakai dan apakah itu nomor tim atau pelanggan nyata |
| 4 | 5 | **Dinyatakan pemilik** | Satu jalur teks sukses; gagal/belum-pasti nyata, di luar jendela 24 jam, template, rate limit **tidak** diuji |
| 5 | 6 | **Dinyatakan pemilik** | Hanya **Diterima**. **Dibaca tidak dinyatakan** |
| 6 | 7 | **Dinyatakan pemilik** (kejadian + perbaikan) | **Baru:** pengiriman juga berhasil lewat **Graph API Explorer**. Itu **bukan** jalur TE One (daftar penerima uji TE One tidak berlaku di sana, dan pesannya tidak tercatat sebagai pesan TE One); hanya membuktikan izin akun, bukan perilaku TE One. Tabel kode galat belum dicocokkan ke dokumentasi Meta (S-04) |
| 7 | 8 | **Dinyatakan pemilik** (kejadian + perbaikan) | **Baru dan ambigu:** "**aplikasi dibuat ulang**" — lihat §4 Q1. Event yang ditolak selama gangguan tidak dijamin pulih (S-02) |
| 8 | (sebelumnya [OP]) | **Dinyatakan pemilik, diperiksa langsung di database** | Lebih kuat daripada tampilan UI. Hasil kueri/tangkapan belum terlampir |
| 9 | (§0 matriks) | **Dinyatakan pemilik** | Ponsel + Cloud API sama-sama berfungsi untuk …6319 — konsisten dengan coexistence aktif, tetapi **bukan** pembacaan `is_on_biz_app`/`platform_type` dari Graph API (`prosedur-uji-m11-m12.md` 0.8, opsional sebagai silang-cek) |
| 10 | (§0 matriks) | **Dinyatakan pemilik** | **Tegas:** pemilik **tidak** menyatakan history diterima/diproses TE One. Jam onboarding belum dicatat |
| 11 | (§0 matriks) | **Dinyatakan pemilik** ("terlihat") | `smb_app_state_sync` **tidak dinyatakan**. Nama field belum dicocokkan ke dokumentasi resmi (V-1) |

**Tetap BELUM DIUJI:** status **Dibaca**; **echo** (M-11); **history** diterima/diproses (M-12); **media** masuk/keluar; jendela layanan 24 jam nyata; webhook duplikat nyata; kirim gagal/belum pasti nyata; rate limit; template; **keterkaitan image ↔ commit**; backup/restore di server; HTTPS/cookie/header/G1 melalui staging.

## 4. Klarifikasi yang diminta (tidak menahan pencatatan ini)

| # | Pertanyaan | Mengapa penting |
|---|---|---|
| **Q1** | Butir 7: "**aplikasi dibuat ulang**" — aplikasi **apa**: kontainer TE One (mis. `docker compose up -d --force-recreate`/build ulang image), atau **aplikasi Meta** (app baru)? Kapan, dan perintah apa? | Bila kontainer/image dibangun ulang saat itu, ID `417b30f8…` kemungkinan **image yang dipakai uji setelah perbaikan**, dan perlu dicatat. Bila **aplikasi Meta** dibuat ulang: `META_APP_ID`, callback, langganan WABA, dan daftar field webhook berubah — semuanya perlu dicek ulang, dan pastikan **tidak terkait aplikasi/koneksi Halo AI** (AGENTS.md §3.2) |
| **Q2** | Butir 3: 4 digit akhir nomor di luar daftar uji, jam kejadian, dan apakah itu nomor **tim** atau **pelanggan nyata** | AGENTS.md §3.5 (tanpa data pelanggan nyata untuk uji). Payload dikarantina dibuang, tetapi identitas uji perlu tercatat |
| **Q3** | Butir 7: berapa lama webhook tidak menerima event, dan apakah ada pelanggan nyata yang sempat mengirim ke …6319 pada periode itu | S-02: event yang ditolak tidak dijamin pulih; periksa pesan terlewat lewat Business App |
| **Q4** | Butir 8: kueri/keluaran (hanya kunci flag + nilai + jam) | Artefak ringan, cukup untuk G3 |
| **Q5** | Butir 11: status `smb_app_state_sync`, dan di layar mana "terlihat tidak aktif" (dashboard aplikasi **TE One**, bukan aplikasi lain) | Pastikan field yang dilihat milik aplikasi yang benar |
| **Q6** | **Jam onboarding …6319** | Menentukan apakah jendela sinkronisasi riwayat sudah lewat (§2.3 prosedur) |

## 5. Dampak ke status Gate

- **Gate 2 / G2-A07:** tetap **Terbuka**, dengan perubahan: butir 1–8 kini **dinyatakan langsung oleh pemilik** (bukan lagi laporan sampingan); artefak belum terlampir. **CCP 2.8 (echo)** dan **CCP 2.10 (coexistence nyata)** **tetap tidak terpenuhi**; **CCP 2.9 nyata (history)** tetap tidak teramati.
- **Gate 1:** tidak berubah. Prasyarat staging (HTTPS, cookie, G1 via staging, backup/restore di server, PIC) tetap belum dibuktikan.
- **Rekomendasi pembangun tidak berubah:** Gate 1 **TAHAN**; Gate 2 **TAHAN** dengan **LANJUT TERBATAS** untuk melengkapi bukti; Tahap 3 hanya simulasi terisolasi. Pernyataan ini memperkuat **sumber** klaim, bukan **status pembuktian**.
- **Tidak ada** persetujuan A-1…A-3 yang tersirat dari pernyataan ini. Pembangun **tidak** memulai rebuild, subscribe field, atau langkah lain.
