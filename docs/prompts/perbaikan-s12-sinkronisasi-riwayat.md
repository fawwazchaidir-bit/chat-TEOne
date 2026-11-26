# Perintah pengerjaan — PR S-12: pemicu sinkronisasi kontak & riwayat (SMB App Data API)

> Salin blok di bawah ke **sesi AI developer baru** (bukan sesi auditor). Sumber: audit `docs/gates/audit-gate-1-2-2026-11-25.md` (G2-B01), `docs/tahap-2/verifikasi-dokumentasi-meta-2026-11-26.md` (S-12, V-4), `docs/reports/perbaikan-fase-1.md` (F1-03), runbook Fase 2 (F2-01). Gate 1 diterima 26 Nov 2026; Gate 2 belum.

```
Anda adalah developer TE One. Kerjakan PR S-12: pemicu sinkronisasi kontak & riwayat chat WhatsApp
(coexistence) lewat SMB App Data API, beserta F1-03 dan F2-01.

Repository : https://github.com/fawwazchaidir-bit/chat-TEOne
Basis      : main (Gate 1 diterima pada 0463559; ambil main terbaru)
Branch     : tahap-2-s12-sinkronisasi-riwayat   (AGENTS.md §2.1)
Keluaran   : SATU Pull Request ke main. Jangan merge sendiri. Jangan force push. Tanpa tag.

Baca dulu: AGENTS.md (terutama §3, §6, §7, §10), docs/decisions.md, docs/tahap-2/coexistence.md,
docs/tahap-2/verifikasi-dokumentasi-meta-2026-11-26.md (V-1, V-4, S-12), docs/tahap-2/prosedur-uji-m11-m12.md §7,
docs/reports/perbaikan-fase-1.md (F1-03), docs/tahap-2/runbook-fase-2-operator.md (F2-01),
src/modules/whatsapp-adapter/*, src/modules/conversations-messages/ingest.ts.

LATAR (fakta, sudah diverifikasi dari dokumentasi resmi Meta 26 Nov 2026):
- Setelah onboarding coexistence, partner memanggil SMB App Data API: Step 1 = sinkronisasi kontak
  (sync_type "smb_app_state_sync"), Step 2 = sinkronisasi riwayat (sync_type "history").
- Hanya SEKALI, dan hanya dalam 24 JAM setelah onboarding. Field webhook `history` dan `smb_app_state_sync`
  harus sudah di-subscribe SEBELUM pemanggilan. Riwayat = pesan ≤ 180 hari (fase 0/1/2); ID media hanya untuk
  media ≤ 14 hari; bila pemilik bisnis menolak berbagi, webhook `history` membawa galat 2593109.
- TE One saat ini TIDAK punya pemanggil ini (grep smb_app_data kosong) → CCP 2.9 nyata tidak bisa diamati,
  dan riwayat Admisi tidak akan pernah masuk saat go-live 15 Jan 2027 (D-04, D-14).
WAJIB: baca ulang halaman resmi Meta (onboarding-business-app-users, webhooks/reference/history,
dan referensi SMB App Data / smb_app_state_sync) untuk path endpoint, bentuk body, dan bentuk respons PERSIS.
Jangan mengandalkan ingatan. Catat URL + tanggal baca di dokumen. Bila tidak dapat dibaca, tandai
"BELUM TERVERIFIKASI" dan buat kode gagal-aman (tidak memanggil bila bentuk tidak pasti).

KERJAKAN (setiap butir = kode + test bertag @tahap-2 + uji mutasi singkat):

P1  Klien adapter (logika Meta HANYA di whatsapp-adapter).
    requestSmbSync(phoneNumberId, syncType) di client.ts sesuai dokumentasi resmi. Galat Meta dipetakan
    eksplisit (errors.ts), termasuk rate limit. Timeout/jaringan/5xx = HASIL TIDAK PASTI → TIDAK ada retry
    otomatis (semangat kontrak inti #5); permintaan yang sama tidak boleh dikirim dua kali.

P2  Penegakan "sekali saja" + jendela 24 jam (di server, bukan di UI).
    Migrasi maju 0006 (expand-only):
      - channel_connections.coexistence_onboarded_at (timestamptz, nullable) — diisi admin berizin, teraudit.
        Bila ada sumber resmi dari Meta (cek dokumentasi/webhook account_update), pakai itu dan catat; bila tidak,
        isian manual dengan label "dinyatakan admin".
      - tabel smb_sync_requests: channel_id, sync_type, mapping_version, status
        ('diminta'|'diterima_meta'|'gagal'|'belum_pasti'), requested_by, requested_at, kode galat Meta (tanpa payload);
        UNIQUE(channel_id, sync_type, mapping_version) — baris dibuat DALAM TRANSAKSI SEBELUM memanggil Meta.
    Server MENOLAK (tanpa memanggil Meta) bila salah satu tidak terpenuhi:
      a. flag baru `history_sync` (stage 2, default MATI) dan `whatsapp_connector` menyala;
      b. izin aksi baru `integration.history_sync` + cakupan channel; hanya Super Admin dengan sesi 2FA penuh;
      c. kill switch global/channel tidak menyala;
      d. pemetaan channel 'terverifikasi' mode 'nyata' pada mapping_version saat ini;
      e. coexistence_onboarded_at terisi DAN now() ≤ onboarded_at + 24 jam − 30 menit (jam DATABASE);
         tidak diketahui → tolak (gagal-aman);
      f. belum ada baris smb_sync_requests untuk (channel, sync_type, mapping_version);
      g. Step 2 (history) hanya setelah Step 1 (kontak) berstatus 'diterima_meta' (ikuti urutan resmi bila berbeda);
      h. admin mencentang konfirmasi teraudit: "field history & smb_app_state_sync sudah di-subscribe di aplikasi TE One";
      i. channel BUKAN nomor operasional (Admisi/Hotline) sebelum Tahap 9 + GO tertulis (AGENTS.md §3.1):
         tolak bila channel bertanda operasional; di non-production juga wajib test_mode = true.
    Audit setiap percobaan (berhasil/ditolak + alasan), tanpa payload.

P3  Webhook `smb_app_state_sync` (kontak) dan `history`.
    - Kenali event smb_app_state_sync di normalizer (bentuk resmi). Proses kontak: perbarui/isi nama tampilan kontak
      yang sudah ada atau buat kontak baru TANPA percakapan; tidak memicu otomatisasi/unread/label/follow-up.
      Mode uji (test_mode): hanya kontak di daftar penerima uji yang disimpan; sisanya dibuang (tanpa payload).
    - History: pastikan ingest yang ada menangani fase 0/1/2, chunk_order, progress → historyProgress di
      channel_connections (tampil di UI), galat 2593109 → status "pemilik bisnis menolak berbagi riwayat".
      History TIDAK PERNAH memicu otomatisasi, unread, label, atau follow-up (kontrak inti #3, CCP 2.9) — regresi.
      Mode uji: pesan history dari pengirim di luar daftar uji → karantina, payload dibuang (data pelanggan nyata
      tidak boleh tersimpan di non-production, AGENTS.md §3.5).
    - F1-03: dukung BSUID (`user_id` / threads[].id non-nomor) pada history, sama prinsipnya dengan P3 Fase 1
      (echo to_user_id): identitas hanya digabung bila terbukti (kontrak inti #2), tanpa menebak.

P4  UI (halaman Integrasi/Channel), Bahasa Indonesia, jujur:
    panel "Sinkronisasi riwayat" per channel: sisa jendela 24 jam (atau "tidak diketahui"), daftar prasyarat
    a–i dengan status masing-masing, tombol Step 1 dan Step 2 dengan konfirmasi ganda, status permintaan,
    progres history (fase, persen). Flag mati → "Belum tersedia". Tidak ada label "berhasil" tanpa respons Meta.

P5  Mock Graph (tests/helpers/mock-graph.ts + tests/e2e/mock-graph-server.ts): endpoint SMB App Data + event
    webhook kontak/history sintetis. Golden E2E G2 (SIMULASI) diperluas: Step 1 → Step 2 → history masuk →
    0 otomatisasi/unread; klik ganda → satu permintaan; di luar jendela → ditolak.

P6  F2-01: scripts/backup.sh mendukung mode docker exec (mis. BACKUP_VIA_DOCKER=1 dengan nama kontainer DB/app
    lewat env), menghasilkan berkas & .sha256 berformat SAMA dengan sekarang. Drill CI tetap lulus; tambah test
    mode baru (pakai stub docker di PATH). Setelah ini, pembungkus /usr/local/sbin/teone-backup-docker.sh di VPS
    dapat digantikan (catat langkah operator di runbook; jangan ubah server).

TEST MINIMAL (selain di atas): dua permintaan bersamaan → tepat satu panggilan Meta; timeout → belum_pasti, tanpa
retry, tombol terkunci + penyelesaian manual teraudit; jendela 23j29m → boleh, 23j31m → ditolak, onboarded_at
kosong → ditolak; kill switch → ditolak; channel operasional → ditolak; pengguna tanpa 2FA / tanpa cakupan →
403 di API langsung; galat 2593109 → status jujur; history fase 2 tanpa media id → tersimpan tanpa media.

SYARAT SELESAI:
1. bash scripts/verify-all.sh → 11/11 LULUS pada commit terakhir PR; tempel ringkasan di deskripsi PR.
2. CI 4 job hijau; catat link run.
3. Baseline per tag hanya naik; tidak ada test dihapus/di-skip/dilemahkan.
4. Migrasi 0006 diuji pada DB kosong DAN snapshot (test migrasi yang ada).
5. Perubahan kontrak inti? Bila ya → ADR. Sinkronisasi menambah jalur masuk history, bukan mengubah kontrak #3.
6. Dokumen: perbarui docs/tahap-2/coexistence.md (alur Step 1/2, sumber resmi + tanggal), prosedur M-12
   (prosedur-uji-m11-m12.md §7: opsi baru "onboarding nomor uji bersih + Step 1/2 dalam 24 jam"), dan
   laporan singkat docs/reports/s12-sinkronisasi-riwayat.md (format AGENTS.md §12, ±2 halaman).
   Jangan menulis dokumen lain.

LARANGAN: tidak memanggil Meta asli, tidak menyentuh staging/VPS, nomor Admisi/Hotline, atau Halo AI; tidak
menyalakan flag di lingkungan mana pun; tidak menaruh rahasia/data pelanggan di repo/log/laporan; tidak membuat
tag; tidak mengisi keputusan gate; tidak menyatakan "terbukti nyata".
```

## Setelah PR selesai
1. Auditor memverifikasi PR (verify-all independen) sebelum merge.
2. Pemilik memutuskan **cara uji M-12 nyata**: (a) nomor uji bersih yang di-onboard baru — **disarankan**; atau (b) pertama kali saat onboarding Admisi (Tahap 9) — berisiko karena hanya sekali.
3. Untuk (a): siapkan nomor + ponsel bersih (chat sintetis saja), subscribe `history` + `smb_app_state_sync` + `smb_message_echoes` di aplikasi TE One **sebelum** onboarding, catat jam onboarding, lalu jalankan Step 1/2 dari TE One dalam 24 jam.
