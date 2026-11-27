# Runbook uji history M-12 (Opsi H3) — nomor uji BERSIH di-onboard baru + Step 1/2 dari TE One dalam 24 jam

> **DISIAPKAN, BELUM DIJALANKAN, BELUM DISETUJUI.** Dasar: arah yang dipilih pemilik pada 26 Nov 2026 ("opsi (a): nomor uji bersih + Step 1/2"; lihat [`prosedur-uji-m11-m12.md`](prosedur-uji-m11-m12.md) §7 Opsi H3). Itu **arah**, bukan izin menjalankan: pelaksanaan menunggu **persetujuan tertulis terpisah** (template **kosong** di Lampiran A) dan **semua** prasyarat di §1 berstatus YA. Pelaku = **operator** + **Super Admin (2FA)**. Pembangun **tidak punya akses** ke server, akun Meta, atau ponsel dan **tidak mengisi** lembar mana pun; semua kolom hasil **sengaja kosong**.
> **Aturan keras:** sinkronisasi hanya **sekali** per langkah dan hanya **24 jam** setelah onboarding (resmi Meta; [`coexistence.md`](coexistence.md) §7). Salah langkah = offboarding + onboarding ulang = **keputusan terpisah**. **Dilarang** menyentuh …186319 (berisi chat pelanggan nyata), Admisi (…196319; dulu ditulis "…1119"), Hotline (…246319; dulu ditulis "…0124"), dan Halo AI. Tanpa tangkapan layar di repository, tanpa isi chat, tanpa nomor lengkap, tanpa token/rahasia; 4 digit akhir hanya untuk nomor penguji dan nomor uji bersih. Mengulang/memaksa langkah yang ditolak TE One (mis. mengubah jam onboarding agar jendela tampak terbuka) **dilarang**.
> **Status bukti:** hasil runbook ini baru boleh disebut **"terbukti nyata"** bila bukti (teks) dilampirkan dan **diaudit independen**; pembangun tidak menyatakannya.
> Perintah memakai gaya operator ([`runbook-uji-m11.md`](runbook-uji-m11.md): proyek Compose **`deploy`**, kontainer `deploy-app-1`, `deploy-db-1`, `deploy-worker-1` bila worker dinyalakan). `<DB>` = nama database. Perintah yang belum pernah dijalankan pembangun di server Anda diberi tanda **[BELUM DIUJI di server]**.

## 0. Ringkasan skenario dan apa yang dapat/ tidak dapat dibuktikan
| Tahap | Isi | Perkiraan waktu |
|---|---|---|
| **A** (H-7…H-1) | Persiapan: ponsel bersih + chat sintetis, backup + restore terisolasi, subscribe tiga field, channel TE One, persetujuan tertulis | beberapa hari |
| **B** (T0) | Onboarding coexistence nomor bersih; setujui berbagi riwayat; **catat jam selesai** | 30–60 menit |
| **C** (T0 → T0+1 j) | Petakan channel + **Periksa koneksi** (NYATA) + **nyatakan jam onboarding** + nyalakan flag `history_sync` | 15–30 menit |
| **D** (≤ T0+3 j) | **Step 1** (kontak) → pantau webhook `smb_app_state_sync` | menit–jam |
| **E** (≤ T0+12 j; TE One menolak bila sisa < 30 menit) | **Step 2** (riwayat) → pantau webhook `history` sampai progres 100 | menit–jam |
| **F** | Penutupan: flag dimatikan, hitungan, lembar hasil | 30 menit |

**Yang diharapkan secara dokumentasi resmi** (dibaca 26 Nov 2026; [`coexistence.md`](coexistence.md) §7): Step 1 → rangkaian webhook `smb_app_state_sync`; Step 2 → "nol, satu, atau banyak" webhook `history` (fase 0/1/2, `chunk_order`, `progress` 0–100), atau satu webhook berkode **2593109** bila bisnis menolak berbagi; riwayat ≤ 180 hari; grup **tidak** termasuk; media = `media_placeholder` (ID aset hanya ≤ 14 hari dan **tidak diproses** TE One).
**Batas yang harus dipahami sejak awal (jujur):**
- Ponsel **bersih** hampir pasti **tidak** punya chat > 90 hari ⇒ **fase 2 kemungkinan tidak teramati**. Itu **bukan kegagalan**; catat "fase 2 tidak teramati" (CCP 2.9 fase 2 tetap simulasi). Fase 1 hanya teramati bila ada chat sintetis yang **berumur ≥ 1 hari** saat onboarding (§1 P5).
- Pilihan **setujui** vs **tolak** berbagi riwayat dibuat **sekali** saat onboarding. Runbook ini memilih **setujui** (agar data teramati); cabang **tolak (2593109)** tetap berstatus simulasi.
- **Perekam bentuk payload (R-1/S-05) belum ada.** Bila bentuk webhook nyata meleset dari normalizer, event menjadi karantina `bentuk_tidak_dikenal:*` dan **hanya alasan** yang tersimpan (payload karantina dibuang) — padahal kesempatan hanya **sekali**. **Rekomendasi kuat (bukan syarat):** PR kecil perekam struktur kunci tanpa nilai **sebelum** hari-H. Tanpa itu, hasil "GAGAL-AMAN" tidak memberi data untuk memperbaiki normalizer.
- Tidak membuktikan: M-11 (echo; izin M-11 terpisah dan khusus …6319), media riwayat, grup, jendela layanan nyata, throughput.

## 1. Gerbang GO/NO-GO (isi YA/TIDAK + jam WIB + bukti teks; **satu "TIDAK" = NO-GO**)
| # | Prasyarat | Cara memeriksa (baca-saja) | Bukti teks | Status |
|---|---|---|---|---|
| **P1** | **PR S-12 sudah diaudit independen dan di-merge**; image staging dibangun dari commit hasil merge (label revisi = commit); migrasi **0006** terapan; **worker berjalan** (webhook history dapat memuat ribuan pesan; mode inline berisiko) | `docker ps` + label image; SQL §2.1 (`migrasi` = 7); `docker exec deploy-app-1 printenv WORKER_INLINE`; antrean §2.2 | commit, ID image, jumlah migrasi, status worker | |
| **P2** | **Persetujuan tertulis terpisah pemilik** untuk H3 diterima (Lampiran A terisi **oleh pemilik**) | dokumen persetujuan di repository (pola `persetujuan-pemilik-m11-2026-11-26.md`) | nama berkas | |
| **P3** | **Nomor uji BERSIH**: bukan …186319/…196319/…246319; ponsel berisi **hanya** chat sintetis; tidak ada grup; tidak terhubung ke layanan lain; kelayakan onboarding coexistence dikonfirmasi (versi WhatsApp Business app, negara, jalur D-02) terhadap halaman resmi **saat ini** | operator memeriksa ponsel + halaman *Onboarding WhatsApp Business app users* | 4 digit akhir nomor bersih; versi app; ya/tidak | |
| **P4** | **Dokumentasi resmi dikonfirmasi ulang** oleh operator: (a) `POST …/<phone_number_id>/smb_app_data` dengan `sync_type` `smb_app_state_sync` lalu `history`; (b) **sekali** per langkah; (c) **24 jam** sejak onboarding; (d) field `history`, `smb_app_state_sync`, `smb_message_echoes` harus di-subscribe **sebelum** pemanggilan | baca halaman resmi; **V-9** (di mana jam onboarding terlihat di sisi Meta) dijawab bila bisa | ya/tidak per butir; jawaban V-9 | |
| **P5** | **Chat sintetis disiapkan**: ≥ 2 hari sebelum onboarding (agar teramati fase 1), 4–10 pesan teks bolak-balik dengan **penguji A** (nomor penguji, terdaftar di daftar penerima uji) + 1 gambar sintetis (menguji placeholder media); **opsional** kontrol negatif: 2–3 pesan dengan **penguji B** (orang tim yang **setuju**, nomor **tidak** didaftarkan) | operator | jumlah pesan per penguji (angka), umur pesan tertua (hari) | |
| **P6** | **Kondisi TE One benar**: `whatsapp_connector` aktif; `history_sync` **mati** (dinyalakan baru di Tahap C); `ai_simulation` mati; kill switch global/channel mati; **mode uji aktif**; penguji A terdaftar & aktif, **penguji B tidak terdaftar**; channel uji dibuat via UI: jenis **coexistence**, **bukan operasional**, environment staging | SQL §2.1 | keluaran kueri + `jam_server_utc` | |
| **P7** | **Backup terenkripsi DB + media**, salinan di luar VPS, dan **bukti uji restore terisolasi** — **dibuat baru** untuk runbook ini | `runbook-uji-m11.md` §3 atau, bila memakai skrip: `sudo env BACKUP_VIA_DOCKER=1 BACKUP_DB_CONTAINER=deploy-db-1 BACKUP_APP_CONTAINER=deploy-app-1 MEDIA_DIR=/data/media PGDATABASE=<DB> PGUSER=postgres BACKUP_PASSPHRASE_FILE=/etc/teone/backup.pass BACKUP_DIR=/var/backups/teone BACKUP_OFFSITE_OPTIONAL=1 bash scripts/backup.sh` **[BELUM DIUJI di server]**; salinan luar VPS + restore ke DB terpisah = langkah `runbook-uji-m11.md` §3.3–§3.4 | nama berkas, SHA-256, ukuran, versi migrasi (7), jam, durasi, jenis lokasi salinan, hasil restore | |
| **P8** | **Subscribe tiga field** pada aplikasi Meta **TE One** (bukan aplikasi Halo AI): `history`, `smb_app_state_sync`, `smb_message_echoes` — **sebelum onboarding** (webhook yang datang sebelum subscribe **hilang**); callback staging terverifikasi | App Dashboard > WhatsApp > Configuration; salin **daftar field aktif/tidak aktif sebagai teks** + jam | daftar field (teks) | |
| **P9** | **Dua orang siap selama 24 jam penuh** (rentang yang disepakati): Super Admin TE One (2FA, perangkat siap) + operator (akses dashboard Meta, DB baca-saja, ponsel) | konfirmasi | inisial (tanpa nama lengkap), jam mulai/selesai jendela kerja | |
| **P10** | **Rencana jam onboarding**: dimulai pagi WIB agar seluruh jendela jatuh pada jam kerja; checkpoint T0+3 j dan T0+12 j dipahami | rencana operator | jam rencana T0 | |

**Keputusan GO/NO-GO:** ☐ GO ☐ NO-GO — operator (inisial): ____ — Super Admin (inisial): ____ — jam (WIB): ____ *(tidak diisi pembangun)*

## 2. Paket kueri baca-saja (tanpa isi pesan, tanpa nomor non-penguji)
Jalankan dengan `sudo docker exec deploy-db-1 psql -U postgres -d <DB> -c "…"`. Bila diminta **kata sandi**, **berhenti**. Catat `jam_server_utc` pada tiap blok. `<ID>` = ID channel uji (`select id from channels where name = '<nama channel uji>'`).

### 2.1 Konfigurasi dan kondisi awal (P1, P6)
```sql
SELECT now() AS jam_server_utc;
SELECT count(*) AS migrasi FROM drizzle.__drizzle_migrations;                     -- harapan: 7 (0006 terapan)
SELECT key, enabled FROM feature_flag_overrides ORDER BY key;                      -- harapan sebelum Tahap C: history_sync tidak ada/f; ai_simulation f; whatsapp_connector t
SELECT scope_type, scope_ref, engaged FROM kill_switches ORDER BY 1,2;             -- harapan: tidak ada yang engaged=t; JANGAN diubah
SELECT c.name, c.integration_kind, c.is_operational, c.environment, cc.test_mode, cc.verification_status, cc.verification_mode,
       cc.mapping_version, cc.coexistence_onboarded_at, cc.coexistence_onboarded_source
FROM channels c LEFT JOIN channel_connections cc ON cc.channel_id = c.id ORDER BY c.name;   -- channel uji: coexistence, is_operational=f, test_mode=t
SELECT label, right(identity_value,4) AS akhir4, active FROM test_recipients ORDER BY created_at;  -- harapan: penguji A aktif; penguji B TIDAK ada
```
### 2.2 Antrean dan baseline data (catat `id_terbesar` dan `audit_id_terbesar` sebagai baseline)
```sql
SELECT kind, status, coalesce(quarantine_reason,'-') AS alasan, count(*) AS n,
       count(*) FILTER (WHERE payload IS NOT NULL) AS dengan_payload, max(id) AS id_terbesar
FROM inbound_events GROUP BY 1,2,3 ORDER BY 1,2,3;
SELECT (SELECT count(*) FROM automation_jobs) AS job, (SELECT count(*) FROM domain_outbox) AS outbox,
       (SELECT coalesce(max(id),0) FROM audit_log) AS audit_id_terbesar,
       (SELECT count(*) FROM contacts) AS kontak, (SELECT count(*) FROM conversations) AS percakapan, (SELECT count(*) FROM messages) AS pesan;
```
### 2.3 Status sinkronisasi (pantau selama Tahap D–E)
```sql
SELECT sync_type, status, attempts, requested_at, completed_at, http_status, meta_code, failure_kind, resolution,
       (meta_request_id IS NOT NULL) AS ada_request_id
FROM smb_sync_requests ORDER BY requested_at;                                      -- tanpa nilai request_id
SELECT history_progress FROM channel_connections WHERE channel_id = '<ID>';        -- phase/progress/declared/complete/phasesSeen
SELECT kind, status, coalesce(quarantine_reason,'-') AS alasan, count(*) AS n
FROM inbound_events WHERE id > <id_terbesar_baseline> GROUP BY 1,2,3 ORDER BY 1,2,3;
```
### 2.4 Data yang benar-benar masuk (tanpa `body`)
```sql
SELECT source, direction, type, raw_type, is_history, unread_eligible, count(*) AS n
FROM messages WHERE channel_id = '<ID>' GROUP BY 1,2,3,4,5,6 ORDER BY 1,2,3,4;     -- harapan: semua source=history, is_history=t, unread_eligible=f
SELECT count(*) AS kontak_total,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM conversations v WHERE v.contact_id = c.id)) AS kontak_tanpa_percakapan
FROM contacts c;
SELECT count(*) AS percakapan, count(*) FILTER (WHERE last_customer_message_at IS NOT NULL) AS jendela_layanan_terbuka
FROM conversations WHERE channel_id = '<ID>';                                       -- harapan: jendela_layanan_terbuka = 0 (history tidak membuka jendela)
SELECT (SELECT count(*) FROM automation_jobs) AS job, (SELECT count(*) FROM domain_outbox) AS outbox;   -- harapan: sama dengan baseline
SELECT action, result, count(*) FROM audit_log WHERE id > <audit_id_terbesar_baseline> GROUP BY 1,2 ORDER BY 1,2;   -- nama aksi saja
SELECT count(*) AS identitas_penguji_b FROM contact_identities WHERE right(identity_value,4) = '<akhir4 penguji B>';   -- harapan: 0 (kontrol negatif)
```

## 3. Lampiran persiapan teknis (Tahap A)
1. **Channel uji di TE One** (UI, Super Admin): Channel → buat channel jenis **coexistence**, **bukan operasional**; simpan **setelah** onboarding (WABA ID + `phone_number_id` baru diketahui setelah Tahap B). Penerima uji: Integrasi → penerima uji → daftarkan **hanya penguji A**.
2. **Subscribe tiga field** (P8) **sebelum** Tahap B; salin daftar field (teks).
3. **Backup + restore terisolasi** (P7), **setelah** semua perubahan konfigurasi Tahap A selesai.
4. **Pemeriksaan koneksi** dijalankan di Tahap C, bukan sebelum onboarding.
5. **Titik pulih:** simpan tag/ID image yang berjalan dan nomor versi migrasi; **tidak ada** perubahan image/konfigurasi server selama Tahap B–F (pengecualian: penyalaan/pematian flag lewat UI).

## 4. Pelaksanaan (catat jam WIB dan UTC tiap langkah; **Super Admin** memegang UI, **operator** memegang Meta/ponsel/DB)
| # | Langkah | Pelaku | Hasil / catat |
|---|---|---|---|
| **L0** | GO/NO-GO §1 = **GO**; baseline §2.1–§2.2 dijalankan dan dicatat (`id_terbesar`, `audit_id_terbesar`) | operator | |
| **L1** | **Onboarding** nomor bersih lewat Embedded Signup (jalur D-02); **setujui berbagi riwayat**. Catat **jam selesai onboarding (T0)** begitu layar konfirmasi muncul; catat juga jam menurut ponsel/server. **Jangan** memutus/menautkan hal lain | operator | T0 (WIB/UTC); ada PIN/pemutusan perangkat tertaut? (ya/tidak, tanpa nilai) |
| **L2** | TE One → Channel → panel **Koneksi WhatsApp**: simpan WABA ID + `phone_number_id` → **Periksa koneksi**. Harapan: *Pemetaan nomor terverifikasi — NYATA (Graph API Meta)*. Bila gagal → perbaiki pemetaan (bukan jam) dan ulangi; **jam berjalan** | Super Admin | status verifikasi; jam |
| **L3** | Panel **Sinkronisasi riwayat** → **Nyatakan jam onboarding** = T0 dari L1 (WIB). Tersimpan sebagai **"dinyatakan admin"** (bukan bukti Meta). Periksa **sisa jendela** | Super Admin | nilai T0 dimasukkan; sisa jendela tampil |
| **L4** | Nyalakan flag **`history_sync`** (halaman Kill switch & flag, Super Admin). **Hanya** setelah persetujuan P2 | Super Admin | jam; audit `feature_flag.changed` |
| **L5** | **Verifikasi prasyarat di panel**: a–j untuk Step 1 harus *Terpenuhi* (h = "Saat kirim"). Pastikan kill switch global dan channel **tidak** menyala. Bila ada yang *Belum* → selesaikan penyebabnya, **jangan** memaksa | Super Admin | daftar status a–j (teks) |
| **L6** | **Step 1 (kontak)**: **Jalankan Step 1…** → centang dua konfirmasi (**field sudah di-subscribe**; **hanya sekali**) → ketik nama channel → **Ya, kirim permintaan ke Meta** — **satu klik** | Super Admin | jam; status = *Permintaan diterima Meta* (hasil menyusul) **atau** *belum pasti/gagal* → **§5 (berhenti)** |
| **L7** | Pantau §2.3 hingga webhook `smb_app_state_sync` tiba dan **tidak bertambah selama ≥ 10 menit** (batas tunggu T0+3 j; bila tak ada webhook sama sekali → catat; lanjut hanya dengan persetujuan operator+Super Admin, karena Step 2 hanya sekali) | operator | hitungan event kontak (processed/quarantined); kontak tersimpan; percakapan = 0 |
| **L8** | **Step 2 (riwayat)** — **hanya** bila Step 1 berstatus *diterima Meta* dan sisa jendela ≥ 30 menit (TE One menolak sendiri): konfirmasi ganda sama seperti L6, **satu klik** | Super Admin | jam; status |
| **L9** | Pantau §2.3–§2.4 sampai `history_progress.progress` = 100 atau **tidak ada event baru ≥ 15 menit**; catat fase yang teramati (`phasesSeen`), `declined`, jumlah pesan, kontrol negatif (B), antrean | operator | angka |
| **L10** | **Penutupan:** matikan flag `history_sync`; jalankan §2.2 dan §2.4 final; isi §7. **Jangan** mencabut field webhook tanpa keputusan pemilik (default: **tetap** untuk nomor uji ini; keputusan pemilik di §7) | Super Admin + operator | |

## 5. Kondisi berhenti (→ **berhenti melakukan langkah Meta**; laporkan; **jangan** mengulang Step, **jangan** menghapus data, **jangan** restore ke DB staging)
| Kode | Kondisi | Tindakan |
|---|---|---|
| **S1** | Jam onboarding **tidak pasti/tidak tercatat**, atau onboarding gagal/ragu | **Jangan** menyatakan jam; **jangan** Step 1. Hasil "BELUM DAPAT DIUJI" bila jendela habis; onboarding ulang = keputusan terpisah |
| **S2** | Ada chat non-sintetis / grup / nomor non-penguji di ponsel, atau nomor ternyata bukan bersih | **Jangan** nyalakan `history_sync`/Step; laporkan |
| **S3** | TE One menolak (409/403/404) — daftar kunci a–j | Perbaiki penyebab **tanpa** memanipulasi jam/flag/izin. Kunci **e** (jendela) tidak dapat "diperbaiki": hasil BELUM DAPAT DIUJI |
| **S4** | **Status "BELUM PASTI"** setelah Step (timeout/jaringan/5xx/respons tak dikenal) | **STOP total.** Jangan klik ulang (tombol terkunci). Kumpulkan bukti: apakah webhook tiba? `request_id` tersimpan? Hubungi dukungan Meta dengan `request_id` bila ada. **Penyelesaian manual** (UI) hanya dengan bukti dan catatan alasan (≥ 10 karakter), dua arah: *Meta menerima* / *Meta tidak memproses* (membuka **satu** percobaan ulang) |
| **S5** | Status *gagal* (Meta menolak, mis. rate limit/token) | STOP; **tidak ada retry otomatis**. Catat HTTP/kode Meta. Pembukaan kembali hanya lewat penyelesaian manual "Meta tidak memproses" dengan bukti |
| **S6** | Data di luar rencana tersimpan (kontak/pesan nomor non-uji; identitas penguji B ≠ 0; kontak tanpa daftar uji di mode uji) | Matikan `history_sync`; **jangan** membuka isi; hitung per jenis/status; laporkan (analisis → keputusan pemilik) |
| **S7** | `automation_jobs`/`domain_outbox` bertambah, ada pesan keluar dari TE One, `unread_eligible=t` pada pesan history, atau `jendela_layanan_terbuka` > 0 | **Pelanggaran kontrak inti #3** → kill switch global, matikan flag, laporkan sebagai **temuan kritis** |
| **S8** | Antrean menumpuk (`pending/processing/failed`), kesehatan aplikasi tidak ok, DB penuh | Periksa worker/ruang disk; **jangan** mengubah konfigurasi; laporkan |
| **S9** | Event karantina `bentuk_tidak_dikenal:*`, `history_*` (identitas bertentangan/arah tak pasti) dalam jumlah berarti | Hasil **GAGAL-AMAN**; catat alasan + hitungan; **jangan** ulang (payload karantina tidak tersimpan) |
| **S10** | Kill switch menyala / layanan terganggu / token Meta kedaluwarsa | Hentikan; laporkan. Token baru = tugas terpisah (rahasia lewat jalur resmi, bukan chat) |

## 6. Kontinjensi (selaras batas izin M-11; berlaku sampai persetujuan H3 menyatakan lain)
| Kejadian | Lakukan | **Jangan** |
|---|---|---|
| Data pelanggan nyata terlanjur masuk | Matikan `history_sync`; hitung (jenis/status/jam) tanpa membuka isi; siapkan analisis + opsi pemulihan (`prosedur-uji-m11-m12.md` §9); **pemilik memutuskan** | menghapus ad hoc; restore ke DB staging; menyatakan data pasti dapat dibatalkan |
| Webhook sinkronisasi tidak datang | Catat (tanpa menebak sebab); periksa subscribe (P8), callback, `ada_request_id`; hubungi dukungan Meta dengan `request_id` | memanggil Step lagi; mengubah jam |
| Jendela hampir habis (< 30 menit) | TE One menolak Step baru sendiri; catat langkah yang tidak sempat | memperpanjang jendela lewat jam onboarding |
| Onboarding ulang tampak perlu | **Berhenti**; laporkan; onboarding ulang + sinkronisasi baru = keputusan & persetujuan terpisah (di TE One dinyatakan lewat "onboarding ulang") | melakukan offboarding sendiri |
| Event tertunda | `runbook-uji-m11.md` §6.3 (worker berjalan: periksa log aman; tombol "Ulang" hanya dengan persetujuan pemilik) | menyalakan/mematikan layanan tanpa rencana |
| Pesan terlewat | Resmi: Meta mencoba ulang webhook hingga 7 hari bila respons ≠ 200; **jangan** menyatakan pasti pulih | menjanjikan pemulihan |

## 7. Lembar hasil (isi setelah uji; teks saja; kirim ke pembangun untuk dicatat; **kosong**)
| Hal | Isi |
|---|---|
| T0 (jam onboarding, WIB/UTC), jam L2/L3/L4/L6/L8/akhir | |
| Commit + ID image (label), jumlah migrasi, worker berjalan? | |
| Daftar field webhook (awal / sesudah subscribe / akhir) | |
| Status pemetaan (L2) dan **sisa jendela** saat L6 dan L8 | |
| Step 1: status, percobaan ke-, HTTP/kode Meta, `ada_request_id` | |
| Step 2: status, percobaan ke-, HTTP/kode Meta, `ada_request_id` | |
| Event kontak: processed / quarantined (alasan); kontak tersimpan; kontak tanpa percakapan | |
| Event history per `kind/status/alasan`; `history_progress` akhir (`progress`, `phasesSeen`, `declined`, `complete`) | |
| Pesan history tersimpan: per `type`/`raw_type`/`direction`; `unread_eligible`; media placeholder | |
| Kontrol negatif (penguji B): identitas tersimpan = 0? Event karantina `pengirim_di_luar_daftar_uji` berapa? | |
| `automation_jobs` / `domain_outbox` sebelum/sesudah; pesan keluar dari TE One; `jendela_layanan_terbuka` | |
| Audit baru (nama aksi + jumlah) | |
| Antrean akhir; kesehatan; kondisi berhenti terpicu (S1–S10)? | |
| Fase yang teramati (0/1/2); fase yang **tidak** teramati dan alasannya | |
| Hasil: ☐ **LULUS** ☐ **GAGAL-AMAN** ☐ **GAGAL** ☐ **BELUM DAPAT DIUJI** — alasan | |
| Keputusan pemilik soal field webhook setelah uji (tetap / dicabut) dan nasib nomor uji ini | |
| Batas pengujian yang dicatat operator | |

### 7.1 Kriteria hasil (hanya sebagai **bahan** audit; pembangun tidak menyatakan lulus)
- **LULUS (CCP 2.9 nyata, sebagian):** Step 1 dan Step 2 masing-masing **tepat satu** permintaan berstatus *diterima Meta* (`request_id` tersimpan); ≥ 1 webhook `smb_app_state_sync` dan ≥ 1 webhook `history` berpesan diproses; kontak penguji A tersimpan **tanpa percakapan**; pesan history tersimpan `source=history`, `is_history=t`, `unread_eligible=f`; `jendela_layanan_terbuka = 0`; `automation_jobs`/`domain_outbox` **tidak bertambah**, **0** pesan keluar dari TE One; penguji B (kontrol negatif) **0** identitas tersimpan dan event-nya dikarantina tanpa payload; audit lengkap; tidak ada kondisi S6–S9. **Fase yang teramati dicatat apa adanya** (fase 2 hampir pasti tidak).
- **GAGAL-AMAN:** webhook tiba tetapi normalizer tidak cocok (`bentuk_tidak_dikenal:*`/`history_*`) ⇒ temuan normalizer naik; **jangan ulang**.
- **GAGAL:** salah satu invarian S7 dilanggar, atau data di luar rencana tersimpan (S6).
- **BELUM DAPAT DIUJI:** onboarding gagal, jendela terlewat, webhook tidak datang, atau status "belum pasti" yang tak terselesaikan dengan bukti — **bukan** kegagalan kode.

## 8. Data ke pihak ketiga dan retensi (AGENTS.md §9)
- **Ke Meta:** hanya permintaan sinkronisasi (`messaging_product`, `sync_type`) dan token akses (header); **tidak ada** data pelanggan dikirim.
- **Dari Meta ke staging:** isi chat sintetis, nama/nomor kontak penguji, BSUID/username bila ada. Mode uji menjaga: kontak/thread di luar daftar uji **tidak disimpan** (payload dibuang). Payload event diproses (history) tersimpan ≤ 30 hari (**D-18 Diputuskan**; pembersihan oleh worker); payload kontak dibuang setelah diproses.
- **Audit:** tanpa payload, tanpa `request_id`, tanpa nomor; hanya jenis langkah, hasil, kode galat.
- **Batas pembuktian:** satu nomor, satu kali, chat sintetis; tidak menjadi dasar keputusan migrasi Admisi/Hotline.

## Lampiran A — Template persetujuan tertulis pemilik untuk H3 (**KOSONG; hanya pemilik yang mengisi**)
> Pembangun **tidak** mengisi, menandatangani, atau menyalin pernyataan lisan menjadi persetujuan di sini. Arah "opsi (a)" (26 Nov) **bukan** isian dokumen ini.

| Butir | Isian pemilik |
|---|---|
| Saya menyetujui pelaksanaan **M-12 (Opsi H3)** pada nomor uji bersih dengan 4 digit akhir | |
| Penguji A (4 digit akhir; terdaftar) / penguji B kontrol negatif (ya/tidak; orang yang bersangkutan setuju) | |
| Rentang tanggal-jam rencana T0 dan nama dua pelaku (inisial) | |
| Pilihan berbagi riwayat saat onboarding: ☐ **setujui** ☐ tolak | |
| Saya memahami: tiap langkah **sekali**, jendela **24 jam**, salah langkah = offboarding + onboarding ulang; data yang sudah sampai ke server/pesan terlewat **tidak** dinyatakan pasti dapat dibatalkan/dipulihkan; hasil "belum pasti" tidak dicoba ulang | ☐ ya |
| Saya mengizinkan Super Admin menyalakan flag `history_sync` **hanya** selama Tahap C–F, lalu mematikannya | ☐ ya |
| **Batas izin:** tidak mencakup …186319, Admisi (…196319), Hotline (…246319), Halo AI, M-11 (echo), onboarding ulang, atau nomor lain | ☐ ya |
| Keputusan field webhook setelah uji: ☐ tetap aktif ☐ dicabut | |
| Nama · tanggal · tanda tangan | |
