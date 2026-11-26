# Laporan PR S-12 — pemicu sinkronisasi kontak & riwayat (SMB App Data API)

> PR perbaikan/temuan **S-12** (G2-B01a), bukan tahap baru dan **bukan keputusan gate**. **Tidak ada tag.** Tidak ada klaim "terbukti nyata". Format AGENTS.md §12.

## 1. Ringkasan hasil
TE One kini punya pemicu **Step 1 (kontak)** dan **Step 2 (riwayat)** ke SMB App Data API — satu-satunya jalan agar webhook `smb_app_state_sync` dan `history` datang pada nomor coexistence. Karena Meta hanya mengizinkan tiap langkah **sekali** dan **dalam 24 jam** setelah onboarding, penjagaannya ditegakkan di **server dan database**, bukan di layar: baris `smb_sync_requests` (UNIQUE per channel + jenis + versi pemetaan) dibuat **dalam transaksi sebelum** Meta dipanggil; hasil tidak pasti **tidak pernah dicoba ulang**; jendela dihitung dengan **jam database** dan berhenti 30 menit sebelum habis. Semua di balik flag baru `history_sync` (default **mati**) + `whatsapp_connector`. Status: **terbukti SIMULASI** (mock Graph); **belum terbukti nyata** — M-12 butuh nomor uji bersih (§12). `verify-all` **11/11 LULUS** pada commit terakhir PR (SHA dan ringkasan 11 langkah ada di deskripsi PR dan `.verify/ringkasan.md`); CI 4 job (tautan di deskripsi PR). Jumlah test naik 432 → 524 (Vitest), 0 gagal, 0 dilewati.

## 2. Repository, branch, commit
`fawwazchaidir-bit/chat-TEOne` · branch `tahap-2-s12-sinkronisasi-riwayat` (basis `main` @ `0463559`) → **satu PR ke `main`**. Commit (urut): `P1+P2` pemicu + migrasi 0006 · `P3` webhook kontak/history · `P4` panel UI · `P6` backup Docker · `P5` Golden E2E · commit dokumen + baseline (SHA lengkap di `git log` dan deskripsi PR). **Tag yang diusulkan: tidak ada.**

## 3. Status fitur (istilah §4)
| Butir | Status | Isi dan batasnya |
|---|---|---|
| **P1** klien `requestSmbSync` + pemetaan galat | **Terbukti simulasi** | `POST /<phone_number_id>/smb_app_data`, badan `{messaging_product, sync_type}` — **diverifikasi dari halaman resmi onboarding** (dibaca 26 Nov 2026). Halaman rujukan Graph `smb_app_data` **tidak terbaca** (404) → daftar kode galat khusus endpoint = **BELUM TERVERIFIKASI** (galat dipetakan umum; tak dikenal = gagal tanpa ulang). Timeout/jaringan/5xx/respons tak dikenal = **belum pasti**; 2xx tanpa `request_id` **tidak** dianggap diterima |
| **P2** "sekali saja" + jendela 24 jam + prasyarat a–j + audit | **Terbukti simulasi** | Migrasi **0006** (expand-only): `channel_connections.coexistence_onboarded_*`, `smb_sync_requests`. Izin baru `integration.history_sync` (hanya Super Admin + sesi 2FA penuh, bercakupan channel); flag `history_sync`. Waktu onboarding = **isian admin "dinyatakan admin"** — **tidak ada** sumber resmi (webhook `account_update` tidak memuatnya). Penyelesaian manual teraudit untuk hasil tidak pasti |
| **P3** webhook kontak + history | **Terbukti simulasi** | `smb_app_state_sync`: satu event per kontak → kontak/nama dibuat **tanpa percakapan**, `remove` tidak menghapus, mode uji hanya daftar uji, payload dibuang. `history`: fase 0/1/2 + chunk tidak berurutan + progres (tidak turun), 2593109 → "pemilik bisnis menolak berbagi riwayat", **BSUID (F1-03)** dengan identitas hanya dari bukti thread yang sama (bertentangan/bentrok → karantina), arah tak pasti → karantina, aset media terpisah **tidak diproses** (karantina beralasan). History/kontak **tidak** memicu otomatisasi/unread/label/follow-up |
| **P4** UI panel "Sinkronisasi riwayat" | **Dibuat; terbukti di E2E simulasi** | Sisa jendela, prasyarat a–j per langkah, konfirmasi ganda (2 centang + ketik nama channel), status permintaan jujur ("diterima Meta", tidak pernah "berhasil"), penyelesaian manual, progres/jumlah data nyata. Flag mati → "Belum tersedia" |
| **P5** mock Graph + Golden E2E G2 | **Terbukti simulasi** | Endpoint `smb_app_data` (+ mode galat/tahan) dan kontrol E2E; satu alur E2E: Step 1 → webhook kontak → Step 2 → history fase 2/0/1 → 0 otomatisasi/unread; klik ganda → satu panggilan; di luar jendela → ditolak |
| **P6 (F2-01)** `backup.sh` mode Docker | **Terbukti simulasi** (`docker` tiruan + gpg nyata); perilaku terhadap Docker/PostgreSQL di VPS **belum diuji** | `BACKUP_VIA_DOCKER=1`; keluaran **berformat sama**; rahasia tidak lewat argumen; gagal → tidak ada set parsial. Langkah operator di §12 |
| Pembuktian **nyata** (M-12) | **Belum dibuat/diuji** | Butuh nomor uji bersih di-onboard baru + Step 1/2 dalam 24 jam (`prosedur-uji-m11-m12.md` §7, Opsi H3) |

## 4. Hasil pengujian
- **Simulasi:** `bash scripts/verify-all.sh` pada commit terakhir PR (ringkasan 11 langkah ditempel di deskripsi PR): lint · typecheck · guard · secret scan · gitleaks · npm audit · build · Vitest **524/0 gagal/0 dilewati** · E2E **10 lulus** + 7 placeholder "BELUM TERSEDIA" (bukan bukti) · penjaga akhir · drill backup/restore.
- **CI GitHub:** tautan run dan hasil 4 job (Lint·Typecheck·Guard·Secret scan; Build·Test regresi·E2E; Drill backup & restore nyata; Image Docker) dicatat di deskripsi PR.
- **Uji mutasi (manual, tiap butir; skrip pemulih berkas asli):** P1 8 · P2 17 · P3 19 · P6 8 = **52 mutan Vitest, semua tertangkap** (dua mutan P3 sempat **lolos** → tes diperkuat → tertangkap) + 2 mutan E2E (jendela diabaikan: tertangkap; pemeriksaan "sekali" pada lapis pertama: setara secara E2E karena dilapisi UPDATE bersyarat + UNIQUE database — kedua lapis sekaligus dilepas = tertangkap di P2). Satu cacat **nyata** ditemukan tes migrasi sebelum merge: CHECK `coexistence_onboarded_*` meloloskan "waktu tanpa sumber" karena `NULL` lolos CHECK → diperbaiki (`IS NOT NULL`) sebelum commit pertama migrasi.
- **Nyata: tidak ada** (tanpa akses Meta/staging). **Belum dapat diuji:** panggilan ke Graph `smb_app_data` nyata, bentuk webhook `smb_app_state_sync`/`history` pada akun nyata, `backup.sh` Docker di VPS.

## 5. CCP
Tidak ada CCP baru. **CCP 2.9 (history) tetap belum terpenuhi nyata**; yang berubah: kini **dapat** diamati (ada pemicu). Regresi CCP 1.1–1.9, 2.1–2.10, 3.x (simulasi) lulus.

## 6. Regresi (jumlah test sebelum → sesudah)
Vitest: `@tahap-1` 180 → 180 · `@tahap-2` 166 → **258** (+92) · `@tahap-3` 86 → 86 · total 432 → **524**. E2E: `@tahap-2` 3 → 4. `tests/baseline-counts.json` hanya naik. Tidak ada test dihapus/di-skip/dilemahkan; dua asersi diperbarui **mengikuti migrasi baru** (daftar jurnal + jumlah migrasi 6 → 7) dan tes guard diberi penanda `guard-operational:allow` pada baris yang SENGAJA menguji penolakan channel operasional.

## 7. Database dan migrasi
**0006** (maju saja, expand-only): 3 kolom nullable tanpa default pada `channel_connections` + CHECK; tabel `smb_sync_requests` (UNIQUE `smb_sync_requests_once`, CHECK jenis/status/galat/penyelesaian). Diuji pada **DB kosong** dan **snapshot 0000–0005 + data contoh** (0 kehilangan data; pengaman tahap lalu tetap berlaku; peran aplikasi dapat memakai tabel baru; diulang = idempoten). Tidak ada perubahan destruktif.

## 8. Environment
Development: semua di atas. **Staging: TIDAK diubah**; tidak ada flag yang dinyalakan di lingkungan mana pun (E2E menyalakan `history_sync` hanya di DB E2E sekali pakai lalu mematikannya). Production: belum ada. Tidak ada panggilan ke Meta asli.

## 9. Temuan
| ID | Prio | Dampak / bukti | Tindakan · PJ · status |
|---|---|---|---|
| S-12 | tinggi | TE One tak punya pemicu sinkronisasi | **Ditutup untuk kode (simulasi)**; tertutup penuh setelah M-12 nyata · developer/pemilik |
| F1-03 | rendah | `history` belum mendukung BSUID | **Ditutup (simulasi)**: `context.user_id`/`from_user_id`, identitas hanya dari thread yang sama |
| S12-01 | sedang | **Waktu onboarding tidak dapat diketahui sendiri** (tidak ada webhook/sumber resmi); isian admin bisa salah | Disimpan sebagai "dinyatakan admin", batas aman 30 menit, tak dapat diubah setelah ada permintaan · pemilik mencatat jam saat onboarding · V-9 terbuka |
| S12-02 | sedang | Daftar kode galat `smb_app_data` **BELUM TERVERIFIKASI** (halaman rujukan tak terbaca) | Gagal-aman (tak dikenal = gagal tanpa ulang; bentuk respons divalidasi) · baca ulang saat akses · developer |
| S12-03 | rendah | Webhook aset media riwayat (≤ 14 hari) **tidak diproses** (media riwayat tidak diunduh di Tahap 2) | Dikarantina beralasan khusus; tampil sebagai "tanpa media" · fitur media riwayat = di luar lingkup |
| S12-04 | rendah | `backup.sh` Docker menyertakan pg_dump versi **kontainer**; restore butuh pg_restore ≥ versi itu | Dicatat di header skrip · operator menguji restore (§12) |
| S12-05 | info | Webhook `account_update` `ACCOUNT_RECONNECTED` mungkin dapat menjadi sumber jam onboarding ulang | Tidak dipakai (belum teramati nyata) · evaluasi saat M-12 |

## 10. Asumsi/keputusan yang dipakai
D-03 (nomor uji …6319, channel Kemitraan Uji) **Diputuskan** — dipakai hanya sebagai aturan mode uji; **…6319 tidak boleh** dipakai untuk M-12 (chat nyata, jendela lewat). D-04/D-14 (Admisi live 15 Jan 2027; urutan Kemitraan → Admisi → Hotline) **tidak diubah**. D-05, D-16, D-22 tetap seperti sebelumnya. **Kontrak inti §6 tidak berubah** — sinkronisasi menambah jalur masuk `history`/kontak, bukan mengubah aturan #3 ⇒ **ADR tidak diperlukan**.

## 11. Bukti nomor operasional dan Halo AI tidak diubah
Guard nomor operasional lulus; channel bertanda operasional **ditolak** server tanpa memanggil Meta (tes); semua data sintetis; tidak ada akses/panggilan ke Meta, Admisi (…1119), Hotline (…0124), atau Halo AI; secret scan + gitleaks lulus.

## 12. Prasyarat tahap berikutnya
**Arah M-12 nyata dipilih pemilik (26 Nov, pernyataan di sesi): opsi (a)** — bukan persetujuan eksekusi (formulir A-3 kosong; butuh PR ini diaudit + di-merge, image terpasang oleh operator, nomor uji bersih, dan persetujuan tertulis terpisah). Pilihan yang ditawarkan: (a) **nomor uji bersih di-onboard baru + Step 1/2 dari TE One dalam 24 jam — disarankan** (`prosedur-uji-m11-m12.md` Opsi H3); (b) saat onboarding Admisi (Tahap 9) — **berisiko, hanya sekali**. Untuk (a): subscribe `history`, `smb_app_state_sync`, `smb_message_echoes` **sebelum** onboarding; catat jam onboarding; operator menyalakan `history_sync` hanya setelah keputusan tertulis.
**Operator (F2-01; `runbook-fase-2-operator.md` tidak ada di `main`, jadi dicatat di sini; tidak mengubah server):** `BACKUP_VIA_DOCKER=1 BACKUP_DB_CONTAINER=<db> BACKUP_APP_CONTAINER=<app> MEDIA_DIR=/data/media PGDATABASE=<db> PGUSER=<user> [PGPASSWORD dari berkas env] BACKUP_PASSPHRASE_FILE=… BACKUP_DIR=… bash scripts/backup.sh` (atau lewat `backup-rotate.sh`); lalu **uji restore** ke database terpisah dengan `scripts/restore.sh` dan cocokkan `.sha256`. Nama kontainer: `docker ps` (proyek `deploy`).
**Audit independen** atas PR ini sebelum merge.
