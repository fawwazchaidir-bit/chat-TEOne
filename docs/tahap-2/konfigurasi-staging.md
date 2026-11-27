# Panduan konfigurasi staging — konektor WhatsApp (Tahap 2)

> Status: **Dibuat, BELUM DIVERIFIKASI di server.** Server staging (Jalur 0 J0-03), aplikasi Meta milik TE One, dan nomor uji **belum tersedia** pada pembangunan Tahap 2.
> Langkah di dashboard Meta di bawah ditulis dari pengetahuan umum dan **wajib dicocokkan dengan dokumentasi Meta terbaru** oleh orang yang memiliki akses.
> **Jangan** memakai aplikasi Meta, token, webhook, atau nomor milik Halo AI. **Jangan** menyentuh nomor Admisi (…196319; dulu ditulis "…1119") dan Hotline (…246319; dulu ditulis "…0124").

## 1. Prasyarat (harus dari pemilik proyek / Jalur 0)
| # | Prasyarat | Siapa | Status |
|---|---|---|---|
| 1 | Server staging tersendiri dengan HTTPS publik (J0-03) — lihat `docs/staging.md` | Pemilik/Operasi | **Belum ada** |
| 2 | Aplikasi Meta **milik TE One** (di Meta Business milik TE One) | Pemilik | **Belum terbukti ada** |
| 3 | Jalur akses (D-02): **Diputuskan 26 Nov 2026** — aplikasi Meta milik sendiri "Trilogika Edutama TE-One" (dinyatakan pemilik: terkoneksi dan berhasil). Status Tech Provider/Embedded Signup untuk perpindahan Admisi tetap diverifikasi ke dokumentasi Meta sebelum Tahap 8 | Pemilik | **Diputuskan** |
| 4 | Nomor uji (D-03): **Diputuskan 26 Nov 2026** — …6319 (channel Kemitraan Uji), satu-satunya nomor siap; pengirim di luar daftar uji tetap dikarantina + payload dibuang | Pemilik | **Diputuskan** (kesiapan nomor: dinyatakan pemilik) |
| 5 | Token akses **system user** (bukan token pribadi) dengan izin pesan WhatsApp untuk WABA uji | Pemilik | Belum ada |
| 6 | Daftar peserta uji (nomor yang boleh menerima/mengirim saat uji) | Pemilik | Belum ada |

## 2. Variabel lingkungan (tanpa nilai rahasia)
Isi di `/etc/teone/staging.env` (root, `chmod 600`, di luar repository). Nama sama dengan `.env.example`.

| Variabel | Wajib? | Fungsi | Catatan |
|---|---|---|---|
| `APP_ENV` | ya | `staging` untuk uji | memunculkan pita "STAGING", cookie `__Host-` |
| `APP_BASE_URL` | ya | origin publik `https://…` | callback webhook = `APP_BASE_URL/api/webhooks/whatsapp` |
| `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `APP_ENCRYPTION_KEY`, `TRUST_PROXY` | ya | seperti Tahap 1 | — |
| `META_APP_SECRET` | ya (untuk webhook) | validasi `X-Hub-Signature-256` | kosong ⇒ webhook membalas **503** |
| `META_VERIFY_TOKEN` | ya | verifikasi langganan webhook oleh Meta | string acak ≥ 8 karakter; ditentukan TE One, dimasukkan juga di dashboard Meta |
| `META_APP_ID` | tidak (sangat disarankan) | ID aplikasi Meta milik TE One (bukan rahasia) | tanpa ini langganan webhook tidak dapat **dikonfirmasi** sebagai aplikasi yang benar → kanal tidak pernah "siap menerima" (G2-A05) |
| `META_ACCESS_TOKEN` | ya (kirim/unduh/pemeriksaan) | token system user | kosong ⇒ pengiriman & pemeriksaan gagal dengan "konfigurasi belum lengkap" |
| `META_GRAPH_API_VERSION` | tidak | default `v23.0` | **ASUMSI — belum diverifikasi**; ubah bila Meta mensyaratkan lain |
| `META_GRAPH_BASE_URL` | tidak | default `https://graph.facebook.com` | selain Meta **hanya** untuk mock lokal/uji; di production ditolak |
| `META_HTTP_TIMEOUT_MS` | tidak | default 10000 | timeout ⇒ pesan `belum_pasti` |
| `MEDIA_DIR` | tidak | default `.data/media` | folder privat, di luar webroot, **harus di volume persisten** + dibackup (T2-F11) |
| `WORKER_INLINE` | tidak | default `true` | `true` = webhook memicu **pemrosesan event** di proses web (berbasis kejadian, tanpa timer). **Pemeliharaan berkala — retensi payload, penyapu `diproses` tertahan, rekonsiliasi `belum_pasti`, ulang media, fallback outbox, job otomatisasi — HANYA berjalan di worker terpisah**; tanpa worker semuanya mati (S-10, `pemeliharaan-inline-vs-worker.md`). Worker terpisah aman berdampingan |

Rahasia **tidak** disimpan di database dan tidak pernah dicatat/ditampilkan. Rotasi token/secret: ganti nilai di file env lalu buat ulang `app` (dan `worker` bila dijalankan).

## 3. Menyalakan konektor
1. `npm run db:migrate` (migrasi `0002` menambah 10 tabel; maju-saja).
2. Login Super Admin → **Pengaturan → Feature flag** → nyalakan `whatsapp_connector`. (Default **mati**; saat mati webhook membalas 404 dan UI menampilkan "Belum tersedia".)
3. Beri pengguna penguji peran/izin: `channel.view`, `channel.manage` (cakupan: channel uji) dan `integration.test` (cakupan: channel uji).
4. **Channel → (pilih channel uji, mis. Kemitraan) → Koneksi WhatsApp**: isi **WABA ID** dan **phone_number_id** dari dashboard Meta → Simpan. Mode uji biarkan **aktif**.
5. **Alat uji integrasi** (`/integrasi`) → tambahkan **penerima uji** (nomor peserta uji).
6. Jalankan worker (disarankan terpisah): `docker compose -f deploy/docker-compose.staging.yml up -d worker` (lihat §5) atau `npm run worker`.

## 4. Mendaftarkan webhook di dashboard Meta (oleh pemegang akses; verifikasi ke dokumentasi Meta terbaru)
- **Callback URL:** `https://<domain-staging>/api/webhooks/whatsapp`
- **Verify token:** nilai `META_VERIFY_TOKEN`.
- **App Secret** (Settings → Basic) = nilai `META_APP_SECRET`.
- **Field yang di-subscribe:** `messages`; untuk coexistence: `smb_message_echoes`, `history`, `smb_app_state_sync` (**nama field coexistence BELUM TERVERIFIKASI** — lihat `coexistence.md`).
- Pastikan aplikasi **berlangganan ke WABA uji** (`subscribed_apps`); `npm run meta:check` memeriksanya.
- Pastikan webhook **tidak** diarahkan ke endpoint Halo AI dan sebaliknya.

## 5. Proses worker (staging/production)
`scripts/worker.ts` memproses antrean, rekonsiliasi pesan `belum_pasti`, ulang unduhan media, dan membersihkan payload mentah yang melewati retensi. Aman dijalankan bersama proses web (`SKIP LOCKED` + lease).
Tambahkan ke `deploy/docker-compose.staging.yml` service `worker` (image `tools`, perintah `npm run worker`, env sama dengan `app`) — **dibuat, belum diuji di server**.

## 6. Diagnostik sebelum uji nyata
```bash
npm run meta:check
```
Memeriksa: variabel terisi, `APP_BASE_URL` https, tiap koneksi channel (token valid? `phone_number_id` milik WABA? aplikasi berlangganan WABA?), dan mencetak URL callback serta field yang perlu di-subscribe.
Hasil berlabel **META ASLI** hanya bila `META_GRAPH_BASE_URL` = `graph.facebook.com`; selain itu **SIMULASI**. Keluaran tidak memuat rahasia. Kode keluar ≠ 0 bila ada masalah.
`meta:check` **belum membuktikan penerimaan pesan nyata** — itu dibuktikan oleh panduan uji (`panduan-uji-nomor-uji.md`).

## 7. Daftar verifikasi yang harus diisi di server (tertunda)
- [ ] Webhook terverifikasi oleh dashboard Meta (challenge berhasil)
- [ ] Panel koneksi (`/channel`) menunjukkan **tiga bukti terpisah**: pemetaan nomor terverifikasi **NYATA** · langganan aplikasi **terkonfirmasi** (isi `META_APP_ID`) · event terakhir diterima; baru kemudian "Siap menerima pesan" (G2-A05)
- [ ] Pesan teks dari nomor uji masuk dan tampil di `/integrasi`
- [ ] Kirim teks/gambar/PDF ke nomor uji berhasil; status sent/delivered/read tercatat
- [ ] `npm run meta:check` bersih dengan **META ASLI**
- [ ] Worker berjalan sebagai service; restart kontainer tidak menghilangkan event
- [ ] Volume `MEDIA_DIR` persisten dan dibackup
- [ ] Hanya penerima uji yang dapat dikirimi; pengirim di luar daftar uji dikarantina dan terhitung di alat uji
