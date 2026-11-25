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

**Sejak 26 Nov:** pemilik memutuskan **tidak melampirkan tangkapan layar** (disamarkan sekalipun) — label menjadi **"Dinyatakan pemilik — tanpa artefak di repository (keputusan pemilik)"**. Lihat §6.

Alasan tidak menaikkan otomatis: (1) pemilik adalah **satu-satunya saksi** dan sekaligus operator serta pengambil keputusan gate — auditor independen perlu artefak untuk menilai; (2) hasil diikat ke **checkout** `9c297d3`, bukan ke **image** yang berjalan (`417b30f8…`, tanpa label revisi; lihat [`prosedur-uji-m11-m12.md`](prosedur-uji-m11-m12.md) §2.1-3); (3) definisi §4 mensyaratkan bukti tersedia.

## 3. Pemetaan ke catatan sebelumnya dan status

| Pernyataan | Butir catatan sebelumnya | Status sekarang | Yang baru / yang tetap tidak dibuktikan |
|---|---|---|---|
| 1 | 1, 2 | **Dinyatakan pemilik** | Verifikasi = pemetaan nomor↔WABA + langganan webhook. Bukan "siap menerima pesan" (G2-A05). Mode `nyata` di panel koneksi belum diperlihatkan |
| 2 | 3 | **Dinyatakan pemilik** | **Baru:** jenis pesan dinyatakan **teks** (sebelumnya "diasumsikan"). Gambar/PDF tidak diuji |
| 3 | 4 | **Dinyatakan pemilik** | **Baru:** alasan karantina `pengirim_di_luar_daftar_uji` **cocok** dengan kode (`quarantineUnlisted`, **[KODE]**, terbukti simulasi). **Dijawab (§7 Q2):** pesan itu **dikirim tidak sengaja dari nomor yang salah** (bukan kontrol terencana); 4 digit akhir dan kategorinya **belum dipastikan** |
| 4 | 5 | **Dinyatakan pemilik** | Satu jalur teks sukses; gagal/belum-pasti nyata, di luar jendela 24 jam, template, rate limit **tidak** diuji |
| 5 | 6 | **Dinyatakan pemilik** | Hanya **Diterima**. **Dibaca tidak dinyatakan** |
| 6 | 7 | **Dinyatakan pemilik** (kejadian + perbaikan) | **Baru:** pengiriman juga berhasil lewat **Graph API Explorer**. Itu **bukan** jalur TE One (daftar penerima uji TE One tidak berlaku di sana, dan pesannya tidak tercatat sebagai pesan TE One); hanya membuktikan izin akun, bukan perilaku TE One. Tabel kode galat belum dicocokkan ke dokumentasi Meta (S-04) |
| 7 | 8 | **Dinyatakan pemilik** (kejadian + perbaikan) | **Dijawab (§7 Q1):** "aplikasi dibuat ulang" = **container `deploy-app-1`** (bukan aplikasi Meta), tanpa build/ganti image. Event yang ditolak selama gangguan tidak dijamin pulih (S-02) |
| 8 | (sebelumnya [OP]) | **Dinyatakan pemilik, diperiksa langsung di database** | Lebih kuat daripada tampilan UI. Hasil kueri/tangkapan belum terlampir |
| 9 | (§0 matriks) | **Dinyatakan pemilik** | Ponsel + Cloud API sama-sama berfungsi untuk …6319 — konsisten dengan coexistence aktif, tetapi **bukan** pembacaan `is_on_biz_app`/`platform_type` dari Graph API (`prosedur-uji-m11-m12.md` 0.8, opsional sebagai silang-cek) |
| 10 | (§0 matriks) | **Dinyatakan pemilik** | **Tegas:** pemilik **tidak** menyatakan history diterima/diproses TE One. Jam onboarding belum dicatat |
| 11 | (§0 matriks) | **Dinyatakan pemilik** ("terlihat") | `smb_app_state_sync` **tidak dinyatakan**. Nama field belum dicocokkan ke dokumentasi resmi (V-1) |

**Tetap BELUM DIUJI:** status **Dibaca**; **echo** (M-11); **history** diterima/diproses (M-12); **media** masuk/keluar; jendela layanan 24 jam nyata; webhook duplikat nyata; kirim gagal/belum pasti nyata; rate limit; template; **keterkaitan image ↔ commit**; backup/restore di server; HTTPS/cookie/header/G1 melalui staging.

## 4. Klarifikasi yang diminta (tidak menahan pencatatan ini) — **DIJAWAB 26 Nov, lihat §7**

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

## 6. Permintaan pemilik (26 Nov): menaikkan status ke "Terbukti nyata" tanpa tangkapan layar

**Permintaan:** menaikkan status pernyataan di atas ke "terbukti nyata" karena pemilik **tidak berkenan** mengirim tangkapan layar, disamarkan sekalipun.

**Yang dicatat (hak pemilik, dihormati):** pemilik **memutuskan tidak melampirkan tangkapan layar**. Tidak ada kewajiban melampirkannya; pembangun tidak akan memintanya lagi. Keputusan ini dicatat di sini dan di `daftar-tindakan-pemilik.md` G2.

**Yang TIDAK dilakukan pembangun, dan alasannya:** label **"Terbukti nyata" tidak dipasang**. (1) AGENTS.md §4 mendefinisikannya sebagai *diuji nyata **dan** buktinya tersedia*; §3.7–§3.8 melarang menyatakan "lulus/terverifikasi" atau mengarang hasil tanpa bukti pemeriksaan nyata. (2) AGENTS.md hanya dapat diubah lewat Pull Request yang disetujui pemilik, dan instruksi tahap/obrolan **tidak boleh melonggarkannya**. (3) Pembaca label ini adalah **auditor independen** (dan pihak lain kelak); mereka akan mencari bukti di balik kata "terbukti" dan tidak menemukannya — itu merusak nilai proses gate yang dirancang pemilik sendiri. Ini bukan penilaian bahwa pernyataan Anda tidak benar; ini soal apa yang dapat **diperiksa pihak lain**.

**Jalan ke "Terbukti nyata" TANPA tangkapan layar** (pilih yang sesuai; tidak ada yang mengharuskan gambar):
| Jalur | Isi | Memuat data pribadi? |
|---|---|---|
| **J1 — Bukti di sumber** | Data hasil uji **sudah ada di sistem**: baris pesan/status/audit/karantina di DB staging dan log pengiriman webhook di sisi Meta. Auditor independen memeriksanya **langsung, baca-saja, dalam sesi terawasi**; bila cocok dengan pernyataan, **auditor** mencatat "Terbukti nyata". Tidak ada yang dikirim ke repository | Tidak masuk repository |
| **J2 — Artefak teks saja** | Keluaran perintah/kueri **bukan gambar**: `npm run meta:check` (tanpa rahasia), hitungan kueri baseline §4.12 prosedur (jumlah, bukan isi pesan), `docker image inspect --format …` (Id, label), keluaran `docker compose ls`. Sebagian sudah Anda berikan di Fase 0 | Tidak (hitungan/ID saja) |
| **J3 — Keputusan penerimaan oleh pemilik** | Di formulir keputusan Gate 2 (bukan di label bukti), pemilik menulis bahwa Gate 2 diterima/ditunda **dengan dasar pernyataan sendiri tanpa artefak**. Ini keputusan pemilik; auditor tetap akan mencatat bahwa dasarnya kesaksian | — |
| **J4 — Ubah definisi** | Bila pemilik ingin pernyataan tertulis pemilik **sah sebagai bukti**, ubah AGENTS.md §4 melalui PR yang disetujui pemilik. Pembangun dapat menyiapkan usulan teks **bila diminta** (tidak dibuat sekarang) | — |

**Efek ke gate:** tidak berubah. Rekomendasi **TAHAN** (Gate 2) tetap; kini dengan catatan "dasar = kesaksian pemilik, tanpa artefak di repository". Yang paling murah untuk menutupnya: **J1 pada saat audit independen** (tanpa gambar, tanpa data keluar dari sistem).

## 7. Jawaban klarifikasi Q1–Q6 (disampaikan pemilik, 26 Nov 2026) dan penilaian pembangun

Jawaban dicatat **sesuai batas yang pemilik tetapkan sendiri**: jam yang tidak tercatat dan identitas yang belum dipastikan **tidak diisi dengan asumsi**.

| Q | Jawaban pemilik (ringkas; kutipan perintah utuh) | Label | Penilaian / dampak |
|---|---|---|---|
| **Q1** | "Aplikasi dibuat ulang" = **container aplikasi TE One** di VPS, **bukan aplikasi Meta**. Setelah token diperbarui, lalu setelah App Secret diperbaiki, operator menjalankan dari `/home/TEAdmin/chat-TEOne/deploy`:<br>`sudo docker compose --env-file /etc/teone/staging.env -f docker-compose.staging.yml up -d --no-deps --force-recreate app`<br>→ container `deploy-app-1` dibuat ulang; **tanpa build/ganti image**; sesudahnya image `sha256:417b30f8…df8af`. **Jam pasti belum dicatat.** Tidak ada pembuatan ulang aplikasi Meta | Dinyatakan pemilik (teks; belum dapat diperiksa pihak lain) | (1) Kekhawatiran `META_APP_ID`/callback/langganan berubah **gugur**. (2) Uji sesudah perbaikan berjalan pada image `417b30f8…` **(klaim; image tetap tanpa label → commit-nya tidak terbukti)**. (3) **S-08:** hanya `app` yang dibuat ulang; servis **`worker`** punya `env_file` sendiri dan memakai token Meta (unduh media, rekonsiliasi) → **kemungkinan masih membawa token lama**. Belum teramati karena media/rekonsiliasi nyata belum diuji. Periksa waktu pembuatan kontainer (prosedur 0.14). (4) **S-09:** karena perintah memakai `--env-file /etc/teone/staging.env`, Compose **tidak** membaca `deploy/.env` otomatis → `SITE_ADDRESS`/`TEONE_TAG` bisa **diam-diam kembali ke bawaan** (domain placeholder, tag `staging`) setelah beralih ke Caddyfile repo. Saat ini aman karena Caddyfile masih hasil edit lokal. Perbaikan di prosedur §5.3 |
| **Q2** | Event `pengirim_di_luar_daftar_uji` tercatat **25 Nov 2026 18.38.44 WIB (11:38:44 UTC)**. Pesan **dikirim tidak sengaja dari nomor yang salah** saat pengujian. **4 digit akhir dan kategori (nomor tim / nomor yang juga dipakai untuk pelanggan) belum dipastikan — jangan diisi dengan asumsi.** Event dikarantina; antarmuka menunjukkan payload dibuang | Dinyatakan pemilik | **Bukan kontrol negatif terencana**, tetapi perilaku **sesuai kode** (`quarantineUnlisted`, payload dibuang, **[KODE]**). Pengirim adalah **nomor milik pemilik sendiri yang salah pilih** — bukan pelanggan nyata. **TE One tidak menyimpan nomor pengirim yang dikarantina** (payload dibuang; audit hanya `kind`), sehingga identitasnya **hanya bisa dipastikan dari sisi pengirim** (riwayat pesan terkirim pada jam itu di ponsel/akun pengirim). **Tidak diisi pembangun** |
| **Q3** | Durasi gangguan **belum dapat ditentukan**. Pesan masuk nyata terakhir yang awalnya terlihat diproses: **18.41.13 WIB**. Setelahnya pesan baru dan status sempat tidak muncul. Setelah App Secret diperbaiki: pesan baru **≈ 20.34.56 WIB**; pesan uji **≈ 20.27 WIB** juga **kemudian** muncul. Sebagian event mungkin masuk setelah pengiriman ulang; **tidak** dinyatakan semua pulih. Apakah pelanggan nyata mengirim ke …6319 selama periode itu **belum diperiksa lengkap**; akan diperiksa terpisah **tanpa membagikan isi chat** | Dinyatakan pemilik | **Batas kasar** (bukan pengukuran): gangguan terjadi **antara 18.41.13 WIB dan ±20.27–20.35 WIB, ≈ 1 j 46 mnt – 1 j 54 mnt**. Konsisten dengan penolakan tanda tangan (event tidak disimpan, S-02) dan dengan *retry* Meta bagi sebagian event — **perilaku retry Meta belum diverifikasi (V-8)**. **Protokol pemeriksaan pelanggan tanpa membagikan isi (usulan):** hitung **jumlah** pesan masuk dari nomor yang bukan penguji pada 18.41–20.35 WIB di Business App (angka saja) dan bandingkan dengan hitungan karantina `pengirim_di_luar_daftar_uji` (prosedur 0.12). Selisih = pesan yang tidak pernah sampai ke TE One (**tidak merugikan pelanggan**: pesan tetap ada di ponsel; hanya salinan di staging yang hilang) |
| **Q4** | Kueri baca-saja di VPS staging:<br>`key                 enabled`<br>`ai_simulation       f`<br>`inbox               f`<br>`whatsapp_connector  t`<br>**Jam pemeriksaan tidak diambil**; hanya membuktikan kondisi **saat kueri dijalankan**, bukan seluruh periode uji | **Artefak teks (jalur J2)** dari pemilik; point-in-time | Menutup G3 **untuk saat kueri**. Untuk kueri berikutnya sertakan `SELECT now();` agar jamnya terukur |
| **Q5** | Pada daftar kolom webhook (tangkapan layar yang pemilik periksa): `smb_app_state_sync` **tidak aktif**; `smb_message_echoes` dan `history` **tidak aktif**; `messages` **aktif**. Dashboard: aplikasi **"Trilogika Edutama TE-One"**, **bukan** aplikasi Halo AI. Kondisi saat dilihat, bukan jaminan saat ini atau saat onboarding | Dinyatakan pemilik (tangkapan layar tidak dilampirkan, keputusan pemilik) | Menjawab Q5. **Silang-cek ringan yang disarankan:** operator mengonfirmasi **ya/tidak** bahwa ID aplikasi di dashboard itu = `META_APP_ID` di server (tanpa menampilkan nilainya) |
| **Q6** | Waktu onboarding …6319 **±16.00 WIB, 25 Nov 2026 — menurut ingatan pemilik, bukan waktu terverifikasi dari catatan Meta**. Pilihan sinkronisasi riwayat dipilih saat onboarding; **belum terbukti** history dikirim/diproses TE One. Perkiraan ini **tidak boleh dipakai sendirian** untuk menyimpulkan apakah M-12 masih mungkin; **jendela sinkronisasi dan cara meminta ulang tetap harus diverifikasi ke dokumentasi resmi Meta** | Dinyatakan pemilik (perkiraan) | **Diterima sepenuhnya.** Dokumen prosedur diperbarui: semua perhitungan sisa jendela (± 12 jam) kini ditandai **ilustrasi**, bukan dasar keputusan. M-12 pada …6319 tetap **terhalang** oleh STOP (a) (chat pelanggan nyata), terlepas dari jendela. Tambahan **V-9**: cari sumber catatan waktu onboarding di sisi Meta |

**Temuan baru dari jawaban ini:** **S-08** (worker tidak ikut dibuat ulang → env lama), **S-09** (`--env-file` menonaktifkan `deploy/.env`) — keduanya di [`bukti-uji-staging-2026-11-25.md`](bukti-uji-staging-2026-11-25.md) §4. **Tidak ada** persetujuan A-1…A-3/A-2c yang tersirat; **tidak ada** tindakan terhadap staging oleh pembangun.
