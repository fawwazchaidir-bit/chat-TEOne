# Prosedur uji nyata terkontrol M-11 (echo) dan M-12 (history) + rekonsiliasi staging

> **DRAF UNTUK KEPUTUSAN PEMILIK. BELUM DIJALANKAN.** Disusun 25 November 2026 atas permintaan pemilik setelah operator melaporkan kondisi VPS staging dan nomor uji.
> **Pembangun tidak melakukan apa pun** terhadap staging, akun Meta, atau ponsel uji. **Tidak ada** field webhook yang diaktifkan, **tidak ada** re-onboarding, **tidak ada** pendaftaran ulang nomor, **tidak ada** `git reset`/`pull`, **tidak ada** penggantian image. Dokumen ini hanya rencana; setiap langkah bertanda **[TUNGGU KEPUTUSAN]** hanya boleh dijalankan setelah formulir §10 diisi **tertulis oleh pemilik** (formulir sengaja dibiarkan **kosong**).
> Admisi (…1119), Hotline (…0124), dan Halo AI **tidak** menjadi bagian prosedur ini sedikit pun. Hanya nomor uji **…6319** (penguji **…4062**).
> **PEMBARUAN 26 Nov (izin M-11):** pemilik **mengizinkan tertulis** uji echo M-11 pada …6319 ([`persetujuan-pemilik-m11-2026-11-26.md`](persetujuan-pemilik-m11-2026-11-26.md)). **Pelaksanaan kini mengikuti [`runbook-uji-m11.md`](runbook-uji-m11.md)** (gerbang GO/NO-GO, kueri, kondisi berhenti, lembar teks). **Berubah karena batas izin:** S4 dan S7 **dibatalkan**; bukti **teks**, bukan tangkapan layar; **tanpa** rebuild image dan **tanpa** worker. §6 di bawah dipertahankan sebagai riwayat rancangan. Dokumentasi resmi Meta **dibaca** ([`verifikasi-dokumentasi-meta-2026-11-26.md`](verifikasi-dokumentasi-meta-2026-11-26.md)).
> **PEMBARUAN S-12 (26 Nov 2026):** TE One kini **memiliki pemicu sinkronisasi** (SMB App Data API Step 1/2; PR S-12, flag `history_sync` default **mati**) sehingga M-12 **dapat** dirancang tanpa menunggu tindakan di luar TE One — lihat **Opsi H3** di §7. H3 **belum dijalankan**, **belum disetujui**, dan **tidak boleh** dijalankan pada …6319 (berisi chat pelanggan nyata), Admisi, atau Hotline.
>
> **PEMBARUAN setelah laporan Fase 0 operator (26 Nov 03.59 WIB):** kondisi **STOP (a)** §4 **terpicu** — ponsel …6319 berisi **chat pelanggan nyata**. **M-11 dan perubahan subscription tidak boleh dilanjutkan** sampai pemilik memutuskan cara isolasi (§2.4, formulir **A-2c**). **Koreksi:** dugaan saya semula bahwa jendela sinkronisasi riwayat "hampir pasti sudah lewat" **salah** (onboarding ±16.00 WIB 25 Nov) — lihat §2.3 dan §2.4.

## 0. Label sumber — baca dulu

| Label | Arti |
|---|---|
| **[OP]** | Dilaporkan operator/pemilik. Pembangun **tidak dapat memeriksanya**; bukti belum terlampir. |
| **[KODE]** | Perilaku kode di repository (dibaca langsung; terbukti **simulasi** oleh tes/CI, bukan oleh Meta nyata). |
| **[META-SEK]** | Dari ringkasan hasil pencarian web (termasuk sumber sekunder), **belum dibaca di halaman resmi**. **Sejak 26 Nov** sebagian besar butir sudah **diverifikasi ke halaman resmi** dan diberi label **[META-RESMI]** di [`verifikasi-dokumentasi-meta-2026-11-26.md`](verifikasi-dokumentasi-meta-2026-11-26.md); yang masih **[META-SEK]**/**TIDAK DITEMUKAN**: V-5 (efek subscribe/cabut field terhadap registrasi), V-6, V-9. Catatan: klaim lama "host tidak terjangkau" hanya benar untuk alat fetch subagen; `curl` lewat proxy sesi berhasil. |
| **[ASUMSI]** | Dugaan pembangun, tidak ada bukti. |

## 1. Kondisi yang dilaporkan operator (25 Nov 2026) **[OP]**

| Hal | Laporan |
|---|---|
| Checkout Git di VPS | `9c297d36149bdac2133d0c6da1f53fef41629245` |
| Perubahan lokal | (1) baris `tests` **dihapus** dari `.dockerignore`; (2) domain placeholder di `deploy/Caddyfile` **diganti** domain staging |
| `deploy/Caddyfile.sebelum-debug` | **identik** dengan `deploy/Caddyfile` aktif |
| Image yang berjalan | `sha256:417b30f8d2203e5edeb78177342c92dd6a5874d763776ea086734696df0df8af`; **tanpa label revisi** |
| Kesehatan | aplikasi dan database *healthy* |
| Feature flag | `inbox` **mati**, `ai_simulation` **mati**, `whatsapp_connector` **aktif** |
| Tindakan | **belum ada** reset, pull, atau penggantian image |
| Nomor uji …6319 | aktif di **WhatsApp Business App dan Cloud API sekaligus**; versi aplikasi ponsel **2.26.45.80**; negara **Indonesia** |
| Sinkronisasi riwayat | pemilik mengonfirmasi **dipilih saat onboarding** |
| Field webhook (pemeriksaan terakhir) | `messages` **aktif**; `smb_message_echoes` dan `history` **tidak aktif** (status `smb_app_state_sync` **tidak dilaporkan**) |
| Persetujuan M-11 / M-12 | **belum diberikan** |
| **Fase 0 (laporan operator, 26 Nov) [OP]** | Proyek Compose aktif bernama **`deploy`**; kontainer DB memakai volume **`deploy_pg_data`**, kontainer aplikasi memakai **`deploy_media_data`**; volume **`deploy_caddy_data`** ada |
| Onboarding …6319 **[OP]** | dihubungkan **±16.00 WIB, 25 Nov 2026** (≈ 09.00 UTC) — **perkiraan ingatan pemilik, bukan catatan Meta (Q6); tidak boleh dipakai sendirian untuk menyimpulkan M-12** |
| Isi ponsel …6319 **[OP]** | **memiliki chat pelanggan nyata** |
| Keputusan operator **[OP]** | Sesuai kondisi STOP, **uji echo dan perubahan subscription terkait tidak dijalankan** |

## 2. Yang disimpulkan dari laporan itu

### 2.1 Rekonsiliasi staging
1. **Dua perubahan lokal = persis dua perubahan yang sudah saya perkirakan** dan keduanya sudah **digantikan di repository** (commit `2148cc2`/`3928772`): `tsconfig.build.json` membuat `.dockerignore` boleh tetap mengecualikan `tests`; `{$SITE_ADDRESS}` + `deploy/.env` menggantikan edit domain. Setelah image dibangun ulang dari commit final, **tidak ada edit lokal yang perlu dipertahankan**. **[KODE]**
2. **`Caddyfile.sebelum-debug` bukan cadangan sebelum-edit**, karena identik dengan berkas aktif. Isi aslinya (placeholder) ada di Git: `git show 9c297d3:deploy/Caddyfile`. Jadi **tidak ada informasi yang hilang** bila edit lokal dilepas kelak. Tetap **jangan dihapus dan jangan di-commit** sampai pemulihan §5 selesai.
3. **Asal-usul image `417b30f8…` tidak dapat dibuktikan.** Image tanpa label revisi dan dibangun dengan perubahan lokal; "dibangun dari `9c297d3` + dua edit itu" adalah **klaim [OP]**. Build Docker tidak *bit-reproducible*, jadi membangun ulang lalu membandingkan ID **tidak** membuktikan apa pun. Konsekuensi: **bukti uji 25 Nov tetap berstatus KLAIM**, dan bukti uji berikutnya **sebaiknya** dibuat pada image berlabel (§5).
4. **Image yang berjalan belum memuat penjaga** `ai_simulation` terhadap Meta asli (ditambahkan di `3928772`). Flag mati → aman **secara konfigurasi**, bukan **secara penegakan**: satu klik Super Admin di halaman Kill switch & flag dapat menyalakannya, dan pesan `[SIMULASI]` akan lewat Graph API nyata ke penerima uji. Risiko kecil (mode uji membatasi penerima ke …4062), hilang setelah image dibangun ulang. **[KODE]**
5. **Tidak ada migrasi/skema baru sejak `9c297d3`** (`git diff 9c297d3 HEAD -- src/db drizzle` kosong). Mengembalikan image lama (rollback) **aman terhadap skema DB**. **[KODE, terverifikasi di repository]**
6. **JEBAKAN data (penting).** `deploy/docker-compose.staging.yml` **tidak** memuat `name:` proyek, dan volume `pg_data`, `media_data`, `caddy_data` adalah volume bernama biasa. Docker Compose memberi awalan volume dengan **nama proyek = nama direktori**. Menjalankan compose dari checkout bersih di direktori lain berarti **proyek baru dengan volume kosong = database kosong baru** — persis yang dilarang ("jangan membuat ulang database"). Semua perintah compose di §5 **wajib** memakai `-p deploy` dan diverifikasi sebelum/sesudah. **Pembaruan Fase 0 [OP]:** nama proyek aktif **`deploy`** (volume `deploy_pg_data`, `deploy_media_data`, `deploy_caddy_data`) — itu nama default dari direktori `deploy/` tempat berkas compose berada, sehingga checkout bersih yang berkas compose-nya juga di `…/deploy/` kemungkinan menghasilkan nama yang sama; **risiko lebih rendah dari dugaan awal, tetapi `-p deploy` tetap wajib** (eksplisit, tidak bergantung pada nama direktori). **[KODE: berkas compose; perilaku Compose: pengetahuan umum, periksa dengan `docker compose config`]**

### 2.2 Yang diketahui dari kode tentang echo dan history **[KODE]**
| Perilaku | Echo (`smb_message_echoes`) | History (`history`) |
|---|---|---|
| Nama field yang dikenali normalizer | `smb_message_echoes` (isi `message_echoes`, atau `messages` sebagai cadangan; penerima dari `to`/`recipient_id`) | `history` (isi `history[].threads[].messages[]`, progres di `metadata`) |
| Mode uji (`testMode`) — penerima/pelanggan **di luar daftar** | **Dikarantina**, audit `integration.unlisted_sender` (hanya `kind`), **payload dibuang** (`payload = NULL`), tidak ada kontak/percakapan dibuat | Sama |
| Penerima/pelanggan **di dalam daftar** (…4062) | Pesan **keluar** sumber `whatsapp_business_app`, ditandai; **tidak** mengubah `last_customer_message_at` (jendela 24 jam), **tidak** menambah belum-dibaca, **tidak** membuat job otomatisasi; bila `ai_status='aktif'` dan waktu terbukti baru → AI **Off** (D-05, **ASUMSI**) dengan audit | Pesan ditandai `is_history`; **tidak** memicu otomatisasi/belum dibaca; media riwayat **tidak diunduh** |
| Media | Echo **bermedia** memicu **unduhan media nyata dari Graph** (`attachMedia(... "download")`) | Tidak diunduh |
| Bentuk tak dikenal / `to` tidak ada | Dikarantina (`bentuk_tidak_dikenal` / `echo_tanpa_penerima`); **payload dibuang** | Dikarantina |
| Payload event yang **diproses** | **Disimpan** di `inbound_events.payload` (retensi D-18 ≤ 30 hari = **usulan, belum diputuskan**) | Sama |

**Konsekuensi:**
- **Kesenjangan bukti bentuk (S-05, baru):** karena payload yang dikarantina dibuang dan event `unknown` hanya menyimpan alasan, **bentuk payload nyata Meta tidak pernah tercatat** bila normalizer meleset. Uji pertama yang gagal-aman hanya akan menghasilkan alasan karantina, **tanpa data bentuk** untuk memperbaiki normalizer → butuh putaran uji kedua (dan pesan nyata kedua). Lihat usulan R-1 di §11.
- **Cakupan echo seluas akun, bukan seluas percakapan uji:** begitu field di-subscribe, **setiap** pesan yang dikirim dari Business App di …6319 ke **siapa pun** akan dikirim Meta ke webhook **[META-SEK, V-3]**. Di TE One pesan ke nomor di luar daftar dikarantina tanpa menyimpan payload, tetapi payload **tetap tiba di server dan sempat berada di antrean** sebelum diproses.
- `meta:check` mencetak daftar "field yang perlu di-subscribe" berisi **keempat** field. Itu **bukan** instruksi mengaktifkan semuanya; prosedur ini hanya mengizinkan **satu field per keputusan** (`smb_message_echoes` untuk M-11).

### 2.3 Yang dikatakan sumber sekunder tentang riwayat **[META-SEK — wajib dicocokkan, V-1/V-2/V-4]**
- Setelah onboarding, bisnis hanya punya **24 jam** untuk menyinkronkan kontak dan riwayat; lewat itu, nomor harus di-*offboard* dan onboarding diulang. Sinkronisasi riwayat **sekali saja**.
- Field yang dibutuhkan adalah `history`, `smb_app_state_sync`, `smb_message_echoes`; riwayat hanya dikirim bila bisnis setuju saat onboarding.
- Seorang pengguna melaporkan **tidak ada cara meminta ulang** sinkronisasi setelah onboarding.
- **Akibat bila benar (DIKOREKSI 26 Nov):** `history` **tidak di-subscribe** saat onboarding …6319 **[OP]**, sehingga riwayat yang mungkin dikirim Meta tidak sampai ke TE One. Dugaan semula bahwa jendela "hampir pasti sudah lewat" **salah**: onboarding **±16.00 WIB 25 Nov** [OP] → bila aturan 24 jam benar, jendela baru berakhir **±16.00 WIB 26 Nov** (**hanya ilustrasi**: bila perkiraan onboarding ±16.00 WIB benar, saat laporan ini ditulis, 03.59 WIB, ± 12 jam tersisa — **tetapi waktu onboarding adalah perkiraan ingatan pemilik dan aturan 24 jam belum diverifikasi; keduanya tidak boleh dipakai sendirian untuk menyimpulkan M-12**, V-2/V-9). **Namun** jendela terbuka **tidak** berarti M-12 boleh dikerjakan: ponsel berisi **chat pelanggan nyata** (STOP a) — lihat §2.4.

### 2.4 Pembaruan setelah laporan Fase 0 (26 Nov 03.59 WIB)
**Fakta baru [OP]:** onboarding ±16.00 WIB 25 Nov; ponsel …6319 berisi **chat pelanggan nyata**; proyek Compose `deploy` (volume `deploy_*`). Nomor …6319 adalah kandidat nomor **Kemitraan** (AGENTS.md §1; D-03: "kandidat nomor uji dan nomor operasional pertama"), sehingga pelanggan nyata di dalamnya **sesuai harapan**, bukan anomali.

**Konsekuensi (tegas):**
1. **STOP (a) terpicu.** M-11 dan setiap perubahan subscription **tidak dilanjutkan**. Keputusan operator untuk berhenti **benar** menurut prosedur.
2. **Kenyataan yang berlaku sejak ±16.00 WIB 25 Nov:** karena `messages` aktif pada nomor yang berisi pelanggan nyata, **setiap pesan masuk dari pelanggan nyata ke …6319 dikirim Meta ke webhook staging** (itu cara kerja langganan `messages`; **apakah sudah ada pelanggan yang benar-benar menulis sejak onboarding belum diketahui** — jawabannya ada di kueri 0.12). Rancangan menanganinya (D-03/mode uji): pengirim di luar daftar → **dikarantina**, audit hanya `kind`, **payload dibuang** setelah diproses **[KODE, terbukti simulasi]**; tetapi payload **sempat berada di antrean** dan **tiba di server staging**. Ini aliran data pelanggan nyata ke lingkungan non-production yang **perlu Anda sadari dan catat** (UU PDP; dokumentasi pihak ketiga D-18). **Periksa (baca-saja, teks saja):** jumlah karantina `pengirim_di_luar_daftar_uji` (kueri 0.12) dan pastikan **log Caddy tidak mencatat isi permintaan** (0.13). *Ini juga menjawab sebagian Q2/Q3 pernyataan pemilik.*
3. **M-12 / H1 (subscribe `history`) DILARANG** selama ada chat pelanggan nyata: riwayat (hingga ±6 bulan, **[META-SEK]**) berisi **banyak percakapan sekaligus**; seluruh potongan tiba di staging. Jendela yang masih terbuka **tidak boleh menjadi alasan** — tidak ada tekanan waktu yang sah untuk memasukkan data pelanggan nyata ke staging. **Rekomendasi: H0.** Bila jendela lewat, M-12 tetap "belum dapat diuji" (sudah default); jalur bukti riwayat nyata ke depan = **nomor khusus uji yang bersih** (H2 pada nomor itu, bukan …6319).
4. **M-11 pada …6319** hanya mungkin dengan **isolasi yang diputuskan pemilik** (formulir **A-2c**):

| Opsi | Isi | Dampak | Catatan |
|---|---|---|---|
| **I-1** | **Tidak menguji echo di …6319** (tunggu nomor uji bersih). M-11 = "belum dapat diuji" | Nol ke akun/data | Aman; CCP 2.8 tetap belum terpenuhi. **Rekomendasi pembangun bila tidak ada nomor bersih dalam waktu dekat** |
| **I-2** | Siapkan **nomor uji khusus** (bukan …1119/…0124/…6319) dengan ponsel bersih berisi chat sintetis; M-11 **dan** M-12 diuji di sana | Onboarding nomor **baru** (tindakan berdampak akun → persetujuan terpisah); riwayat nyata ada di nomor itu **hanya bila** `history` di-subscribe **sebelum** onboarding | **Satu-satunya jalan** ke CCP 2.8, 2.9 dan 2.10 tanpa data pelanggan nyata. Sebaiknya ditempuh sebelum Tahap 3 dihubungkan |
| **I-3** | M-11 di …6319 dengan **pembekuan ponsel**: selama jendela uji (≤ 10 menit) **tidak ada** yang mengirim pesan ke pelanggan dari Business App (juga WhatsApp Web/perangkat tertaut, pesan otomatis/sapaan/di-luar-jam); hanya pesan uji ke …4062 | Hanya echo yang dikirim **setelah** subscribe yang tiba; pesan pelanggan nyata tidak ikut **bila** pembekuan dipatuhi. Risiko residual: pesan otomatis Business App atau staf yang lupa → echo ke nomor di luar daftar (dikarantina, payload dibuang) | **Risiko lebih tinggi** daripada I-1/I-2; butuh kepastian dari V-3 (cakupan echo termasuk pesan otomatis?) dan persetujuan tertulis A-2 + A-2c. Belum direkomendasikan |

5. Tidak ada tindakan lain yang diminta dari Anda sekarang selain **keputusan A-2c** dan **tidak men-subscribe field apa pun**.

## 3. Peta fase, dampak, dan gerbang

| Fase | Isi | Mengubah akun Meta/WhatsApp? | Mengubah data/konfigurasi TE One? | Gerbang |
|---|---|---|---|---|
| **0** | Pemeriksaan **baca-saja** (§4) | Tidak | Tidak | Tidak perlu persetujuan tambahan |
| **1** | Titik pemulihan + bangun ulang image bersih + pasang dengan provenance (§5) | Tidak | Mengganti **image app/worker** (data tidak diubah); downtime singkat webhook | **A-1** (tertulis) |
| **2** | **M-11 echo** (§6): subscribe **hanya** `smb_message_echoes`, kirim pesan uji dari ponsel, amati, **cabut subscribe** | **Ya, ringan & dapat dibalik**: konfigurasi subscription webhook aplikasi TE One. **Bukan** re-onboarding, **bukan** pendaftaran ulang, **bukan** perubahan coexistence **[META-SEK, V-5]** | Menambah data uji sintetis (pesan keluar …4062, audit) | **A-2** (tertulis) |
| **3** | **M-12 history** (§7): pilih salah satu opsi **H0 / H1 / H2** | H0 tidak; **H1 ringan**; **H2 berat (onboarding ulang)** | H0 tidak; H1 mungkin menambah data riwayat; H2 ya | **A-3** (tertulis, memilih opsi) |

Urutan wajib: 0 → 1 → 2 → 3. Fase 2 **tidak boleh** mendahului Fase 1 bila pemilik memilih rekomendasi (lihat §5.0).

## 4. Fase 0 — pemeriksaan baca-saja (operator; tidak mengubah apa pun)

Semua perintah **tidak mencetak rahasia**. **Jangan** menjalankan `docker inspect` tanpa `--format` dan **jangan** menempel isi `/etc/teone/*.env` — itu memuat token dan App Secret. Simpan keluaran di folder khusus **di luar repository** dan tempel ke laporan hanya setelah disamarkan.

| # | Pemeriksaan | Perintah / tindakan | Yang dicatat |
|---|---|---|---|
| 0.1 | Identitas checkout | `git -C <repo> rev-parse HEAD && git -C <repo> status --short` | SHA, daftar berkas berubah (sudah dilaporkan; catat ulang dengan jam) |
| 0.2 | Diff lokal | `git -C <repo> diff -- .dockerignore deploy/Caddyfile > <folder-pemulihan>/local.diff` | berkas `local.diff` (simpan; **bukan** di Git) |
| 0.3 | Image berjalan | `docker image inspect sha256:417b30f8… --format 'Id={{.Id}} Dibuat={{.Created}} Tag={{.RepoTags}} Revisi={{index .Config.Labels "org.opencontainers.image.revision"}}'` | `Revisi` diharapkan **kosong** (sesuai laporan) |
| 0.4 | **[DIJAWAB 26 Nov — [OP]: proyek `deploy`; `deploy_pg_data`, `deploy_media_data`, `deploy_caddy_data`]** **Nama proyek compose & volume** | `docker compose ls` ; `docker volume ls --format '{{.Name}}' \| grep -E 'pg_data\|media_data\|caddy_data'` | **nama proyek** dan nama volume persis (dibutuhkan untuk `-p` di §5) |
| 0.5 | Kontainer | `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'` | semua `healthy` |
| 0.6 | Flag | halaman **Kill switch & flag**: `inbox` mati, `ai_simulation` mati, `whatsapp_connector` aktif; catat **status kill switch global** | tangkapan layar disamarkan |
| 0.7 | Diagnostik koneksi (**sudah ada**, baca-saja) | `npm run meta:check` di kontainer/tools (keluaran tidak memuat rahasia) | mode `NYATA`; nomor; "webhook berlangganan: ya/TIDAK" |
| 0.8 | Status coexistence nyata nomor …6319 | Graph API `GET /<phone_number_id>?fields=is_on_biz_app,platform_type` memakai token dari server; **jangan** menampilkan token. **[META-SEK, V-6]** | `is_on_biz_app` dan `platform_type` |
| 0.9 | **[DIJAWAB 26 Nov — [OP]: perkiraan INGATAN pemilik ±16.00 WIB 25 Nov; BELUM diverifikasi dari catatan Meta (V-9)]** **Jam onboarding …6319** | WhatsApp Manager / catatan onboarding | tanggal-jam onboarding (kunci untuk §7) |
| 0.10 | **[DIJAWAB 26 Nov — [OP]: ADA chat pelanggan nyata → STOP (a) TERPICU]** **Isi ponsel uji** | Hitung jumlah chat di Business App ponsel …6319 (**tanpa menyalin isi**); tulis apakah ada chat dengan **pelanggan nyata** | jumlah chat; ya/tidak ada pelanggan nyata |
| 0.11 | Aplikasi TE One hanya berlangganan WABA uji | hasil 0.7 per channel; periksa di dashboard Meta (aplikasi **TE One**, bukan aplikasi Halo AI) | daftar WABA yang disubscribe |
| 0.12 | **Baseline data** (SQL baca-saja, simpan angkanya) | lihat blok di bawah | angka sebelum uji; **terutama jumlah karantina `pengirim_di_luar_daftar_uji`** sejak onboarding |
| 0.13 | **Log Caddy** (baru, baca-saja) | pastikan tidak ada blok debug/log yang mencatat **isi** permintaan webhook; `docker logs <caddy> --since 24h \| grep -c webhooks/whatsapp` hanya menghitung baris (jangan menempel isinya) | tingkat log; hitungan baris |
| 0.14 | **Waktu pembuatan kontainer** (Q1; baca-saja, **tanpa** Env) | `sudo docker inspect --format '{{.Name}} dibuat={{.Created}} mulai={{.State.StartedAt}} image={{.Image}}' $(sudo docker ps -q)` | jam `deploy-app-1` dibuat ulang (belum tercatat, Q1); **S-08 dicabut** (tidak ada worker) — baris ini kini hanya mencatat jam recreate |
| 0.15 | **Resolusi variabel compose** (S-09; baca-saja) | `sudo docker compose -p deploy --env-file /etc/teone/staging.env -f docker-compose.staging.yml config \| grep -E 'image:\|SITE_ADDRESS'` | nilai `image:` dan `SITE_ADDRESS` yang **benar-benar** dipakai (jangan menempel bagian Env lain) |

```sql
-- 0.12 Baseline (baca-saja). Jalankan sebagai peran baca di database staging; catat angkanya + jam server (UTC).
SELECT now() AS jam_server_utc;
SELECT count(*) AS pesan_total,
       count(*) FILTER (WHERE source = 'whatsapp_business_app') AS pesan_echo,
       count(*) FILTER (WHERE is_history) AS pesan_history FROM messages;
SELECT status, kind, count(*) FROM inbound_events GROUP BY 1,2 ORDER BY 1,2;
SELECT quarantine_reason, count(*) FROM inbound_events WHERE status='quarantined' GROUP BY 1;
SELECT count(*) AS job_otomatisasi FROM automation_jobs;
SELECT count(*) AS outbox FROM domain_outbox;
-- Percakapan uji (…4062): catat last_customer_message_at, ai_status, ai_version SEBELUM uji
SELECT c.id, c.last_customer_message_at, c.ai_status, c.ai_version FROM conversations c
  JOIN contacts k ON k.id = c.contact_id; -- batasi ke percakapan …4062 di sisi operator
```

**Hasil Fase 0 yang menghentikan rencana (STOP):** (a) ada chat pelanggan nyata di ponsel …6319 (0.10) → **jangan lanjut ke Fase 2** sebelum pemilik memutuskan cara mengisolasinya — **TERPICU 26 Nov 2026**; (b) aplikasi TE One ternyata berlangganan WABA selain WABA uji (0.11); (c) flag `inbox`/`ai_simulation` ternyata menyala; (d) 0.8 menunjukkan keadaan yang berbeda dari laporan (mis. bukan coexistence).

## 5. Fase 1 — titik pemulihan, bangun ulang, pasang **[TUNGGU KEPUTUSAN A-1]**

### 5.0 Mengapa Fase 1 didahulukan (rekomendasi pembangun)
Bukti M-11 hanya bernilai bila dapat **diikat ke commit** yang diaudit. Image berjalan tidak berlabel (§2.1-3) dan belum memuat penjaga `ai_simulation` (§2.1-4). Mengujinya apa adanya akan menghasilkan bukti yang **tidak dapat dikaitkan ke commit** dan menambah utang audit. **Opsi B** (uji pada image lama) tetap dimungkinkan bila pemilik memilihnya di §10, dengan konsekuensi bukti berstatus KLAIM-image.

### 5.1 Titik pemulihan (**sebelum** menyentuh apa pun)
> **Status 26 Nov (dinyatakan pemilik):** backup dibuat, **checksum cocok** (pemeriksaan manual), dan **uji restore terisolasi** dilakukan; keduanya dinyatakan **diverifikasi independen oleh auditor**. **Rincian teks dan catatan auditor belum diterima** (lihat `runbook-uji-m11.md` §3.5–§3.6). Yang **dinyatakan selesai hanya titik pemulihan ini**; **rebuild/penggantian image (§5.2–§5.3) tidak dijalankan** (syarat 7 izin M-11).
1. Folder pemulihan di luar repo, mis. `/root/pemulihan-2026-11-25/` (mode 700).
2. Simpan: `local.diff` (0.2), salinan `deploy/Caddyfile` aktif, keluaran 0.1–0.5.
3. **Tag cadangan image berjalan** (tidak menghapus apa pun): `docker tag sha256:417b30f8… teone-app:rollback-20261125-417b30f8` (dan untuk `teone-tools` bila ada). Catat bahwa kontainer **tetap** memakai image lama sampai langkah 5.3.
4. **Backup DB + media** dengan `scripts/backup.sh` (lihat `docs/backup-restore.md`; passphrase dari berkas, tidak di argumen). Catat: nama berkas, **SHA-256**, ukuran, **versi migrasi**, jam, **lokasi salinan terpisah** (di luar VPS), dan **PIC pembuat**. **PIC pemeriksa** menjalankan verifikasi checksum. Lakukan **restore uji ke database terpisah** (`restore.sh` ke DB sementara, bukan ke DB staging) bila memungkinkan; bila belum, catat sebagai **BELUM DIUJI di server**.
5. Tangkapan layar halaman Kill switch & flag dan daftar field webhook di dashboard (sebelum).

### 5.2 Bangun image dari checkout **bersih** (tanpa menyentuh checkout lama)
```bash
# Di VPS, direktori BARU di luar checkout lama; checkout lama TIDAK diubah (tanpa reset/pull/checkout di sana).
git clone https://github.com/fawwazchaidir-bit/chat-TEOne.git /opt/teone-build/<sha7>   # atau git fetch + git worktree add
git -C /opt/teone-build/<sha7> checkout --detach <SHA-final-yang-diaudit>
cd /opt/teone-build/<sha7> && bash scripts/build-staging-image.sh      # menolak pohon kotor; mencetak blok PROVENANCE
```
Catat blok **PROVENANCE** (SHA, image id, label). Skrip menandai `teone-app:staging-<sha7>` dan `teone-tools:staging-<sha7>`.

### 5.3 Pasang (downtime singkat — lakukan saat penguji tidak mengirim)
```bash
# Gaya perintah operator: dari direktori deploy/, `sudo docker compose --env-file /etc/teone/staging.env -f docker-compose.staging.yml …`.
# 1) WAJIB -p deploy (volume deploy_pg_data / deploy_media_data / deploy_caddy_data YANG SAMA; lihat §2.1-6).
# 2) WAJIB menyediakan SITE_ADDRESS dan TEONE_TAG SECARA EKSPLISIT: --env-file menonaktifkan pembacaan otomatis deploy/.env (S-09).
#    Pilih satu: (a) dua --env-file (di bawah), atau (b) `sudo env SITE_ADDRESS=… TEONE_TAG=… docker compose …`.
BUILD=/home/TEAdmin/teone-build/<sha7>        # checkout BERSIH baru (bukan /home/TEAdmin/chat-TEOne)
F="-p deploy --env-file /etc/teone/staging.env --env-file $BUILD/deploy/.env -f $BUILD/deploy/docker-compose.staging.yml"
#    $BUILD/deploy/.env berisi HANYA SITE_ADDRESS=<domain staging> dan TEONE_TAG=staging-<sha7> (non-rahasia).
sudo docker compose $F config | grep -E 'image:|SITE_ADDRESS|pg_data|media_data'    # PERIKSA: image=staging-<sha7>, domain benar, volume deploy_*
sudo docker volume ls --format '{{.Name}}' | grep -E 'pg_data|media_data|caddy_data'  # tidak boleh muncul volume baru
sudo docker compose $F up -d app caddy            # TANPA worker: menyalakan worker = keputusan terpisah A-4 (pemeliharaan-inline-vs-worker.md §7)
```
**Jangan** menjalankan `down -v`, menghapus volume, atau `db:migrate`/seed (tidak ada migrasi baru; jika tetap dijalankan, ia *no-op* karena forward-only).
**Verifikasi sesudah:** `docker inspect <kontainer-app> --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'` = SHA final; `GET /api/health` = `{"status":"ok"}`; **flag tidak berubah** (disimpan di DB); `meta:check` (0.7) hasil sama; jumlah baris baseline (0.12) **tidak turun**.

### 5.4 Cara menghentikan / mundur Fase 1
- **Gagal sehat atau data tampak kosong:** segera `TEONE_TAG=rollback-20261125-417b30f8 docker compose -p deploy … up -d app worker` (image lama; skema DB identik → aman). Bila volume ternyata **baru/kosong**: hentikan, **jangan menulis apa pun**, kembalikan `-p` yang benar; data lama masih di volume lama.
- Caddy/domain: pulihkan dari salinan `deploy/Caddyfile` yang disimpan di 5.1.

## 6. Fase 2 — M-11 echo **[IZIN DITERIMA 26 Nov — pelaksanaan: `runbook-uji-m11.md`; S4 dan S7 di tabel di bawah DIBATALKAN]**

### 6.1 Prasyarat (semua harus ya)
- [ ] Fase 0 selesai tanpa kondisi STOP; hasil 0.10: ponsel …6319 **hanya** berisi chat uji, atau pemilik memutuskan tertulis cara mengisolasinya.
- [ ] Fase 1 selesai (atau Opsi B dipilih tertulis).
- [ ] Verifikasi dokumentasi resmi Meta oleh operator/pemilik: **V-1…V-9 (§11) terjawab** dan tidak bertentangan dengan rencana ini.
- [ ] **Kill switch global DINYALAKAN** untuk durasi uji (pengaman berlapis; echo tetap diproses, otomatisasi diblokir). Status awal dicatat dan **dikembalikan manual** sesudah uji (kill switch tidak menyala/mati sendiri).
- [ ] `inbox` dan `ai_simulation` **mati**; mode uji channel **aktif**; daftar penerima uji **hanya …4062**.
- [ ] Backup 5.1 ada, checksum tercatat; PIC & jam uji ditetapkan; **hanya satu orang** yang memegang ponsel …6319 selama uji.
- [ ] Rencana kontak darurat: siapa yang mematikan field (S6) bila ada masalah.

### 6.2 Langkah
| # | Langkah | Pelaku | Hasil yang diharapkan / dicatat |
|---|---|---|---|
| S0 | Catat T0 (jam server UTC). Ambil baseline 0.12 lagi. | Operator | angka baseline |
| S1 | Di dashboard **aplikasi Meta milik TE One** (pastikan nama/ID = `META_APP_ID` TE One, **bukan** aplikasi Halo AI): aktifkan **hanya** `smb_message_echoes`. **Jangan** menyentuh `history`, `smb_app_state_sync`, nomor, WABA, atau pengaturan coexistence. | Operator (Admin aplikasi Meta) | tangkapan layar sebelum/sesudah; jam |
| S2 | Dari **WhatsApp Business App di ponsel …6319**, kirim **satu** teks sintetis ke **…4062**: `[UJI-ECHO-01 sintetis]` | Pemegang ponsel | — |
| S3 | Tunggu ≤ 2 menit. Amati alat uji integrasi/percakapan …4062 | Operator | lihat kriteria lulus |
| S4 *(opsional, perlu sub-persetujuan A-2b)* | **Kontrol negatif:** kirim `[UJI-ECHO-02 sintetis]` dari ponsel ke **nomor tim lain yang bersedia** dan **tidak ada di daftar uji**. Nomor itu menerima **pesan WhatsApp nyata**; orangnya harus setuju | Pemegang ponsel + pihak ketiga | harus **dikarantina** `pengirim_di_luar_daftar_uji`, **tanpa** kontak/percakapan baru, payload dibuang |
| S5 | Ambil baseline 0.12 lagi; bandingkan | Operator | selisih = yang diharapkan saja |
| S6 | **Cabut** langganan `smb_message_echoes` (kembalikan ke keadaan awal). Catat T1. | Operator | tangkapan layar |
| S7 | **Bukti pembalikan:** dari ponsel kirim `[UJI-ECHO-03 sintetis]` ke …4062; tunggu 2 menit | Pemegang ponsel | **tidak ada** event echo baru (membuktikan field benar-benar mati) |
| S8 | Kembalikan kill switch global ke status awal **secara manual** (bila awalnya mati). Catat. | Super Admin | audit tercatat |
| S9 | Kumpulkan bukti disamarkan → `docs/reports/bukti/` (§6.4); isi baris M-11 di matriks | Operator + pembangun | status M-11 |

### 6.3 Kriteria hasil M-11 (hasil hanya: **lulus / gagal / belum dapat diuji**)
**LULUS** bila **semua**: (1) webhook menerima dan menjawab 200 (tanpa penolakan tanda tangan); (2) tepat **satu** pesan **keluar** bersumber `whatsapp_business_app` di percakapan …4062, **tidak ganda**; (3) `last_customer_message_at` **tidak berubah** dan jendela layanan **tidak terbuka/diperpanjang**; (4) belum-dibaca tidak bertambah; (5) `automation_jobs` dan `domain_outbox` **tidak bertambah** dan **0 panggilan kirim Graph** dari TE One; (6) `ai_status` berubah ke Off **hanya bila** sebelumnya `aktif` (D-05, ASUMSI — catat sebagai perilaku asumsi, bukan keputusan); (7) S7 membuktikan pembalikan; (8) bila S4 dijalankan: dikarantina sesuai harapan.
**GAGAL-AMAN** (hasil **gagal**, bukan bahaya): event dikarantina `bentuk_tidak_dikenal`/`echo_tanpa_penerima` → normalizer tidak cocok dengan payload nyata. **Jangan ulangi sebelum bentuk payload dapat ditangkap** (S-05/R-1). Temuan T2-F02 naik, CCP 2.8 tetap belum terpenuhi.
**BELUM DAPAT DIUJI:** Meta tidak mengirim echo meski field aktif (mis. versi aplikasi/konfigurasi) — catat tanpa menebak sebab.
CCP 2.8 **hanya** lulus bila M-11 lulus nyata. CCP 2.10 **tidak** lulus dari M-11 saja.

### 6.4 Bukti yang dilampirkan (disamarkan: nomor 4 digit akhir; tanpa token/App Secret/Verify Token; isi chat hanya teks sintetis)
Tangkapan layar field webhook sebelum/sesudah (S1, S6); hasil baseline sebelum/sesudah; tampilan percakapan …4062 dengan pesan echo (sumber "WhatsApp Business App"); entri audit; baris karantina (S4, hanya `reason`); `docker inspect` revisi image (5.3).

### 6.5 Dampak M-11
| Ranah | Dampak |
|---|---|
| **Akun Meta/WhatsApp** | Perubahan **konfigurasi subscription webhook aplikasi TE One** saja; dapat dibalik dengan mencabutnya (S6/S7). Tidak mengubah registrasi nomor, tautan ke aplikasi ponsel, PIN verifikasi dua langkah, atau kualitas nomor **[META-SEK, V-5 — wajib dicocokkan]**. Pesan yang dikirim dari ponsel **sebelum** subscribe **tidak** disusulkan **[ASUMSI]**. |
| **Data TE One** | +1–3 baris `messages` (sintetis), +event di `inbound_events` (payload yang diproses tersimpan, retensi D-18 **belum diputuskan**), +audit. Tidak ada kontak pelanggan nyata. |
| **Pihak ketiga** | Pada S4 satu orang tim menerima pesan nyata (sintetis) dan nomornya **sempat** ada di payload yang kemudian dibuang. Tanpa S4: tidak ada. |
| **Biaya** | Pesan dari Business App **gratis** **[META-SEK]**; tidak ada kirim Cloud API dari TE One. |
| **Risiko utama** | R-a: ponsel dipakai ke pelanggan nyata selama field aktif → payload tiba di server (di-karantina, dibuang). Mitigasi: hanya satu pemegang ponsel, durasi singkat, 0.10. R-b: normalizer tak cocok payload → hasil gagal-aman (S-05). R-c: webhook down saat uji → Meta mencoba ulang; event dapat terlewat (S-02). |

### 6.6 Cara menghentikan M-11 (urutan dari paling ringan)
1. **Cabut field `smb_message_echoes`** di dashboard (±1 menit; menghentikan aliran di **sumber**). *Utama.*
2. **Kill switch global ON** (otomatisasi diblokir; tidak menghentikan penerimaan echo). Tidak menyala/mati sendiri.
3. **Darurat saja:** matikan flag `whatsapp_connector` → webhook menjawab 404 untuk **semua** event (termasuk `messages`/status) dan Meta mengulang; event dapat hilang (S-02), Meta bisa menonaktifkan webhook bila gagal berkepanjangan. Pakai hanya bila ada dugaan data sensitif masuk dan field tidak dapat dicabut.

## 7. Fase 3 — M-12 history **[TUNGGU KEPUTUSAN A-3]**

**Pernyataan jujur:** M-12 **mungkin tidak dapat diuji tanpa onboarding ulang** (§2.3, hipotesis). Memicunya adalah **onboarding ulang** → **dilarang tanpa keputusan tertulis pemilik atas dampaknya**. Pemilik memilih **satu** opsi di §10.

### Opsi H0 — Tidak menguji history sekarang (**rekomendasi pembangun**)
- **Tindakan:** tidak ada perubahan akun/konfigurasi. M-12 dicatat **"belum dapat diuji"**; CCP 2.9 nyata dan CCP 2.10 **tidak terpenuhi**; Tahap 2 tetap **"belum lulus penuh"** (sesuai CCP 2.10). Perilaku history tetap **terbukti simulasi** (fixture, tes `G2-A03`, deduplikasi, tanpa pemicu otomatis).
- **Dampak:** akun 0; data 0; **biaya = status Tahap 2 tidak naik**.
- **Kapan dipilih:** bila risiko akun/privasi dinilai lebih besar daripada nilai bukti history, atau menunggu nomor uji khusus.

### ~~Opsi H1 — Pengamatan pasif: subscribe `history` saja~~ **[DIHAPUS 26 Nov: tidak akan menghasilkan event — dokumentasi resmi: webhook `history` dipicu oleh permintaan Step 2 ke SMB App Data API, bukan oleh subscription; TE One tidak punya pemicu itu (S-12). Juga dilarang pada …6319 selama ada chat pelanggan nyata]**
- **Tindakan:** setelah 0.9 menunjukkan jam onboarding, dan **hanya bila** dokumentasi resmi menyatakan riwayat dapat/masih dikirim: aktifkan `history` **saja**, amati ≤ 24 jam, lalu cabut. **Tanpa** permintaan sinkronisasi, **tanpa** onboarding.
- **Dampak akun:** konfigurasi subscription (dapat dibalik). **Dampak data:** bila Meta mengirim riwayat, payload berisi **banyak percakapan sekaligus**; TE One memfilter per pesan terhadap daftar uji dan membuang payload yang dikarantina, tetapi **seluruh potongan tiba di server dan sempat berada di antrean** — bila ponsel memuat chat pelanggan nyata, ini **data pelanggan nyata di staging** (AGENTS.md §3.5). **Syarat mutlak:** hasil 0.10 = tidak ada chat pelanggan nyata.
- **Hasil yang paling mungkin [ASUMSI]:** tidak ada event (jendela lewat) → M-12 tetap **"belum dapat diuji"**; itu **bukan** kegagalan kode.
- **Penghentian:** cabut `history`; tidak ada efek lain.

### Opsi H2 — Onboarding ulang nomor uji dengan `history` di-subscribe **sebelum** onboarding **[DILARANG sampai keputusan tertulis; dampak berat]**
- Hanya disebut agar pemilik tahu konsekuensinya; **pembangun tidak merekomendasikannya sekarang**.
- **Dampak (semua [META-SEK], V-1/V-2/V-5):** *offboarding* nomor dari alur coexistence lalu onboarding ulang lewat Embedded Signup; ponsel dan Cloud API **terputus sementara**; sinkronisasi riwayat **ditawarkan lagi** dan jendela 24 jam berlaku lagi; kemungkinan butuh PIN verifikasi dua langkah; semua pesan yang masuk saat terputus **terancam hilang**; riwayat yang masuk adalah **seluruh chat di ponsel** (harus **hanya** chat uji — bila tidak, data pelanggan nyata masuk staging).
- **Prasyarat bila pemilik tetap ingin:** nomor ke-3 **khusus uji** tanpa pelanggan nyata (bukan …1119/…0124), ponsel bersih berisi chat sintetis, field `history`+`smb_message_echoes`+`smb_app_state_sync` di-subscribe **sebelum** onboarding, jendela waktu dan orang yang siap ≥ 24 jam, backup baru, persetujuan terpisah atas **langkah dan dampaknya**.
- **Pemulihan:** onboarding ulang adalah satu-satunya cara memulihkan keadaan bila terputus; **tidak dapat dibatalkan oleh TE One**.

### Opsi H3 — Nomor uji BERSIH di-onboard baru + Step 1/2 dari TE One dalam 24 jam **[BARU 26 Nov (S-12); TUNGGU KEPUTUSAN A-3; disarankan bila M-12 nyata ingin dikejar]**
- **Mengapa ini satu-satunya jalur yang masuk akal:** jendela sinkronisasi hanya **24 jam** sejak onboarding dan tiap langkah **sekali** (resmi, 26 Nov). Pemicu kini ada di TE One, tetapi hanya berguna pada nomor yang **baru** di-onboard dan **tanpa chat pelanggan nyata**. …6319 **tidak** memenuhi syarat itu (jendela lewat + chat nyata). Opsi "saat onboarding Admisi Tahap 9" **tidak disarankan** sebagai satu-satunya kesempatan uji: kesempatannya sekali dan salah langkah berarti offboarding nomor operasional.
- **Prasyarat (semua harus ya; pembangun tidak menjalankan satu pun):**
  1. PR S-12 sudah diaudit independen dan di-merge; image baru terpasang di staging oleh operator (migrasi `0006` terapan, worker berjalan); **flag `history_sync` dinyalakan Super Admin hanya setelah keputusan tertulis ini**.
  2. Nomor uji **bersih** (bukan …6319, …1119, …0124): ponsel berisi **hanya chat sintetis**; channel TE One untuk nomor itu **bukan operasional**, **mode uji aktif**, penguji terdaftar di daftar penerima uji; kill switch global/channel **mati**.
  3. **Sebelum onboarding**, operator men-*subscribe* **`history`, `smb_app_state_sync`, `smb_message_echoes`** pada aplikasi Meta TE One (tanpa itu webhook sinkronisasi **terlewat** — resmi) dan memverifikasi callback staging; backup baru + titik pemulihan (`docs/backup-restore.md`).
  4. Dua orang siap ≥ 24 jam (satu Super Admin dengan 2FA + satu operator), dan persetujuan terpisah atas langkah ini.
- **Langkah (urut):**
  - **L1** Onboard nomor uji lewat Embedded Signup dan **setujui berbagi riwayat**; **catat jam selesai onboarding (WIB) saat itu juga** (tangkapan layar berjam, disamarkan).
  - **L2** TE One → *Channel* → *Koneksi WhatsApp*: simpan pemetaan (WABA + phone_number_id) → **Periksa koneksi** sampai *terverifikasi — NYATA*.
  - **L3** Panel *Sinkronisasi riwayat* → **Nyatakan jam onboarding** (tersimpan sebagai **"dinyatakan admin"**, bukan bukti Meta).
  - **L4** **Step 1 (kontak)** dengan konfirmasi ganda → tunggu webhook `smb_app_state_sync` (kontak tersimpan tanpa percakapan) → baru **Step 2 (riwayat)** → amati `history` fase 0/1/2, progres → 0 otomatisasi/unread.
  - **L5** Catat hasil: audit `integration.history_sync_requested` (diterima/gagal/belum pasti), jumlah event kontak/riwayat, progres, status penolakan 2593109 bila ada. **Hasil hanya: lulus / gagal / belum dapat diuji.**
- **Kondisi berhenti:** jam onboarding tak pasti; jendela tersisa < 30 menit (TE One menolak sendiri); chat non-sintetis muncul; hasil **"belum pasti"** (jangan mengulang — selesaikan manual setelah bukti); kill switch menyala. Terlewatnya jendela = **"belum dapat diuji"**, **bukan** kegagalan kode; mengulang = offboarding + onboarding ulang → **keputusan terpisah**.
- **Dampak:** akun nomor operasional **0**; data = chat sintetis di staging (retensi D-18); biaya = satu nomor uji tambahan + ±1 hari kerja dua orang. **Nilai bukti:** menutup CCP 2.9 nyata (history) dan menyelesaikan S-12; CCP 2.10 bergantung pada M-11 juga.

## 8. Tombol darurat — ringkasan
| Tingkat | Tindakan | Menghentikan | Efek samping | Dapat dibalik? |
|---|---|---|---|---|
| T1 | Cabut field yang baru diaktifkan (dashboard Meta) | Aliran echo/history baru | Tidak ada | Ya |
| T2 | Kill switch **global** ON | Semua otomatisasi/kirim otomatis | Tidak menyala/mati sendiri; harus dikembalikan manual | Ya |
| T3 | Flag `whatsapp_connector` OFF | Webhook, status, kirim | Event bisa terlewat; Meta mengulang | Ya, tetapi event terlewat tidak pulih |
| T4 | `TEONE_TAG=rollback-… docker compose -p … up -d app worker` | Image baru | Downtime singkat | Ya (skema sama) |
| T5 | Restore backup ke **database terpisah**, verifikasi, lalu putuskan | Data tak diinginkan | Hanya atas keputusan pemilik; mode aman (kill switch global ON) setelah restore | Terbatas |

## 9. Rencana pemulihan
1. **Konfigurasi Meta salah/berlebih:** kembalikan daftar field ke tangkapan layar "sebelum" (S1/5.1). Tidak ada data akun yang diubah oleh prosedur ini.
2. **Image/deploy bermasalah:** T4. Jangan menyentuh volume. Bila volume tampak baru → berhenti, perbaiki `-p`.
3. **Data uji tak terduga masuk (mis. chat pelanggan nyata):** (a) hentikan sumbernya (T1; T3 bila perlu); (b) **jangan menghapus ad hoc** — audit log append-only dan retensi/penghapusan **belum diputuskan (D-18)**; (c) hitung ruang lingkup dengan SQL baca-saja (0.12) dan catat sebagai **insiden** (siapa/kapan/jumlah, tanpa isi); (d) **pemilik memutuskan**: simpan-dengan-batas-retensi atau restore dari backup 5.1 ke database terpisah lalu memindahkan aplikasi; restore memakai `scripts/restore.sh` yang sudah terbukti di drill (DB + media + mode aman); (e) bila data pelanggan nyata terlibat → kaji kewajiban UU PDP bersama pemilik.
4. **Koneksi nomor …6319 putus/berubah (belum pernah teramati):** prosedur ini tidak mengubah registrasi sehingga **tidak diperkirakan**. Bila terjadi, **jangan** meregistrasi ulang; laporkan ke pemilik; pemulihan adalah keputusan terpisah (onboarding ulang dampaknya §7-H2). **Tidak ada jalur pemulihan akun yang dapat saya buktikan.**
5. **Pesan terlewat selama downtime/gangguan:** periksa lewat Business App di ponsel uji (S-02); tidak ada pemulihan otomatis.

## 10. Formulir keputusan pemilik — **DIBIARKAN KOSONG** (hanya pemilik yang mengisi)

| Kode | Keputusan | Setuju | Tolak | Catatan/syarat | Nama · tanggal · tanda tangan |
|---|---|---|---|---|---|
| **A-1** | Bangun ulang image dari commit bersih `<SHA>` dan ganti image app/worker staging **setelah** titik pemulihan 5.1 | ☐ | ☐ | | |
| **A-1b** | Bila A-1 ditolak: uji **Opsi B** pada image lama `417b30f8…` (bukti berstatus KLAIM-image) | ☐ | ☐ | | |
| **A-2** | **[Persetujuan tertulis pemilik diterima 26 Nov — lihat `persetujuan-pemilik-m11-2026-11-26.md`; kotak di bawah tidak diisi pembangun]** Jalankan M-11: subscribe **hanya** `smb_message_echoes` pada aplikasi TE One, uji S0–S9, lalu cabut | ☐ | ☐ | | |
| **A-2b** | Sertakan kontrol negatif S4 (kirim ke satu nomor tim di luar daftar uji; orangnya setuju) | ☐ | ☐ | nama pihak: | |
| **A-2c** | **[Pemilik mengizinkan M-11 pada …6319 dengan syarat satu operator/tanpa aktivitas lain = setara I-3; lihat persetujuan]** **Isolasi ponsel …6319 untuk M-11** (STOP a terpicu): pilih **satu** | ☐ I-1 (tidak menguji) | ☐ I-2 (nomor uji bersih) | ☐ I-3 (pembekuan ponsel; belum direkomendasikan) | |
| **A-3** | M-12: pilih **satu** | ☐ H0 | ☐ H1 (dihapus) | ☐ H2 (dilarang sampai persetujuan terpisah tertulis) · ☐ **H3** (nomor uji bersih + Step 1/2 dalam 24 jam; butuh PR S-12 diterima + persetujuan terpisah) | |
| **A-4** | **Jalankan worker terpisah** (opsi W1: `up -d --no-deps worker`) setelah kueri §5 di [`pemeliharaan-inline-vs-worker.md`](pemeliharaan-inline-vs-worker.md) ditinjau | ☑ | ☐ | Jalankan setelah kueri §5 dicatat (angka saja), dengan `-p deploy` | Pemilik proyek · 26 Nov 2026 · pernyataan tertulis di sesi audit (`gates/keputusan-pemilik-fase-0-2026-11-26.md`) |
| **D-18/D-12** | Retensi/penghapusan data uji & RPO/RTO (masih **Terbuka**) | ☐ diputuskan | ☐ ditunda | | |

## 11. Daftar cek verifikasi ke dokumentasi resmi Meta (operator/pemilik) dan usulan pembangun

**Status 26 Nov:** V-1…V-4, V-7, V-8 **terjawab dari halaman resmi** (dibaca pembangun lewat `curl`; lihat `verifikasi-dokumentasi-meta-2026-11-26.md`); **V-5, V-6, V-9 belum terjawab**. Operator tetap mengonfirmasi halaman yang sama **saat ini** (runbook P4). Daftar asli (catat URL dan tanggal halaman):
- **V-1** Nama persis dan fungsi `smb_message_echoes`, `history`, `smb_app_state_sync`; mana yang wajib.
- **V-2** Jendela sinkronisasi riwayat/kontak setelah onboarding (apakah 24 jam, sekali saja); apa yang terjadi bila terlewat; apakah riwayat dapat diminta ulang tanpa onboarding ulang.
- **V-3** Cakupan echo: semua pesan dari Business App ke **siapa pun**, atau terbatas?
- **V-4** Apakah `history` harus di-subscribe **sebelum** onboarding agar riwayat dikirim; bentuk payload (`threads`, `messages`, `metadata.phase/chunk_order/progress`, `errors`).
- **V-5** Apakah mengaktifkan/mencabut subscription field memengaruhi registrasi, tautan Business App, atau status coexistence.
- **V-6** Nama field status nomor (`is_on_biz_app`, `platform_type`) dan artinya.
- **V-7** Bentuk payload `smb_message_echoes` (kunci array pesan, field penerima).
- **V-8** Kebijakan *retry* webhook Meta (berapa kali/berapa lama; kapan webhook dinonaktifkan) — dasar menilai S-02 dan jendela gangguan Q3.
- **V-9** Di sisi Meta, **di mana** catatan waktu onboarding nomor dapat dilihat (WhatsApp Manager/Business Manager/log), agar jam onboarding tidak bergantung ingatan.

**Usulan pembangun (BELUM dikerjakan; butuh persetujuan lingkup, idealnya masuk **sebelum** Fase 1 agar image yang dibangun sudah memuatnya):**
- **R-1 (S-05)** *Perekam bentuk payload*: untuk event `unknown`/dikarantina-karena-bentuk, simpan **hanya struktur kunci** (nama kunci dan tipe, **tanpa nilai**, tanpa nomor/teks) di log aman/tabel kecil. Tujuannya agar uji pertama yang gagal-aman tetap menghasilkan data untuk memperbaiki normalizer tanpa menyimpan data pribadi. Ukuran kecil; dapat diuji dengan fixture.
- **R-2** Tetapkan `name: deploy` di `deploy/docker-compose.staging.yml` (nama proyek aktif **diketahui sekarang: `deploy`**) sehingga volume yang ada (`deploy_pg_data`, `deploy_media_data`, `deploy_caddy_data`) tetap dipakai dan jebakan §2.1-6 tertutup permanen. Perubahan kecil; butuh persetujuan lingkup (G9).
- **R-3** Koreksi pesan `meta:check` agar tidak terbaca sebagai "aktifkan keempat field": ubah menjadi "field yang dikenali; aktifkan **satu per satu** sesuai prosedur".

## 12. Batas dokumen ini
- **Belum pernah dijalankan.** Perintah belum diuji terhadap server staging; operator menyesuaikan nama jalur/proyek. Pembangun tidak punya Docker daemon, server, akun Meta, atau ponsel.
- Pernyataan tentang perilaku Meta berlabel **[META-RESMI]** (dibaca di halaman resmi 26 Nov) atau **[META-SEK]** (belum dibaca resmi: V-5, V-6, V-9). Pernyataan tentang kode adalah **terbukti simulasi** (tes/CI), bukan terbukti nyata.
- Dokumen ini **bukan** keputusan, **bukan** persetujuan, dan **tidak** menyatakan Gate 1/2 diterima. Tidak ada tag yang dibuat.
