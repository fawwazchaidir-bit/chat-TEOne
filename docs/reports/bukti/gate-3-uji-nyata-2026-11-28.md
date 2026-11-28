# Bukti uji nyata Gate 3 (S1–S8) — staging, nomor …186319

> **Status: SEDANG DIJALANKAN — belum lengkap.** Rujukan: `docs/tahap-3/rencana-uji-nyata-gate-3.md`.
> Aturan bukti: hanya teks/angka. **Tanpa** isi chat, nama, nomor lengkap (maks. 4–6 digit terakhir), token, cookie, ID sesi, atau screenshot berisi data pelanggan. Pelaksana mengisi hasil; penilaian lulus/gagal Gate dilakukan **auditor di sesi terpisah** (AGENTS §2.6).

## 0. Identitas uji
| Item | Nilai |
|---|---|
| Tanggal & jam mulai/selesai (WIB) | |
| Pelaksana (peran, bukan nama lengkap) | |
| Revisi image berjalan (`org.opencontainers.image.revision`) | |
| `git rev-parse HEAD` di host | |
| `GET /api/health` | |
| Nomor bisnis yang dipakai | …186319 (Kemitraan) |
| Penerima uji A / "pelanggan B" | …4062 / …722419 (HP pribadi staf, bukan nomor bisnis) |
| Konfirmasi: Admisi …196319 & Hotline …246319 **tidak disentuh** | |
| Konfirmasi: aplikasi/webhook Meta Halo AI **tidak disentuh** | |

## 1. Prasyarat P1–P8
| # | Hasil (ok / tidak + catatan) |
|---|---|
| P1 Gate 2 LANJUT TERBATAS + tag | ok (26 Nov) |
| P2 flag `inbox`=on, `ai_simulation`=off, `whatsapp_connector`=on | **ok** — `inbox` dinyalakan Super Admin 28 Nov (audit `feature_flag.changed` +1); `ai_simulation` tanpa override = mati |
| P3 `test_mode` = true | **ok** (`bool_and(test_mode)=true`) |
| P4 penerima uji: …4062 + pelanggan B; tanpa …196319/…246319 | **ok** — `penerima_uji_aktif=2` (…4062 + pelanggan B …722419) |
| P5 channel "Uji B" tanpa koneksi Meta | **ok** — `Uji B koneksi=false operasional=false`; `Kemitraan Uji koneksi=true operasional=false` |
| P6 pengguna uji | **ok dengan deviasi** — lihat 1a |
| P7 backup `backup-rotate.sh` kode 0, `offsite=ok` | **ok** — kode keluar 0 (dilaporkan pelaksana, 28 Nov; kode 0 mensyaratkan offsite sukses) |
| P8 ponsel …186319 satu operator, tanpa chat pelanggan | **ok** (dikonfirmasi pemilik) |

### 1a. Peta pengguna, tim, dan izin (ID dipotong 8 karakter)
| Akun | Super Admin | 2FA | Tim | Peran | `chat.view` |
|---|---|---|---|---|---|
| `3c4cf057` (Super Admin) | ya | ya | Kemitraan, Admisi | – | (Super Admin) |
| `2770cb9c` (Admin Kemitraan) | tidak | **tidak** | Kemitraan | Admin Kemitraan | Kemitraan Uji |
| `25dcd908` (Admin Admisi) | tidak | **tidak** | Admisi | Admin Admisi | Uji B |

Tim: `Kemitraan → Kemitraan Uji`, `Admisi → Uji B`. Seluruh 7 izin peran (`channel.view, chat.view, chat.reply, chat.note, ai.toggle, chat.transfer, chat.assign`) bercakupan **satu channel**; tidak ada `scope_all`.

**Deviasi P6:** 2FA dua admin uji tidak diaktifkan. Aturan produk (AGENTS §9; `docs/keamanan-dan-izin.md` §2) mewajibkan 2FA hanya untuk Super Admin; admin biasa opsional. Tidak memengaruhi skenario izin channel. Penilaian keberterimaan deviasi = auditor.
**Catatan pelaksanaan:** Admin Kemitraan dan Admin Admisi dioperasikan satu penguji dengan dua akun terpisah di browser terpisah. Selama penyiapan ditemukan & diperbaiki sebelum uji: pemetaan tim–channel sempat tertukar; peran bawaan "Admin Admisi" tanpa cakupan channel (cakupan "fungsi" tidak cocok dengan channel uji); peran "Admin Kemitraan" sempat bercakupan SEMUA.

## 2. Kueri bukti — SEBELUM

### 2a. Baseline awal (sebelum prasyarat dilengkapi) — 2026-11-28 02:03 UTC
Image berjalan `teone-app:staging-1d63982` / `teone-tools:staging-1d63982`, label revision `1d63982a…` = checkout build `~/teone-build-1d63982` (commit `1d63982`, = `main`). `GET https://staging-chat.trilogikaedutama.id/api/health` → `{"status":"ok"}`. Catatan: `~/chat-TEOne` di host adalah clone lama (`9c297d3`), **bukan** sumber deploy.
```
jam|2026-11-28 02:03:00.999552+00
flag whatsapp_connector|true
test_mode|true
penerima_uji_aktif|1
percakapan|1
pesan keluar te_one|4
pesan keluar whatsapp_business_app|1
pesan masuk pelanggan|5
pesan_keluar_status diterima|3
pesan_keluar_status gagal|2
unread_eligible|5
akses_alih|0
ai_event|1
automation_jobs|0
inbound echo processed -|1
inbound echo quarantined pengirim_di_luar_daftar_uji|1
inbound message processed -|5
inbound message quarantined channel_tidak_dikenal|1
inbound message quarantined pengirim_di_luar_daftar_uji|2
inbound status processed -|8
audit auth.login success|1
audit auth.totp_verified success|1
```
Pembacaan: flag `inbox` **tanpa override = mati** (fail-closed) → P2 belum terpenuhi; `ai_simulation` tanpa override = mati (sesuai). `penerima_uji_aktif=1` → pelanggan B belum terdaftar (P4 belum lengkap). Tidak ada kill switch menyala.

### 2b. Baseline final (setelah prasyarat lengkap, tepat sebelum S1) — 2026-11-28 07:53 UTC
```
jam|2026-11-28 07:53:03.993756+00
flag inbox|true
flag whatsapp_connector|true
test_mode|true
penerima_uji_aktif|2
percakapan|1
pesan keluar te_one|4
pesan keluar whatsapp_business_app|1
pesan masuk pelanggan|5
pesan_keluar_status diterima|3
pesan_keluar_status gagal|2
unread_eligible|5
akses_alih|0
ai_event|1
automation_jobs|0
inbound echo processed -|1
inbound echo quarantined pengirim_di_luar_daftar_uji|1
inbound message processed -|5
inbound message quarantined channel_tidak_dikenal|1
inbound message quarantined pengirim_di_luar_daftar_uji|2
inbound status processed -|8
audit auth.login success|2
audit auth.totp_verified success|2
audit integration.recipient_added success|1
audit role.grants_changed success|4
audit team.channels_changed success|2
audit team.members_changed success|2
audit user.roles_changed success|1
```
Catatan: `percakapan=1` adalah percakapan …4062 dari uji Tahap 2; pesan S1 akan masuk ke percakapan yang sama (satu per pasangan kontak–channel, kontrak §6.2). Audit dibatasi jendela 3 jam.

## 3. Hasil skenario
| ID | CCP | Hasil (LULUS / GAGAL / BELUM DAPAT DIUJI) | Pengamatan (angka/teks, tersamar) | Jam (WIB) |
|---|---|---|---|---|
| S1 | 3.1 | **LULUS** (pengamatan pelaksana; penilaian akhir = auditor) | Pesan uji dari …4062 → …186319: `provider_ts` 08:43:05 UTC, diterima +4 dtk, diproses +57 ms (attempts=1); `pesan_masuk_sejak_baseline=1`, `unread_eligible` 5→6. **Admin Kemitraan:** percakapan …4062 teratas di inbox, tampil di Semua & filter channel Kemitraan Uji, belum dibaca **1**. **Admin Admisi:** tidak tampil di daftar, pencarian "4062", maupun jumlah; `GET /api/v1/conversations/{id}` → `{"error":{"code":"NOT_FOUND","message":"Percakapan tidak ditemukan."}}` (404, keberadaan tidak dibocorkan). Catatan: jam kirim awal 14.58 yang dilaporkan keliru (belum dikirim); uji "URL langsung" diganti uji API karena inbox tidak punya URL per percakapan. | 15.43 |
| S2 | 3.5 | **LULUS** (pengamatan pelaksana; penilaian akhir = auditor) | Admin Kemitraan mengetik balasan uji lalu klik ganda cepat tombol Kirim. HP …4062: **1** pesan. TE One: **1** pesan keluar. Kueri: `keluar_sejak_baseline te_one status=diterima idem=true = 1` (satu baris, berkunci idempotensi); status event dari webhook: `sent=1`, `delivered=1`; `inbound_status_sejak_baseline processed=2`. Status berhenti di **Diterima** karena tanda dibaca (read receipts) di HP penguji dimatikan, sehingga Meta tidak mengirim `read` — sesuai kriteria "Diterima/Dibaca". Jam klik tidak dicatat (antara 08:43 dan 08:49 UTC). | ±15.45 |
| S3 | 3.2 + D-22 | **LULUS** (pengamatan pelaksana; penilaian akhir = auditor) | **Urutan diubah:** pesan pelanggan B (S4) dikirim dulu agar channel Kemitraan Uji berisi 2 percakapan, sehingga dapat dibuktikan bahwa pengalihan tidak meluas. Sebelum pengalihan: Admin Kemitraan melihat 2 percakapan (…4062, …2419); Admin Admisi kosong. Admin Kemitraan mengalihkan …4062 ke Tim Admisi + tanda Lead nyasar + catatan. Sesudah: Admin Admisi melihat **…4062 saja** (dengan penanda Lead nyasar); …2419 tidak tampil di daftar maupun pencarian "2419". Kueri: `percakapan_per_channel Kemitraan Uji=2`, `akses_alih_aktif tim=Admisi=1`, `lead_nyasar=1`, audit `conversation.transferred success=1`. | ±15.55 |
| S4 | 3.1 lintas channel | **LULUS** (pengamatan pelaksana; penilaian akhir = auditor) | Pelanggan B (…722419) mengirim pesan uji 15.54 WIB → masuk channel Kemitraan Uji (`pesan_masuk_sejak_baseline=2`, `percakapan_total=2`). Admin Admisi tidak melihat percakapan B sebelum maupun sesudah pengalihan …4062; panel riwayat kontak pada percakapan …4062 (yang dialihkan) tidak menampilkan data channel lain. | 15.54 |
| S5 | 3.7 + D-05 | **LULUS** (pengamatan pelaksana; penilaian akhir = auditor) | **Pra-langkah:** AI percakapan …4062 sudah Off sejak 26 Nov (echo M-11), maka AI dinyalakan dulu oleh Admin Kemitraan agar efek echo dapat diamati (aman: `ai_simulation` mati ⇒ job otomatisasi dibatalkan, `automation_jobs=0`). `smb_message_echoes` di aplikasi Meta **TE-One** di-subscribe 16.24, echo dikirim dari WhatsApp Business App ponsel …186319 ke …4062 pukul 16.26, field di-unsubscribe 16.27. UI: pesan tampil bersumber **WhatsApp Business App**; AI **Off**; unread tidak bertambah. Kueri `conversation_ai_events`: v2 `off→aktif` oleh Admin Kemitraan 09:03:18 UTC → v3 `aktif→off` alasan `balasan_dari_hp` oleh `sistem:echo (HP)` 09:26:12 UTC (berversi, teraudit). `pesan_keluar_sejak_baseline whatsapp_business_app=1`, `inbound echo processed=1` (tanpa karantina), `unread_eligible=7` (= 6 + 1 pesan pelanggan B; echo tidak menambah), `automation_jobs=0`. | 16.26 |
| S6 | 3.6 (bagian nyata) | **LULUS** (pengamatan pelaksana; penilaian akhir = auditor) | Super Admin menyalakan kill switch **channel** Kemitraan Uji (09:30:45 UTC) lalu **global** (09:31:14 UTC). Spanduk merah tampil di inbox Admin Kemitraan ±**5 dtk** tanpa refresh (< 60 dtk). Setelah ≥10 menit keduanya **masih menyala**; total menyala ±92 menit tanpa lepas sendiri. Balasan manual saat kill switch menyala **tetap terkirim** dan sampai di HP …4062 (sesuai rancangan: kill switch menghentikan otomatisasi, bukan balasan manual). Dilepas **manual** oleh Super Admin (`3c4cf057`): global 11:03:03, channel 11:03:07 UTC; audit `kill_switch.released success` ×2. `keluar_te_one_sejak_baseline status=diterima=2`, `automation_jobs=0`. Catatan: entri audit saat menyala (sebelum 10:00 UTC) tidak tercakup filter kueri ini — lihat kueri SESUDAH. Bagian "kill switch menghentikan kirim otomatis" tetap **terbukti simulasi** (E2E G8). | 17.30–18.03 |
| S7 | G2 nyata | **LULUS dengan catatan** (pengamatan pelaksana; penilaian akhir = auditor) | Meta App Dashboard aplikasi **TE-One** → Webhook fields → `messages` → **Test** → "Send to My Server", **3×** (±18.06–18.11 WIB); Meta menampilkan **berhasil** (= endpoint membalas 2xx; penolakan 401/404 akan tampil sebagai gagal). Payload contoh Meta memakai **ID pesan tetap** `ABGGFlA5Fpa` dan `phone_number_id` fiktif `123456123`. Di DB sudah ada satu baris `event_key=msg:ABGGFlA5Fpa`, `phone_number_id=123456123`, `quarantined channel_tidak_dikenal`, diterima **2026-11-25 11:27 UTC** (Test sebelumnya). Hasil 3× kirim hari ini: **0** baris baru (`UNIQUE(provider,event_key)` + `onConflictDoNothing` ⇒ dihitung duplikat, tetap 200), `karantina_channel_tidak_dikenal_total` tetap 1, `pesan_total` tetap 15, `percakapan_total` tetap 2 ⇒ **event channel tak dikenal dikarantina, kirim ulang ID yang sama tidak menggandakan apa pun — terbukti nyata.** **Catatan:** (a) jalur "duplikat" disimpulkan dari hasil (respons `{"duplicates":1}` tidak teramati karena tidak ada log, lihat G3-T01); (b) kirim ulang event **pesan …4062 asli** tidak dapat dipicu nyata → bagian itu tetap **terbukti simulasi** (E2E G2). | 18.06–18.11 |
| S8 | 3.4 (bagian nyata) | **LULUS** (pengamatan pelaksana; penilaian akhir = auditor) | Admin Kemitraan di panel AI percakapan …4062: **Aktifkan** 18.15 WIB → UI "AI Aktif", keterangan jujur "AI disiapkan — agent belum terhubung"; ditunggu ±3 menit, **tidak ada** pesan AI di HP …4062; **Matikan** 18.18 WIB. Kueri: v4 `off→aktif` dengan **batas aktivasi** `11:14:57.762 UTC` (dicatat saat aktivasi), v5 `aktif→off` alasan `manual` 11:18:09 UTC — berversi berurutan (v1–v5 tanpa celah); audit `conversation.ai_changed success=2`; `pesan_total` tetap 15; `automation_jobs=0`. Pengiriman AI otomatis + pemeriksaan ulang sebelum kirim tetap **terbukti simulasi** (Tahap 3) / AI nyata = Tahap 4. | 18.15–18.18 |

## 4. Kueri bukti — SESUDAH
```
(tempel keluaran q3.sql di sini)
```

## 5. Kondisi akhir (rencana §4)
| Item | Nilai |
|---|---|
| `smb_message_echoes` dimatikan lagi | |
| Kill switch channel & global dilepas manual (tercatat audit) | |
| `ai_simulation` tetap mati | |
| Kondisi berhenti terpicu? (§3) | |

## 5a. Temuan selama uji
| ID | Prioritas | Temuan | Dampak | Bukti | Tindakan usulan | Status |
|---|---|---|---|---|---|---|
| G3-T01 | **Sedang** | Penolakan webhook (401 tanda tangan, 404 flag mati, 413, 400) dan request yang tidak sampai **tidak teramati**: tidak ada log akses HTTPS di Caddy dan endpoint tidak mencatat penolakan | Bila webhook asli ditolak (mis. App Secret berubah), pesan pelanggan hilang tanpa sinyal ke tim | S7: Test Meta "berhasil" ×3, 0 event baru; penyebab (duplikat) hanya dapat disimpulkan lewat pencocokan ID manual karena log Caddy hanya memuat 308 dan endpoint tidak mencatat hasil | Catat satu baris per penolakan (kode + alasan, **tanpa** payload/tanda tangan) dan/atau aktifkan log akses Caddy untuk `/api/webhooks/*` tanpa body; ulangi S7 | Terbuka (sesi pembangun) |
| G3-T02 | Rendah | Peran bawaan "Admin Admisi/Kemitraan" bercakupan *fungsi channel*; bila channel tidak berlabel fungsi yang cocok, peran tanpa cakupan sama sekali — terdeteksi hanya lewat kueri | Admin baru tampak "tidak bisa melihat apa-apa" tanpa penjelasan | Penyiapan P6 (`lihat_chat=-`) | Tampilkan peringatan di halaman Peran/Pengguna bila peran tidak memiliki cakupan channel efektif | Terbuka |

## 6. Batas jujur
- CCP 3.3, 3.4, 3.6 tetap **terbukti simulasi**; S6/S8 hanya membuktikan bagian yang dapat diamati tanpa kirim otomatis.
- Semua hasil di §3 adalah **pengamatan pelaksana** (UI + kueri baca-saja). Pengamatan UI tidak disertai tangkapan layar (aturan bukti: tanpa data chat). Penilaian akhir Gate 3 = **auditor di sesi terpisah**.
- Deviasi dari rencana: P6 tanpa 2FA admin uji; urutan S3/S4 ditukar; uji "URL langsung" S1 diganti uji API; S5 didahului mengaktifkan AI.
- Data uji: hanya nomor penerima uji (…4062, …722419) dan teks sintetis; tidak ada data pelanggan asli.
