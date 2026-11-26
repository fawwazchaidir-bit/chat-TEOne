# Perintah pengerjaan — Perbaikan Fase 1 (hasil audit Gate 1 & 2, 25–26 Nov 2026)

> Salin seluruh blok di bawah ke **sesi AI developer baru** (bukan sesi auditor). Sumber: `docs/gates/audit-gate-1-2-2026-11-25.md` §3 dan §6, `docs/gates/keputusan-pemilik-fase-0-2026-11-26.md`.

```
Anda adalah developer TE One. Kerjakan PERBAIKAN FASE 1 hasil audit independen Gate 1 & 2.

Repository : https://github.com/fawwazchaidir-bit/chat-TEOne
Basis      : branch claude/brave-davinci-41pegh (memuat audit + keputusan pemilik terbaru)
Branch kerja: tahap-2-perbaikan-fase-1   (AGENTS.md §2.1)
Keluaran   : SATU Pull Request ke claude/lucid-carson-blf4x0. Jangan merge sendiri. Jangan force push.

Baca dulu: AGENTS.md, docs/decisions.md (D-02, D-03, D-04, D-12, D-18 kini Diputuskan),
docs/gates/audit-gate-1-2-2026-11-25.md, docs/gates/keputusan-pemilik-fase-0-2026-11-26.md,
docs/tahap-2/pemeliharaan-inline-vs-worker.md, docs/tahap-2/verifikasi-dokumentasi-meta-2026-11-26.md.

KERJAKAN (urut prioritas; setiap butir = kode + test bertag @tahap-1/@tahap-2 + uji mutasi singkat):

P1  G2-B03 — pemrosesan inline tidak boleh meninggalkan event `pending`.
    src/modules/conversations-messages/worker.ts kickProcessing(): bila kick dipanggil saat `kicking=true`,
    tandai "ada kerja baru" dan ulangi loop sebelum `kicking=false`; bila batas 10 batch tercapai dan masih
    ada event, jadwalkan kick ulang. Test: event disimpan selama kick berjalan → tetap diproses tanpa webhook
    berikutnya; lonjakan > 200 event → semua diproses.

P2  S-10 / A-4 — worker staging.
    deploy/docker-compose.staging.yml: pastikan service `worker` siap dijalankan (env sama dengan app,
    WORKER_INLINE boleh tetap true di app). Tambah `name: deploy` di puncak compose (R-2, menutup S-06).
    Dokumentasikan perintah: docker compose -p deploy --env-file /etc/teone/staging.env --env-file deploy/.env
    -f deploy/docker-compose.staging.yml up -d --no-deps worker. Test statis: compose punya `name: deploy`
    dan service worker. scripts/worker.ts harus dijalankan minimal sekali di test (saat ini belum pernah):
    satu siklus runMaintenance() + processInboundBatch() lalu keluar bersih.

P3  G2-B04 / S-11 — echo dengan `to_user_id`.
    src/modules/whatsapp-adapter/normalize.ts: baca `to_user_id` (dan contacts[] bila ada) pada
    message_echoes sesuai bentuk resmi di verifikasi-dokumentasi-meta §2–§3. Echo hanya dikarantina bila
    penerima benar-benar tidak dapat ditentukan. Tidak menebak identitas admin. Test: echo dengan `to` saja,
    `to_user_id` saja, keduanya, tidak ada keduanya.

P4  G1-B04 — guard nomor operasional.
    scripts/guard-operational.mjs: tambah aturan G5 untuk hash ID Meta operasional (phone_number_id/WABA ID)
    dari env OPERATIONAL_META_ID_HASHES (secret CI, BUKAN di repo). Tampilkan peringatan jelas di log CI bila
    OPERATIONAL_NUMBER_HASHES / OPERATIONAL_META_ID_HASHES kosong. .github/workflows/ci.yml meneruskan secret
    baru. Test di tests/unit/guards.test.ts.

P5  D-12 (staging) — backup terjadwal.
    scripts/backup.sh dipakai ulang; tambah scripts/backup-rotate.sh: jalankan backup, simpan 7 terakhir,
    lalu salin ke tujuan di luar VPS lewat perintah yang dikonfigurasi env (mis. BACKUP_OFFSITE_CMD), tanpa
    kredensial di repo. Contoh crontab di docs/backup-restore.md. Drill CI tetap lulus; tambah uji rotasi
    (8 backup → 7 tersisa) dan uji "offsite gagal → exit ≠ 0, backup lokal tetap ada".

P6  D-18 (staging) — log.
    deploy/Caddyfile: log akses tanpa body/header sensitif, rotasi ≤ 30 hari (roll_keep_for 720h), tanpa
    mode debug. Retensi payload mentah 30 hari sudah ada (purgeRawPayloads) — pastikan berjalan dari worker.
    Ganti penanda "ASUMSI (D-18)" / "ASUMSI (D-12)" di kode/dokumen menjadi rujukan keputusan bila nilainya
    sama dengan keputusan; bila berbeda, laporkan, jangan ubah diam-diam.

P7  Pembaruan ASUMSI → KEPUTUSAN untuk D-02, D-03 di dokumen tahap-2 (tanpa mengubah perilaku kode).

DI LUAR LINGKUP PR INI (catat di laporan sebagai butir berikutnya, jangan dikerjakan):
- Pemicu sinkronisasi history/kontak (S-12, G2-B01a) → PR terpisah setelah PR ini diterima.
- Rebuild/penggantian image staging, menyalakan worker di server, subscribe field webhook → tugas operator.
- Apa pun yang menyentuh nomor Admisi (…1119), Hotline (…0124), atau Halo AI.

SYARAT SELESAI:
1. bash scripts/verify-all.sh → 11/11 LULUS pada commit terakhir PR; tempel ringkasan .verify/ringkasan.md.
2. CI 4 job hijau pada commit terakhir PR; catat link run.
3. Jumlah test per tag tidak turun; perbarui tests/baseline-counts.json hanya naik.
4. Tidak ada test di-skip/dihapus/dilemahkan. Perubahan kontrak inti (AGENTS.md §6) → wajib ADR.
5. Laporan singkat docs/reports/perbaikan-fase-1.md (format AGENTS.md §12, maksimal ±2 halaman):
   status tiap butir P1–P7 memakai istilah §4, test yang ditambahkan, hasil verify-all + CI.
6. Jangan menulis dokumen tambahan di luar laporan itu dan pembaruan yang diperlukan butir P2/P5/P6/P7.

LARANGAN: tidak membuat tag, tidak mengisi keputusan gate, tidak menyatakan "terbukti nyata",
tidak menaruh rahasia/data pelanggan di repo, log, atau laporan.
```

## Setelah PR selesai (tugas operator, Fase 2)
1. Titik pemulihan (backup DB + media, tag image lama).
2. Rebuild image dari commit PR dengan `scripts/build-staging-image.sh`, `-p deploy`, nyalakan worker.
3. Isi `docs/staging.md` §6; jalankan G1 E2E lewat HTTPS staging.
4. Pasang cron backup + salinan di luar VPS; uji restore; catat artefak teks.
5. Isi secret GitHub `OPERATIONAL_NUMBER_HASHES` dan `OPERATIONAL_META_ID_HASHES`; buat branch `main` + branch protection (4 job CI wajib hijau + persetujuan pemilik).
6. Minta audit ulang singkat Gate 1 di sesi auditor terpisah.
