# Prosedur uji nyata terkontrol M-11 (echo) dan M-12 (history) + rekonsiliasi staging

> **DRAF UNTUK KEPUTUSAN PEMILIK. BELUM DIJALANKAN.** Disusun 25 November 2026 atas permintaan pemilik setelah operator melaporkan kondisi VPS staging dan nomor uji.
> **Pembangun tidak melakukan apa pun** terhadap staging, akun Meta, atau ponsel uji. **Tidak ada** field webhook yang diaktifkan, **tidak ada** re-onboarding, **tidak ada** pendaftaran ulang nomor, **tidak ada** `git reset`/`pull`, **tidak ada** penggantian image. Dokumen ini hanya rencana; setiap langkah bertanda **[TUNGGU KEPUTUSAN]** hanya boleh dijalankan setelah formulir §10 diisi **tertulis oleh pemilik** (formulir sengaja dibiarkan **kosong**).
> Admisi (…1119), Hotline (…0124), dan Halo AI **tidak** menjadi bagian prosedur ini sedikit pun. Hanya nomor uji **…6319** (penguji **…4062**).

## 0. Label sumber — baca dulu

| Label | Arti |
|---|---|
| **[OP]** | Dilaporkan operator/pemilik. Pembangun **tidak dapat memeriksanya**; bukti belum terlampir. |
| **[KODE]** | Perilaku kode di repository (dibaca langsung; terbukti **simulasi** oleh tes/CI, bukan oleh Meta nyata). |
| **[META-SEK]** | Dari ringkasan hasil pencarian web (termasuk sumber sekunder). **BELUM dibaca di dokumentasi resmi Meta**: `developers.facebook.com` tidak dapat dijangkau dari lingkungan pembangun (`ENOTFOUND`). Menurut AGENTS.md §7 ini **belum boleh menjadi dasar keputusan** — operator/pemilik harus mencocokkannya dengan halaman resmi sebelum menyetujui langkah yang berdampak ke akun (lihat §11, daftar cek V-1…V-7). |
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

## 2. Yang disimpulkan dari laporan itu

### 2.1 Rekonsiliasi staging
1. **Dua perubahan lokal = persis dua perubahan yang sudah saya perkirakan** dan keduanya sudah **digantikan di repository** (commit `2148cc2`/`3928772`): `tsconfig.build.json` membuat `.dockerignore` boleh tetap mengecualikan `tests`; `{$SITE_ADDRESS}` + `deploy/.env` menggantikan edit domain. Setelah image dibangun ulang dari commit final, **tidak ada edit lokal yang perlu dipertahankan**. **[KODE]**
2. **`Caddyfile.sebelum-debug` bukan cadangan sebelum-edit**, karena identik dengan berkas aktif. Isi aslinya (placeholder) ada di Git: `git show 9c297d3:deploy/Caddyfile`. Jadi **tidak ada informasi yang hilang** bila edit lokal dilepas kelak. Tetap **jangan dihapus dan jangan di-commit** sampai pemulihan §5 selesai.
3. **Asal-usul image `417b30f8…` tidak dapat dibuktikan.** Image tanpa label revisi dan dibangun dengan perubahan lokal; "dibangun dari `9c297d3` + dua edit itu" adalah **klaim [OP]**. Build Docker tidak *bit-reproducible*, jadi membangun ulang lalu membandingkan ID **tidak** membuktikan apa pun. Konsekuensi: **bukti uji 25 Nov tetap berstatus KLAIM**, dan bukti uji berikutnya **sebaiknya** dibuat pada image berlabel (§5).
4. **Image yang berjalan belum memuat penjaga** `ai_simulation` terhadap Meta asli (ditambahkan di `3928772`). Flag mati → aman **secara konfigurasi**, bukan **secara penegakan**: satu klik Super Admin di halaman Kill switch & flag dapat menyalakannya, dan pesan `[SIMULASI]` akan lewat Graph API nyata ke penerima uji. Risiko kecil (mode uji membatasi penerima ke …4062), hilang setelah image dibangun ulang. **[KODE]**
5. **Tidak ada migrasi/skema baru sejak `9c297d3`** (`git diff 9c297d3 HEAD -- src/db drizzle` kosong). Mengembalikan image lama (rollback) **aman terhadap skema DB**. **[KODE, terverifikasi di repository]**
6. **JEBAKAN data (penting).** `deploy/docker-compose.staging.yml` **tidak** memuat `name:` proyek, dan volume `pg_data`, `media_data`, `caddy_data` adalah volume bernama biasa. Docker Compose memberi awalan volume dengan **nama proyek = nama direktori**. Menjalankan compose dari checkout bersih di direktori lain berarti **proyek baru dengan volume kosong = database kosong baru** — persis yang dilarang ("jangan membuat ulang database"). Semua perintah compose di §5 **wajib** memakai `-p <nama-proyek-yang-sudah-ada>` dan diverifikasi sebelum/sesudah. **[KODE: berkas compose; perilaku Compose: pengetahuan umum, periksa dengan `docker compose config`]**

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
- **Akibat bila benar:** karena `history` **tidak di-subscribe** saat onboarding …6319 **[OP]**, riwayat yang mungkin dikirim Meta saat itu tidak sampai ke TE One, dan jendela 24 jam hampir pasti **sudah lewat** (onboarding terjadi sebelum 25 Nov). Maka **mengaktifkan `history` sekarang kemungkinan besar tidak menghasilkan apa pun** — dan satu-satunya jalan mendapat riwayat nyata adalah **onboarding ulang**, yang dilarang tanpa keputusan tertulis. Ini hipotesis; **jam onboarding …6319 harus dipastikan operator (langkah 0.4)**.

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
| 0.4 | **Nama proyek compose & volume** | `docker compose ls` ; `docker volume ls --format '{{.Name}}' \| grep -E 'pg_data\|media_data\|caddy_data'` | **nama proyek** dan nama volume persis (dibutuhkan untuk `-p` di §5) |
| 0.5 | Kontainer | `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'` | semua `healthy` |
| 0.6 | Flag | halaman **Kill switch & flag**: `inbox` mati, `ai_simulation` mati, `whatsapp_connector` aktif; catat **status kill switch global** | tangkapan layar disamarkan |
| 0.7 | Diagnostik koneksi (**sudah ada**, baca-saja) | `npm run meta:check` di kontainer/tools (keluaran tidak memuat rahasia) | mode `NYATA`; nomor; "webhook berlangganan: ya/TIDAK" |
| 0.8 | Status coexistence nyata nomor …6319 | Graph API `GET /<phone_number_id>?fields=is_on_biz_app,platform_type` memakai token dari server; **jangan** menampilkan token. **[META-SEK, V-6]** | `is_on_biz_app` dan `platform_type` |
| 0.9 | **Jam onboarding …6319** | WhatsApp Manager / catatan onboarding | tanggal-jam onboarding (kunci untuk §7) |
| 0.10 | **Isi ponsel uji** | Hitung jumlah chat di Business App ponsel …6319 (**tanpa menyalin isi**); tulis apakah ada chat dengan **pelanggan nyata** | jumlah chat; ya/tidak ada pelanggan nyata |
| 0.11 | Aplikasi TE One hanya berlangganan WABA uji | hasil 0.7 per channel; periksa di dashboard Meta (aplikasi **TE One**, bukan aplikasi Halo AI) | daftar WABA yang disubscribe |
| 0.12 | **Baseline data** (SQL baca-saja, simpan angkanya) | lihat blok di bawah | angka sebelum uji |

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

**Hasil Fase 0 yang menghentikan rencana (STOP):** (a) ada chat pelanggan nyata di ponsel …6319 (0.10) → **jangan lanjut ke Fase 2** sebelum pemilik memutuskan cara mengisolasinya; (b) aplikasi TE One ternyata berlangganan WABA selain WABA uji (0.11); (c) flag `inbox`/`ai_simulation` ternyata menyala; (d) 0.8 menunjukkan keadaan yang berbeda dari laporan (mis. bukan coexistence).

## 5. Fase 1 — titik pemulihan, bangun ulang, pasang **[TUNGGU KEPUTUSAN A-1]**

### 5.0 Mengapa Fase 1 didahulukan (rekomendasi pembangun)
Bukti M-11 hanya bernilai bila dapat **diikat ke commit** yang diaudit. Image berjalan tidak berlabel (§2.1-3) dan belum memuat penjaga `ai_simulation` (§2.1-4). Mengujinya apa adanya akan menghasilkan bukti yang **tidak dapat dikaitkan ke commit** dan menambah utang audit. **Opsi B** (uji pada image lama) tetap dimungkinkan bila pemilik memilihnya di §10, dengan konsekuensi bukti berstatus KLAIM-image.

### 5.1 Titik pemulihan (**sebelum** menyentuh apa pun)
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
# WAJIB -p <nama-proyek-dari-0.4> agar volume pg_data/media_data/caddy_data YANG SAMA dipakai (lihat §2.1-6).
# Berkas rahasia tetap di /etc/teone (jalur absolut di compose). Domain lewat deploy/.env (SITE_ADDRESS, TEONE_TAG) — bukan edit Caddyfile.
docker compose -p <nama-proyek> -f /opt/teone-build/<sha7>/deploy/docker-compose.staging.yml config | grep -E 'name:|pg_data|media_data'   # PERIKSA volume sama
docker volume ls --format '{{.Name}}' | grep -E 'pg_data|media_data'                                                                       # tidak boleh muncul volume baru
TEONE_TAG=staging-<sha7> docker compose -p <nama-proyek> -f /opt/teone-build/<sha7>/deploy/docker-compose.staging.yml up -d app worker caddy
```
**Jangan** menjalankan `down -v`, menghapus volume, atau `db:migrate`/seed (tidak ada migrasi baru; jika tetap dijalankan, ia *no-op* karena forward-only).
**Verifikasi sesudah:** `docker inspect <kontainer-app> --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'` = SHA final; `GET /api/health` = `{"status":"ok"}`; **flag tidak berubah** (disimpan di DB); `meta:check` (0.7) hasil sama; jumlah baris baseline (0.12) **tidak turun**.

### 5.4 Cara menghentikan / mundur Fase 1
- **Gagal sehat atau data tampak kosong:** segera `TEONE_TAG=rollback-20261125-417b30f8 docker compose -p <nama-proyek> … up -d app worker` (image lama; skema DB identik → aman). Bila volume ternyata **baru/kosong**: hentikan, **jangan menulis apa pun**, kembalikan `-p` yang benar; data lama masih di volume lama.
- Caddy/domain: pulihkan dari salinan `deploy/Caddyfile` yang disimpan di 5.1.

## 6. Fase 2 — M-11 echo **[TUNGGU KEPUTUSAN A-2]**

### 6.1 Prasyarat (semua harus ya)
- [ ] Fase 0 selesai tanpa kondisi STOP; hasil 0.10: ponsel …6319 **hanya** berisi chat uji, atau pemilik memutuskan tertulis cara mengisolasinya.
- [ ] Fase 1 selesai (atau Opsi B dipilih tertulis).
- [ ] Verifikasi dokumentasi resmi Meta oleh operator/pemilik: **V-1…V-7 (§11) terjawab** dan tidak bertentangan dengan rencana ini.
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

### Opsi H1 — Pengamatan pasif: subscribe `history` saja **[butuh A-3 + verifikasi V-2/V-4]**
- **Tindakan:** setelah 0.9 menunjukkan jam onboarding, dan **hanya bila** dokumentasi resmi menyatakan riwayat dapat/masih dikirim: aktifkan `history` **saja**, amati ≤ 24 jam, lalu cabut. **Tanpa** permintaan sinkronisasi, **tanpa** onboarding.
- **Dampak akun:** konfigurasi subscription (dapat dibalik). **Dampak data:** bila Meta mengirim riwayat, payload berisi **banyak percakapan sekaligus**; TE One memfilter per pesan terhadap daftar uji dan membuang payload yang dikarantina, tetapi **seluruh potongan tiba di server dan sempat berada di antrean** — bila ponsel memuat chat pelanggan nyata, ini **data pelanggan nyata di staging** (AGENTS.md §3.5). **Syarat mutlak:** hasil 0.10 = tidak ada chat pelanggan nyata.
- **Hasil yang paling mungkin [ASUMSI]:** tidak ada event (jendela lewat) → M-12 tetap **"belum dapat diuji"**; itu **bukan** kegagalan kode.
- **Penghentian:** cabut `history`; tidak ada efek lain.

### Opsi H2 — Onboarding ulang nomor uji dengan `history` di-subscribe **sebelum** onboarding **[DILARANG sampai keputusan tertulis; dampak berat]**
- Hanya disebut agar pemilik tahu konsekuensinya; **pembangun tidak merekomendasikannya sekarang**.
- **Dampak (semua [META-SEK], V-1/V-2/V-5):** *offboarding* nomor dari alur coexistence lalu onboarding ulang lewat Embedded Signup; ponsel dan Cloud API **terputus sementara**; sinkronisasi riwayat **ditawarkan lagi** dan jendela 24 jam berlaku lagi; kemungkinan butuh PIN verifikasi dua langkah; semua pesan yang masuk saat terputus **terancam hilang**; riwayat yang masuk adalah **seluruh chat di ponsel** (harus **hanya** chat uji — bila tidak, data pelanggan nyata masuk staging).
- **Prasyarat bila pemilik tetap ingin:** nomor ke-3 **khusus uji** tanpa pelanggan nyata (bukan …1119/…0124), ponsel bersih berisi chat sintetis, field `history`+`smb_message_echoes`+`smb_app_state_sync` di-subscribe **sebelum** onboarding, jendela waktu dan orang yang siap ≥ 24 jam, backup baru, persetujuan terpisah atas **langkah dan dampaknya**.
- **Pemulihan:** onboarding ulang adalah satu-satunya cara memulihkan keadaan bila terputus; **tidak dapat dibatalkan oleh TE One**.

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
| **A-2** | Jalankan M-11: subscribe **hanya** `smb_message_echoes` pada aplikasi TE One, uji S0–S9, lalu cabut | ☐ | ☐ | | |
| **A-2b** | Sertakan kontrol negatif S4 (kirim ke satu nomor tim di luar daftar uji; orangnya setuju) | ☐ | ☐ | nama pihak: | |
| **A-3** | M-12: pilih **satu** | ☐ H0 | ☐ H1 | ☐ H2 (dilarang sampai persetujuan terpisah tertulis) | |
| **D-18/D-12** | Retensi/penghapusan data uji & RPO/RTO (masih **Terbuka**) | ☐ diputuskan | ☐ ditunda | | |

## 11. Daftar cek verifikasi ke dokumentasi resmi Meta (operator/pemilik) dan usulan pembangun

Pembangun **tidak dapat membuka** `developers.facebook.com`. Sebelum A-2/A-3 disetujui, jawab dari halaman resmi **terbaru** (catat URL dan tanggal halaman):
- **V-1** Nama persis dan fungsi `smb_message_echoes`, `history`, `smb_app_state_sync`; mana yang wajib.
- **V-2** Jendela sinkronisasi riwayat/kontak setelah onboarding (apakah 24 jam, sekali saja); apa yang terjadi bila terlewat; apakah riwayat dapat diminta ulang tanpa onboarding ulang.
- **V-3** Cakupan echo: semua pesan dari Business App ke **siapa pun**, atau terbatas?
- **V-4** Apakah `history` harus di-subscribe **sebelum** onboarding agar riwayat dikirim; bentuk payload (`threads`, `messages`, `metadata.phase/chunk_order/progress`, `errors`).
- **V-5** Apakah mengaktifkan/mencabut subscription field memengaruhi registrasi, tautan Business App, atau status coexistence.
- **V-6** Nama field status nomor (`is_on_biz_app`, `platform_type`) dan artinya.
- **V-7** Bentuk payload `smb_message_echoes` (kunci array pesan, field penerima).

**Usulan pembangun (BELUM dikerjakan; butuh persetujuan lingkup, idealnya masuk **sebelum** Fase 1 agar image yang dibangun sudah memuatnya):**
- **R-1 (S-05)** *Perekam bentuk payload*: untuk event `unknown`/dikarantina-karena-bentuk, simpan **hanya struktur kunci** (nama kunci dan tipe, **tanpa nilai**, tanpa nomor/teks) di log aman/tabel kecil. Tujuannya agar uji pertama yang gagal-aman tetap menghasilkan data untuk memperbaiki normalizer tanpa menyimpan data pribadi. Ukuran kecil; dapat diuji dengan fixture.
- **R-2** Tetapkan `name: teone-staging` di `deploy/docker-compose.staging.yml` **setelah** nama proyek lama diketahui (0.4) dan **dengan mempertahankan nama volume yang ada** (`external`/`name:` eksplisit), agar jebakan volume §2.1-6 tidak berulang.
- **R-3** Koreksi pesan `meta:check` agar tidak terbaca sebagai "aktifkan keempat field": ubah menjadi "field yang dikenali; aktifkan **satu per satu** sesuai prosedur".

## 12. Batas dokumen ini
- **Belum pernah dijalankan.** Perintah belum diuji terhadap server staging; operator menyesuaikan nama jalur/proyek. Pembangun tidak punya Docker daemon, server, akun Meta, atau ponsel.
- Seluruh pernyataan tentang perilaku Meta adalah **[META-SEK]** sampai dicocokkan (V-1…V-7). Pernyataan tentang kode adalah **terbukti simulasi** (tes/CI), bukan terbukti nyata.
- Dokumen ini **bukan** keputusan, **bukan** persetujuan, dan **tidak** menyatakan Gate 1/2 diterima. Tidak ada tag yang dibuat.
