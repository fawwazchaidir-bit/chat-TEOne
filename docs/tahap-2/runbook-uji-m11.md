# Runbook uji echo M-11 — nomor …6319 → penguji …4062

> **DISIAPKAN, BELUM DIJALANKAN.** Dasar izin: [`persetujuan-pemilik-m11-2026-11-26.md`](persetujuan-pemilik-m11-2026-11-26.md). Pelaku = **operator** (satu orang); pembangun **tidak punya akses** ke server, akun Meta, atau ponsel dan **tidak mengisi** lembar di bawah. Semua kolom hasil **sengaja kosong**.
> **Aturan:** uji **tidak boleh dimulai** bila ada satu pun prasyarat P1–P9 berstatus bukan "YA" (gerbang **GO/NO-GO**, §1). Tidak ada tangkapan layar, tidak ada isi chat, nomor non-penguji **tidak** ditulis (4 digit akhir hanya untuk penguji/…6319). Kondisi server **tidak diubah** (tanpa ganti image, tanpa menyalakan worker, tanpa edit konfigurasi).
> Perintah memakai gaya operator (`sudo docker …`, proyek Compose **`deploy`**, kontainer `deploy-app-1` dan `deploy-db-1`). Nama database = `<DB>` (cari dengan `sudo docker exec deploy-db-1 psql -U postgres -Atc "select datname from pg_database where not datistemplate"`). Perintah yang belum pernah dijalankan pembangun di server Anda diberi tanda **[BELUM DIUJI di server]**.

## 0. Ringkasan skenario
1. Subscribe **hanya** `smb_message_echoes` (aplikasi Meta TE One). 2. Kirim **satu** teks sintetis dari Business App …6319 ke …4062. 3. Periksa pencatatan di TE One. 4. Cabut field; periksa kembali ke kondisi awal. 5. Catat hasil (teks).
**Yang diharapkan secara dokumentasi resmi** ([`verifikasi-dokumentasi-meta-2026-11-26.md`](verifikasi-dokumentasi-meta-2026-11-26.md)): webhook `smb_message_echoes` dengan `message_echoes[]` (`from`, `to`, `id`, `timestamp`, `type`, `text.body`). **Cakupan:** semua pesan dari Business App **dan perangkat tertaut** ke siapa pun.

## 1. Gerbang GO/NO-GO (sesuai butir 1–7 izin + P8–P9)
Isi **YA/TIDAK**, jam (WIB), dan bukti teks. **Satu "TIDAK" = NO-GO**.

| # | Prasyarat | Cara memeriksa (baca-saja) | Bukti teks | Status |
|---|---|---|---|---|
| **P1** | `inbox` dan `ai_simulation` mati; `whatsapp_connector` aktif; **mode uji aktif**; **daftar penerima uji benar** (hanya …4062 aktif) | SQL §2.1 | keluaran kueri + `jam_server_utc` | |
| **P2** | **Kondisi worker dan antrean** diperiksa; cara menangani event tertunda dipahami (§6.3); **tidak ada** event `pending/processing/failed` yang tak dijelaskan | `sudo docker ps -a --filter name=deploy- --format '{{.Names}}\t{{.Image}}\t{{.Status}}'`; `sudo docker exec deploy-app-1 printenv WORKER_INLINE`; SQL §2.2 | daftar kontainer (**tanpa** Env), nilai `WORKER_INLINE`, hitungan antrean | |
| **P3** | **Backup terenkripsi DB + media**, **salinan terpisah di luar VPS**, **bukti uji restore pada lingkungan terisolasi** | §3 | nama berkas, SHA-256, ukuran, versi migrasi, jam, lokasi salinan (jenis), PIC pembuat/pemeriksa, hasil restore | **DINYATAKAN YA — pemilik, 26 Nov** (checksum berkas backup **cocok** menurut pemeriksaan manual pemilik; **uji restore terisolasi** dilakukan; kedua hasil **dinyatakan pemilik telah diverifikasi independen oleh auditor**). **Rincian teks BELUM diterima:** nama berkas/SHA-256/ukuran, versi migrasi, durasi; **apakah media ikut**; **apakah salinan di luar VPS dibuat dan checksum-nya cocok di sana**; perbandingan hitungan restore vs baseline; PIC pembuat/pemeriksa; identitas dan catatan auditor (§3.5). **Belum ada laporan auditor di repository.** Status **bersyarat** sampai rincian itu ada |
| **P4** | **Dokumentasi resmi Meta** tentang field echo dan cakupan event Business App diverifikasi | **Dibaca pembangun 26 Nov** (`verifikasi-dokumentasi-meta-2026-11-26.md`): nama field ✔, payload ✔, cakupan ✔ (semua pesan + perangkat tertaut). **Operator mengonfirmasi** tiga hal di halaman resmi **saat ini**: (a) nama field `smb_message_echoes` masih sama, (b) kunci `message_echoes[]`/`to` masih sama, (c) kalimat cakupan masih sama; dan mencatat **V-5/V-6/V-9 = belum terjawab** sebagai risiko yang diterima | URL + tanggal baca + "sama/berbeda" | |
| **P5** | **Kondisi awal subscription dan hitungan event** tercatat **sebagai teks** | §2.3–§2.4 + lembar §4 | lembar §4 terisi | |
| **P6** | **Satu operator** memegang ponsel; **tidak ada aktivitas lain** pada ponsel selama jendela uji | Daftar cek §5 | inisial operator (tanpa nama lengkap), jam mulai/selesai jendela | |
| **P7** | **Tidak ada perubahan image/konfigurasi server** (sebelum = sesudah) | `sudo docker ps --format '{{.Names}}\t{{.Image}}\t{{.CreatedAt}}'` sebelum dan sesudah; `git -C <repo> status --short` tidak bertambah | dua keluaran identik (ID image `417b30f8…`) | |
| **P8** | **Jendela waktu pendek (≤ 10 menit)** dan **di luar jam ramai pelanggan** ditetapkan | rencana operator | jam rencana | |
| **P9** | **Dua orang siaga** (atau satu orang dengan akses ketiganya): dashboard Meta (cabut field), akses DB baca-saja, ponsel | konfirmasi operator | ya/tidak | |

**Keputusan GO/NO-GO:** ☐ GO ☐ NO-GO — operator (inisial): ____ — jam (WIB): ____ *(tidak diisi pembangun)*

### 1.1 Rekap status prasyarat (dicatat pembangun dari pernyataan yang diterima; **bukan** pengisian gerbang)
| # | Status per 26 Nov | Dasar |
|---|---|---|
| P1 flag / mode uji / penerima uji | **Belum ada pembaruan.** Flag `inbox`/`ai_simulation` mati dan `whatsapp_connector` aktif sudah dilaporkan **sebelumnya** (kueri 25 Nov, tanpa jam). Mode uji dan daftar penerima **belum dilaporkan** | Kirim keluaran §2.1 (dengan `jam_server_utc`) |
| P2 worker dan antrean | **Belum ada pembaruan.** Diketahui sebelumnya: tidak ada container worker, `WORKER_INLINE=true`, 5 message + 6 status *processed*, 2 message *quarantined*, tanpa `pending/processing/failed` (pada saat kueri, tanpa jam) | Kirim keluaran §2.2 terbaru |
| **P3 backup + salinan terpisah + restore terisolasi** | **Dinyatakan YA oleh pemilik (bersyarat)** — lihat sel P3 dan §3.5–§3.6 | Pernyataan pemilik 26 Nov |
| P4 dokumentasi Meta | **Sebagian:** dibaca pembangun (`verifikasi-dokumentasi-meta-2026-11-26.md`); **konfirmasi operator** atas halaman saat ini **belum ada** | — |
| P5 baseline teks | Belum | — |
| P6 satu operator/ponsel | Belum | — |
| P7 tanpa perubahan image/konfigurasi | Belum (pembandingan sebelum/sesudah dilakukan saat uji) | — |
| P8 jendela waktu | Belum | — |
| P9 siaga | Belum | — |

> Catatan: pesan "update pada P1 & 2" **tidak disertai data baru** untuk P1 maupun P2, sehingga keduanya **tidak diubah**. Bila yang dimaksud **Fase 1 & Fase 2** di `prosedur-uji-m11-m12.md`: Fase 1 hanya **§5.1 (titik pemulihan)** yang dinyatakan selesai — **rebuild/penggantian image tidak dijalankan** (syarat 7 izin); Fase 2 (M-11) **belum dijalankan**.

## 2. Paket kueri baca-saja (tanpa isi pesan, tanpa nomor non-penguji)
Jalankan memakai `sudo docker exec deploy-db-1 psql -U postgres -d <DB> -c "…"` (atau sesi `psql` interaktif). Bila diminta **kata sandi**, **berhenti** — jangan menaruh sandi di perintah; ajukan rencana terpisah. Catat `jam_server_utc` pada tiap blok.

### 2.1 Flag, mode uji, penerima uji (P1)
```sql
SELECT now() AS jam_server_utc;
SELECT key, enabled FROM feature_flag_overrides ORDER BY key;                      -- harapan: ai_simulation=f, inbox=f, whatsapp_connector=t
SELECT test_mode, verification_status, verification_mode, verified_at FROM channel_connections;   -- harapan: test_mode=t
SELECT label, right(identity_value,4) AS akhir4, active FROM test_recipients ORDER BY created_at;  -- harapan: hanya …4062 aktif
SELECT scope_type, scope_ref, engaged FROM kill_switches ORDER BY 1,2;             -- catat status kill switch; JANGAN diubah
```
*(Kueri flag sama bentuknya dengan yang sudah Anda jalankan: `key | enabled`. Nama tabel/kolom lain diambil dari skema di repository; bila ada yang gagal karena nama berbeda di server, **laporkan** — jangan menebak.)*

### 2.2 Worker dan antrean (P2)
```sql
SELECT kind, status, coalesce(quarantine_reason,'-') AS alasan, count(*) AS n,
       count(*) FILTER (WHERE payload IS NOT NULL) AS dengan_payload, max(id) AS id_terbesar
FROM inbound_events GROUP BY 1,2,3 ORDER BY 1,2,3;
SELECT (SELECT count(*) FROM automation_jobs) AS job, (SELECT count(*) FROM domain_outbox) AS outbox,
       (SELECT coalesce(max(id),0) FROM audit_log) AS audit_id_terbesar;
SELECT status, count(*) FROM messages WHERE direction='keluar' GROUP BY 1 ORDER BY 1;   -- harapan: tak ada 'diproses'/'belum_pasti' yang tertahan
```
### 2.3 Percakapan penguji (baseline; **tanpa `body`**)
```sql
SELECT c.last_customer_message_at, c.last_message_at, c.ai_status, c.ai_version, c.ai_off_reason, c.review_flag
FROM conversations c WHERE c.id IN (SELECT c2.id FROM conversations c2 JOIN contact_identities ci ON ci.contact_id=c2.contact_id
  WHERE ci.identity_type='wa_id' AND right(ci.identity_value,4)='4062');
SELECT m.direction, m.source, m.type, m.status, m.is_history, m.unread_eligible, m.provider_ts, m.received_at
FROM messages m WHERE m.conversation_id IN (SELECT c2.id FROM conversations c2 JOIN contact_identities ci ON ci.contact_id=c2.contact_id
  WHERE ci.identity_type='wa_id' AND right(ci.identity_value,4)='4062') ORDER BY m.received_at DESC LIMIT 4;
```
### 2.4 Kondisi awal subscription (teks, **tanpa** tangkapan layar)
Di App Dashboard **aplikasi "Trilogika Edutama TE-One"** (bukan aplikasi lain; pastikan ID aplikasi = `META_APP_ID` di server — jawab **ya/tidak**, tanpa menulis nilainya) > WhatsApp > Configuration, **salin sebagai teks**: daftar field **aktif** dan **tidak aktif**, jam (WIB). Harapan awal: `messages` aktif; `smb_message_echoes`, `history`, `smb_app_state_sync` tidak aktif.
Opsional (diagnostik **baca-saja**: hanya panggilan Graph `GET`, **tidak menulis ke DB** — `meta-check.ts` memakai `runVerification` murni; keluaran **tanpa rahasia**: mode NYATA, webhook berlangganan ya/TIDAK): image **app** hanya berisi `server.js`, jadi jalankan dari image **tools** bila ada: `sudo docker run --rm --network deploy_internal --env-file /etc/teone/staging.env teone-tools:staging npm run -s meta:check` **[BELUM DIUJI di server; bila image `teone-tools` atau jaringan `deploy_internal` tidak ada, lewati — jangan membangun apa pun]**. Perhatikan: ini membuat kontainer sementara yang membaca berkas env rahasia; **jangan** menempel keluarannya selain baris ✔/✘.

### 2.5 Setelah uji (isi `<…>` dari baseline)
```sql
SELECT now() AS jam_server_utc;
SELECT kind, status, coalesce(quarantine_reason,'-') AS alasan, count(*) AS n, count(*) FILTER (WHERE payload IS NOT NULL) AS dengan_payload
FROM inbound_events WHERE id > <id_terbesar_sebelum_uji> GROUP BY 1,2,3 ORDER BY 1,2,3;     -- event BARU sejak baseline
SELECT action, result, count(*) FROM audit_log WHERE id > <audit_id_terbesar_sebelum_uji> GROUP BY 1,2 ORDER BY 1,2;   -- hanya nama aksi
SELECT (SELECT count(*) FROM automation_jobs) AS job, (SELECT count(*) FROM domain_outbox) AS outbox;
SELECT count(*) AS pesan_baru_di_percakapan_lain FROM messages m WHERE m.received_at > '<jam_server_utc_sebelum_uji>'
  AND m.conversation_id NOT IN (SELECT c2.id FROM conversations c2 JOIN contact_identities ci ON ci.contact_id=c2.contact_id
  WHERE ci.identity_type='wa_id' AND right(ci.identity_value,4)='4062');
-- lalu ulangi §2.3 (percakapan penguji) dan §2.2 (antrean)
```

## 3. Backup, salinan terpisah, dan uji restore terisolasi (P3)
**Tujuan:** ada salinan **terenkripsi** DB + media yang **terbukti dapat dipulihkan** di lingkungan **terpisah dari DB staging** sebelum field diaktifkan. **Tidak ada restore ke DB staging** (kontinjensi).
**Dasar:** `docs/backup-restore.md` dan `scripts/backup.sh`/`restore.sh` (terbukti **simulasi/drill lokal & CI**; **belum di server**). Image `teone-tools` **tidak** memuat `pg_dump`/`gpg`, sehingga `scripts/backup.sh` biasa butuh alat di host. Jalur di bawah **memakai alat yang ada di kontainer DB dan host**, menghasilkan **format berkas yang sama** (agar `restore.sh` dapat membacanya), tanpa mengubah konfigurasi server. **[BELUM DIUJI di server]**.

### 3.1 Cek alat (baca-saja). Bila ada yang hilang → P3 = NO-GO (memasang paket = perubahan konfigurasi server → rencana terpisah)
```bash
command -v gpg sha256sum tar >/dev/null && echo "alat host OK" || echo "ALAT HOST KURANG"
sudo docker exec deploy-db-1 sh -c 'command -v pg_dump pg_restore psql >/dev/null && echo "alat DB OK"'
sudo docker exec deploy-app-1 sh -c 'command -v tar >/dev/null && echo "tar di app OK"'
sudo stat -c '%a %U' /etc/teone/backup.pass     # harus 600 atau 400 (passphrase di BERKAS; JANGAN ditampilkan isinya)
```
### 3.2 Backup (media dulu, lalu DB — urutan sama dengan `backup.sh`)
```bash
umask 077; B=/var/backups/teone; sudo mkdir -p "$B"; sudo chmod 700 "$B"; DB=<DB>; ST=$(date -u +%Y%m%dT%H%M%SZ)
ENC() { gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-fd 3 --output "$1" 3< /etc/teone/backup.pass; }
# media (arsip tar dari volume deploy_media_data lewat kontainer app; opsi tar sama dengan backup.sh)
sudo docker exec deploy-app-1 tar --create --file=- --directory=/data/media --sort=name --owner=0 --group=0 --numeric-owner . | sudo bash -c "$(declare -f ENC); ENC $B/$DB-$ST.media.tar.gpg"
# database (superuser lokal di dalam kontainer DB; format custom, tanpa owner/acl — sama dengan backup.sh)
sudo docker exec deploy-db-1 pg_dump -U postgres -d "$DB" --format=custom --no-owner --no-acl --compress=6 | sudo bash -c "$(declare -f ENC); ENC $B/$DB-$ST.dump.gpg"
sudo bash -c "cd '$B' && sha256sum '$DB-$ST.media.tar.gpg' > '$DB-$ST.media.tar.gpg.sha256' && sha256sum '$DB-$ST.dump.gpg' > '$DB-$ST.dump.gpg.sha256' && chmod 600 *'$ST'* && ls -l *'$ST'* && sha256sum --check *'$ST'*.sha256"   # direktori 700 milik root → semuanya di dalam sudo
```
*(Catatan: `--owner=0 --group=0` memerlukan GNU tar; bila `tar` di kontainer app menolak opsi, hentikan dan laporkan — jangan memodifikasi image.)*
Catat: nama berkas, ukuran, SHA-256 (dua nilai), **versi migrasi** (`select count(*) from drizzle.__drizzle_migrations;` — diharapkan 6), jam mulai/selesai (**durasi**), **PIC pembuat**.

### 3.3 Salinan terpisah (di luar VPS)
Salin **kedua berkas + `.sha256`** ke penyimpanan **di luar VPS** (provider/lokasi berbeda, kredensial tulis-saja), lalu **verifikasi `sha256sum --check` di sana**. **Passphrase** disimpan di brankas **berbeda** dari berkas backup dan dari VPS. Catat: **jenis** lokasi (tanpa alamat/kredensial), SHA terverifikasi ya/tidak, **PIC pemeriksa** (orang berbeda bila mungkin).

### 3.4 Uji restore di lingkungan terisolasi (bukan DB staging)
```bash
# Sumber daya SEMENTARA yang dibuat langkah ini saja: jaringan internal tanpa internet + satu kontainer Postgres tanpa port terpublikasi.
sudo docker network create --internal teone-restore-test
sudo docker run -d --name teone-restore-pg --network teone-restore-test -e POSTGRES_PASSWORD="$(head -c16 /dev/urandom | base64)" postgres:16   # image sudah ada di host (dipakai compose)
sleep 8; sudo docker exec teone-restore-pg createdb -U postgres restore_check
# verifikasi checksum dulu, lalu dekripsi → restore (tanpa menyentuh DB staging)
sudo bash -c "cd '$B' && sha256sum --check '$DB-$ST.dump.gpg.sha256' '$DB-$ST.media.tar.gpg.sha256'"
sudo gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$B/$DB-$ST.dump.gpg" 3< /etc/teone/backup.pass | sudo docker exec -i teone-restore-pg pg_restore -U postgres -d restore_check --no-owner --no-acl
# bandingkan dengan baseline (kueri hitungan sama dengan §2.2/§2.3, jalankan DI restore_check)
sudo docker exec teone-restore-pg psql -U postgres -d restore_check -Atc "select count(*) from messages; select count(*) from inbound_events; select count(*) from conversations; select count(*) from audit_log; select count(*) from drizzle.__drizzle_migrations;"
# media: jumlah berkas di arsip vs di volume vs baris media 'tersimpan'
sudo gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$B/$DB-$ST.media.tar.gpg" 3< /etc/teone/backup.pass | tar -tf - | grep -vc '/$' || true
sudo docker exec deploy-app-1 sh -c 'find /data/media -type f | wc -l'
# BERSIHKAN hanya yang dibuat di atas (jangan menyentuh volume/kontainer deploy_*):
sudo docker rm -f teone-restore-pg; sudo docker network rm teone-restore-test
```
**Lulus bila:** checksum OK; dekripsi OK; `pg_restore` selesai tanpa galat; hitungan `messages/inbound_events/conversations/audit_log` **sama dengan baseline** (selisih hanya bila ada event masuk antara backup dan hitungan — catat jam); `drizzle.__drizzle_migrations` = 6; jumlah berkas media di arsip = di volume; **durasi backup dan restore** tercatat. Bukti: teks angka (bukan isi). **Batas:** ini bukti **data+skema**, bukan seluruh verifikasi `restore-verify.ts` (role, trigger, hash sandi, konsistensi media ukuran/SHA-256) dan tidak menguji **mode aman**; `APP_ENCRYPTION_KEY` **tidak** ada di backup (TOTP tidak terpulihkan tanpa kunci).

### 3.5 Catatan verifikasi auditor (template **kosong**; agar klaim "diverifikasi independen" dapat ditinjau)
Pemilik menyatakan **auditor** memverifikasi secara independen (a) pencocokan checksum dan (b) uji restore terisolasi. **Pembangun tidak dapat memeriksa pernyataan itu**, dan **tidak ada nama, tanggal, atau dokumen auditor** yang diterima — tidak diisi dengan asumsi. Agar dapat ditinjau kelak, minta auditor menulis (teks) lalu tambahkan di sini atau di `docs/reports/bukti/`:
| Hal | Isi (diisi auditor/pemilik) |
|---|---|
| Identitas auditor (inisial/peran; **bukan** kredensial) dan apakah **sama** dengan auditor Gate 1/2 | |
| Tanggal-jam pemeriksaan; lokasi (VPS / lingkungan auditor) | |
| (a) Checksum: berkas apa saja yang dicocokkan; hasil; **apakah** salinan di luar VPS ikut dicocokkan | |
| (b) Restore: bagaimana dipastikan **terisolasi** (bukan DB staging); hitungan yang dibandingkan; versi migrasi; media (jumlah berkas) | |
| Hasil dan batas pemeriksaan | |

### 3.6 Rincian yang masih diminta untuk menutup P3 (teks saja, tanpa rahasia)
(1) nama berkas backup (DB dan media) + **SHA-256** + ukuran; (2) **jam** dan **durasi** backup dan restore; (3) **versi migrasi** hasil restore (diharapkan 6); (4) **media ikut dicadangkan?** + jumlah berkas arsip vs volume; (5) **salinan di luar VPS**: **jenis** lokasi dan apakah checksum **cocok di sana**; (6) hitungan `messages/inbound_events/conversations/audit_log` hasil restore vs baseline (catat jam bila ada selisih karena event masuk di antara backup dan hitungan); (7) **PIC pembuat dan pemeriksa**; (8) **bahwa restore tidak dilakukan ke DB staging** dan lingkungan uji sudah dibersihkan; (9) **passphrase** disimpan di brankas terpisah (ya/tidak; tanpa nilai).

## 4. Lembar kondisi awal (isi sebelum uji; teks saja)
| Hal | Nilai |
|---|---|
| Tanggal/jam server UTC dan WIB | |
| Commit checkout di VPS (`git rev-parse HEAD`) dan **tag/ID image** app (`417b30f8…`?) | |
| Flag `inbox` / `ai_simulation` / `whatsapp_connector` | |
| Mode uji channel; penerima uji aktif (4 digit akhir) | |
| Field webhook **aktif/tidak aktif** (daftar teks) di aplikasi TE One | |
| `inbound_events`: hitungan per `kind/status/alasan`; `id_terbesar` | |
| `audit_id_terbesar`; `automation_jobs`; `domain_outbox` | |
| Percakapan …4062: `last_customer_message_at`, `last_message_at`, `ai_status`, `ai_version` | |
| Hitungan pesan di percakapan …4062 per `source`/`direction` | |
| Status kontainer & `GET /api/health` | |
| Backup: nama berkas, SHA-256, ukuran, versi migrasi, durasi; salinan terpisah (jenis lokasi, SHA ok); restore terisolasi (hasil, durasi); PIC | |
| Operator ponsel (inisial); jam jendela rencana | |

## 5. Daftar cek ponsel dan operator (P6) — **tanpa mengubah pengaturan akun**
- [ ] **Satu** orang memegang ponsel …6319 dari awal sampai akhir jendela; tidak ada yang lain memakainya.
- [ ] **Perangkat tertaut** (WhatsApp Web/Business Web/lainnya) **tidak dipakai** selama jendela (cakupan echo mencakup perangkat tertaut). Catat jumlah perangkat tertaut yang terlihat (angka); **jangan** menautkan/memutus.
- [ ] Catat **apakah** pesan sapaan/jauh/balasan cepat **aktif** (hanya lihat; **jangan** ubah). Bila aktif, pesan masuk pelanggan dapat memicu pesan otomatis dari aplikasi → **risiko echo ke nomor di luar daftar** (dikarantina, tetapi menjadi "event di luar rencana" → hentikan uji). Karena itu pilih jam yang sangat sepi.
- [ ] Tidak membalas pelanggan nyata dari ponsel selama jendela; balas **setelah** field dicabut.
- [ ] Hanya **satu** pesan keluar yang dikirim dari ponsel selama jendela: teks sintetis, mis. `[UJI-M11 sintetis]` + tanggal-jam, ke **…4062**. Tidak ada media, tidak ada pesan ke nomor lain.
- [ ] Pesan **masuk** dari pelanggan nyata mungkin tiba (field `messages` sudah aktif; **dikarantina**); itu **bukan** akibat uji dan **bukan** alasan berhenti, tetapi **dicatat jumlahnya**.

## 6. Pelaksanaan, hentikan, dan kontinjensi

### 6.1 Langkah (catat jam WIB tiap langkah)
| # | Langkah | Hasil/ catat |
|---|---|---|
| E0 | GO/NO-GO §1 = **GO** | |
| E1 | Jalankan §2.2–§2.3; isi §4 (`id_terbesar`, `audit_id_terbesar`, baseline percakapan). **T_baseline** | |
| E2 | Salin daftar field webhook (teks) = **kondisi awal** | |
| E3 | Aktifkan **hanya `smb_message_echoes`**. Salin daftar field (teks) = **kondisi aktif**. **T_on** | |
| E4 | Dari ponsel …6319 kirim **satu** teks sintetis ke …4062. **T_kirim** | |
| E5 | Tunggu ≤ 2 menit; jalankan §2.5. Evaluasi **kondisi berhenti** (§6.2) | |
| E6 | Bila **tidak ada** kondisi berhenti → lanjut E7. Bila ada → **E7 segera**, lalu §6.2 | |
| E7 | **Cabut `smb_message_echoes`** (kembalikan ke kondisi awal E2). Salin daftar field (teks). **T_off**; bandingkan **identik** dengan E2 | |
| E8 | Tunggu ≥ 2 menit **tanpa mengirim pesan apa pun**; jalankan §2.5 lagi: **tidak ada event echo baru** sejak E5 (pembuktian pembalikan tanpa pesan kedua) | |
| E9 | `GET /api/health` = `{"status":"ok"}`; kontainer sehat; §2.2 antrean; `sudo docker ps` (P7: sama dengan sebelum). Isi §7 | |

### 6.2 Kondisi berhenti (→ E7 segera, lalu laporkan; **jangan** mengulang, **jangan** menghapus/restore)
| Kode | Kondisi | Catatan |
|---|---|---|
| K1 | Event baru `kind=echo` **lebih dari 1**, atau echo **dikarantina** (alasan apa pun, mis. `pengirim_di_luar_daftar_uji`, `echo_tanpa_penerima`, `bentuk_tidak_dikenal:…`) | `bentuk_tidak_dikenal`/`echo_tanpa_*` = **gagal-aman**, hasil uji **gagal**, bukan bahaya (S-05) |
| K2 | Event baru `kind=history`, `contact_sync`, atau `unknown` | field lain tidak diaktifkan — tidak seharusnya muncul |
| K3 | Pesan baru di **percakapan selain …4062** (§2.5) | |
| K4 | `automation_jobs` atau `domain_outbox` **bertambah** | seharusnya 0 (flag mati) |
| K5 | `GET /api/health` bukan ok; kontainer restart; muncul event `failed`/`processing` yang tak tuntas | layanan terganggu |
| K6 | Field **tidak dapat** dikembalikan/daftar field akhir **berbeda** dari kondisi awal | **berhenti total**, laporkan |
| K7 | Operator melihat aktivitas lain di ponsel, atau ≥ 1 pesan keluar selain pesan uji | |
**Bukan** kondisi berhenti: event `kind=message` pelanggan nyata yang **dikarantina** (`pengirim_di_luar_daftar_uji`) — fenomena dasar sejak onboarding; **dicatat jumlahnya**. Event `status` terkait pesan echo — **dicatat** (perilaku nyata belum terverifikasi).

### 6.3 Penanganan event tertunda (tanpa menyalakan worker)
Mode inline memproses event **saat ada webhook sah** (`kickProcessing`), tanpa timer ([`pemeliharaan-inline-vs-worker.md`](pemeliharaan-inline-vs-worker.md)). Event **tersimpan di DB sebelum respons 200**, jadi **tidak hilang**; yang tertunda hanya **pemrosesannya**.
| Keadaan | Arti | Tindakan |
|---|---|---|
| `pending`, `run_after` sudah lewat | menunggu *kick* berikutnya | **Tunggu** (≤ 5 menit). **Jangan** mengirim pesan kedua. Bila tetap `pending` saat E7 → **catat**, hasil = "belum dapat disimpulkan"; webhook berikutnya (mis. pesan masuk pelanggan) akan memprosesnya. Mengaktifkan worker = **rencana terpisah (A-4)** |
| `pending`, `run_after` di masa depan | backoff setelah kegagalan | **Catat** `last_error` (kode saja); jangan memaksa; laporkan |
| `processing` | lease 60 dtk | Pulih otomatis pada *kick* berikutnya; catat |
| `failed` (≥ 5 percobaan) | berhenti otomatis | **Laporkan dahulu.** Tombol **"Ulang"** di alat uji integrasi (`requeueEvent`) **hanya** setelah penyebab diketahui dan **dengan persetujuan pemilik**; ini aksi aplikasi, bukan konfigurasi server |
| `quarantined` echo | normalizer/penerima | **Jangan diulang** (tidak dapat diulang kecuali `channel_*`/`waba_*`); catat alasan |

### 6.4 Kontinjensi (sesuai izin pemilik)
| Kejadian | Tindakan | **Jangan** |
|---|---|---|
| Event/data di luar rencana | **E7** (cabut field) → catat **jumlah dan status** (§2.5) tanpa membuka isi → laporkan | membuka/membagikan isi chat; menghapus payload; restore ke DB staging |
| Layanan terganggu | Hentikan uji; **E7**; periksa antrean (§2.2) dan kesehatan; laporkan | memulai ulang kontainer/mengubah konfigurasi tanpa rencana terpisah |
| Field tidak dapat dikembalikan | **Hentikan semua aktivitas uji**; laporkan | upaya lain di dashboard (mis. menghapus/menambah subscription lain) |
| Data pelanggan nyata terlanjur masuk | **Jangan menghapus ad hoc.** Siapkan **analisis**: hitungan per `kind/status/alasan`, jam, apakah `payload` kosong (karantina membuang payload; event **processed** menyimpannya), dan **opsi pemulihan** (lihat `prosedur-uji-m11-m12.md` §9; restore **ke DB terpisah**, bukan staging) — **pemilik memutuskan** | menyatakan bahwa data pasti dapat dibatalkan/dipulihkan |
| Pesan terlewat | Dokumentasi resmi: Meta mencoba ulang hingga **7 hari** bila respons bukan 200; tetap **jangan menyatakan pasti pulih** (V-8). Periksa lewat Business App | menjanjikan pemulihan |

## 7. Lembar hasil (isi setelah uji; teks saja; kirim ke pembangun untuk dicatat)
| Hal | Isi |
|---|---|
| Waktu: T_baseline / T_on / T_kirim / T_off (WIB dan UTC) | |
| Commit checkout dan ID image (sebelum = sesudah) | |
| Daftar field webhook: awal / aktif / akhir (identik awal=akhir?) | |
| Event baru per `kind/status/alasan` (E5 dan E8) | |
| Pesan baru di percakapan …4062: `direction`, `source`, `type`, `status`, `is_history`, `unread_eligible` | |
| `last_customer_message_at` sebelum/sesudah (**harus sama**) | |
| `ai_status` / `ai_version` / `ai_off_reason` sebelum/sesudah (**perubahan ke `off`/`balasan_dari_hp` DIHARAPKAN** — D-05 ASUMSI) | |
| `automation_jobs` dan `domain_outbox` sebelum/sesudah | |
| Aksi audit baru (nama aksi + jumlah) | |
| Pesan masuk pelanggan nyata terkarantina selama jendela (jumlah saja) | |
| Antrean akhir; kesehatan; kondisi berhenti terpicu (K1–K7)? | |
| Hasil: ☐ **LULUS** ☐ **GAGAL** (gagal-aman/lainnya) ☐ **BELUM DAPAT DIUJI** — alasan | |
| Batas pengujian yang dicatat operator | |

### 7.1 Kriteria hasil (CCP 2.8 hanya bila LULUS nyata)
**LULUS:** (1) tepat **satu** event `echo` *processed*; (2) tepat **satu** pesan baru di …4062: `direction=keluar`, `source=whatsapp_business_app`, `type=text`, `is_history=false`, `unread_eligible=false`; (3) `last_customer_message_at` **tidak berubah** (jendela layanan tidak terbuka/diperpanjang); (4) `automation_jobs`/`domain_outbox` **tidak bertambah**, 0 pesan keluar dari TE One; (5) field kembali ke kondisi awal dan **tidak ada event echo baru** setelah E7 (E8); (6) tidak ada kondisi berhenti.
**GAGAL-AMAN:** echo dikarantina `bentuk_tidak_dikenal:*`/`echo_tanpa_penerima` → **normalizer tidak cocok payload nyata** (temuan T2-F02 naik). **Jangan diulang** sebelum bentuk payload dapat ditangkap (S-05/R-1 butuh perubahan kode → rencana terpisah).
**BELUM DAPAT DIUJI:** tidak ada echo diterima meski field aktif — catat tanpa menebak sebab.

## 8. Batas pembuktian hasil uji ini
Satu pesan teks; satu nomor penerima terdaftar; **image tanpa label revisi** (bukti terikat checkout `9c297d3` dan ID image, bukan commit yang dapat dibuktikan); **tidak** membuktikan history (M-12), media, status Dibaca, jendela 24 jam nyata, echo dari perangkat tertaut, echo ke nomor di luar daftar, atau pesan otomatis Business App; V-5/V-6/V-9 belum terjawab; CCP 2.10 **tidak** lulus dari uji ini saja; Gate 1/2 tidak diubah dan tidak ada tag.
