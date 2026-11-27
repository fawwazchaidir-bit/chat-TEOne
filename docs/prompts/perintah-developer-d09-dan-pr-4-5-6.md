# Perintah developer — D-09 (provider & model AI) dan persiapan audit PR #4, #5, #6

Disusun auditor, 27 Nov 2026, setelah PR #7 di-merge (`main` = `a02dfe1`). Berlaku semua aturan `AGENTS.md`. Dokumen ini **tidak** memberi izin merge; merge tetap keputusan pemilik setelah audit.

---

## Bagian 1 — D-09: provider & model AI

### 1.1 Pembagian peran
- **D-09 adalah keputusan pemilik**, bukan developer (formulir: `docs/tahap-4/opsi-d09-provider-ai.md` §5). Selama belum ditandatangani di `docs/decisions.md`, developer **tidak boleh** menghubungkan provider AI sungguhan atau mengirim data percakapan ke model.
- Yang boleh dikerjakan developer sekarang: kode di balik feature flag **mati**, diuji dengan provider tiruan (mock). Statusnya **"Dibuat, belum diuji"** atau **"Terbukti simulasi"**.

### 1.2 Usulan isi D-09 untuk ditandatangani pemilik (ASUMSI sampai diputuskan)

| Butir | Usulan | Dasar |
|---|---|---|
| Provider | Anthropic (Claude API) | Model pembanding yang sudah diuji |
| Model utama balasan pelanggan (mode B) | **Claude Haiku 5.5** — `claude-haiku-5-5` | Uji buta 26 Nov (indikatif): 0 sumber tidak sah, eskalasi 96,4%, jawaban benar 91,4%, injeksi 5/5. Lihat `docs/tahap-4/hasil-uji-model.md` |
| Model pembanding di uji final | Claude Sonnet 5.5 — `claude-sonnet-5-5` | Dipakai hanya bila Haiku gagal ambang D-21 lewat API |
| Bila model ragu, gagal, atau melanggar aturan | **Eskalasi ke manusia**, bukan pindah ke model lebih mahal | AGENTS.md §8 |
| Batas biaya | Diisi pemilik: batas per bulan (Rp) dan per percakapan. Saat batas tercapai: AI berhenti, percakapan dieskalasi, admin diberi tahu | D-09 wajib; tidak ada default |
| Data yang dikirim | Sesuai `opsi-d09-provider-ai.md` §4: teks percakapan berjalan (N giliran terakhir) + field Kartu Program/jadwal yang relevan. **Tidak** dikirim: nomor telepon, email, alamat, nomor identitas, media, catatan internal, rahasia | AGENTS.md §8–9, UU PDP |
| Batas konteks | Total input per panggilan **< 100 ribu token** (harga Haiku di atas itu berbeda) | Daftar harga |

> Hasil uji buta dijalankan di antarmuka chat, jadi statusnya **Terbukti simulasi**. Pilihan model baru final setelah uji lewat API (§1.3 butir 6) lulus ambang D-21.

### 1.3 Pekerjaan developer setelah D-09 ditandatangani
Semuanya di balik flag `ai_agent` (atau nama yang setara) dengan default **mati**. Logika provider hanya di adapter provider AI (AGENTS.md §5).

1. **Adapter provider.**
   - Model ID diambil dari konfigurasi per lingkungan, tidak di-hardcode.
   - API key disimpan sebagai rahasia per lingkungan; tidak pernah masuk repo, log, atau laporan.
   - Setiap panggilan mencatat: provider, model, versi konfigurasi, versi sumber (Kartu Program/jadwal), token input/output, dan biaya.
2. **Penjaga biaya** (ditegakkan oleh aplikasi).
   - Menghitung biaya kumulatif per bulan dan per percakapan.
   - Bila batas terlampaui: AI berhenti, percakapan dieskalasi, admin diberi tahu.
   - Penjaga ini tidak pernah menyala kembali sendiri dan terhubung ke kill switch fitur AI.
3. **Minimisasi data sebelum kirim.**
   - Filter yang menghapus atau menyamarkan nomor telepon, email, dan alamat dari teks sebelum dikirim ke model.
   - Unit test dengan data **sintetis**.
4. **Penjaga keluaran sebelum kirim** (server, setelah model menjawab, sebelum pesan keluar):
   - **C01/C02:** setiap `Rp…` dan URL di balasan harus persis sama dengan baris jadwal yang terbuka untuk program itu. Bila tidak sama → **blokir dan eskalasi**.
   - **C16:** blokir balasan yang memuat teks internal: kode `T\d{2}`, `D-\d{2}`, "BELUM DAPAT", nama sheet, nama tag internal.
   - Nomor telepon apa pun di balasan → blokir.
   - Pemeriksaan ulang kondisi terbaru tepat sebelum kirim (AGENTS.md §6.6): status AI, kill switch, jendela layanan.
5. **D-25 — status batch dihitung kode.**
   - Fungsi `statusEfektif(batch, now)`: terbuka hanya bila Status = Buka **dan** cut-off > `now` (zona Asia/Jakarta).
   - Hanya batch yang terbuka yang dikirim ke model.
   - Test batas: cut-off tepat 23.59 WIB, H-1, hari H, Status = Tutup walau cut-off belum lewat, sel `[ISI]`.
6. **Harness uji set (untuk keputusan D-21).**
   - Skrip menjalankan `docs/tahap-4/lembar-uji-buta-chelsea.xlsx` lewat API: **1 soal = 1 panggilan baru**, 3 kali ulang per soal, tanggal simulasi 26 Nov 2026 10.00 WIB.
   - Keluaran: berkas jawaban dengan format sama seperti lembar buta, plus model dan pengaturannya.
   - **Harness tidak boleh membaca `set-uji-ai-chelsea.xlsx`** (kunci jawaban). Penilaian dilakukan auditor.
   - Dijalankan di staging dengan API key staging. Tidak ada pesan ke WhatsApp.
7. **Pengiriman nyata hanya di staging**, hanya ke daftar penerima uji (AGENTS.md §3.6), dan hanya setelah harness lulus.

### 1.4 Kriteria terima (untuk audit Tahap 4)
- Semua test `@tahap-1`…`@tahap-4` hijau. Jumlah test per tag tidak turun.
- Test baru bertag `@tahap-4` untuk butir 2–5 di atas.
- Flag AI default mati. Kill switch fitur AI menghentikan kirim dalam satu siklus worker.
- Harness menghasilkan berkas untuk 3 model × 3 ulangan tanpa membaca kunci.
- Laporan `docs/reports/tahap-4.md` memakai format AGENTS.md §12. Status jujur: nyata, simulasi, atau belum dapat diuji.

---

## Bagian 2 — PR #4, #5, #6: persiapan sebelum diaudit

### 2.1 Pembagian peran
- **Audit dilakukan sesi auditor terpisah**, bukan developer (AGENTS.md §2.6). Tugas developer: membuat setiap PR **siap diaudit** sesuai daftar di bawah, lalu memberi tahu pemilik.
- **Jangan merge sendiri, jangan force push, jangan rebase.** Sinkronkan dengan `git merge origin/main`.

### 2.2 Kondisi saat ini (dicek auditor 27 Nov)
| PR | Branch | Isi | Posisi terhadap `main` |
|---|---|---|---|
| #4 | `tahap-2-s12-sinkronisasi-riwayat` | S-12: pemicu sinkronisasi kontak & riwayat (SMB App Data API), migrasi `0006`, panel UI, webhook history, backup mode Docker | 8 commit di depan, sudah sinkron dengan `main` |
| #5 | `tahap-2-runbook-m12` | **Seluruh isi #4** + `docs/tahap-2/runbook-uji-m12.md` | 51 commit di belakang `main` |
| #6 | `tahap-4-struktur-ai-agent` | **Seluruh isi #4** + struktur Tahap 4: migrasi `0007`–`0008`, ADR-0010/0011, `docs/prompts/tahap-4.md`, test `@tahap-4` | 51 commit di belakang `main` |

**Urutan wajib: #4 → #5 → #6.** #5 dan #6 menumpang di atas #4. Setelah #4 di-merge, developer menjalankan `git merge origin/main` di #5 dan #6 supaya diff keduanya hanya berisi perubahan miliknya sendiri. Barulah keduanya diaudit.

### 2.3 PR #4 — wajib ditambah sebelum audit

**A. Perbaikan G2-B08 (tinggi) — guard nomor operasional**

Masalah: `scripts/guard-operational.mjs` baris 32 memakai `OP_SUFFIX = ["1119", "0124"]`. Nomor operasional sebenarnya berakhiran **…196319** (Admisi) dan **…246319** (Hotline). Akibatnya aturan G2 tidak pernah menangkap kedua nomor itu.

Perbaikan:
1. Ganti menjadi **akhiran 6 digit**: `OP_SUFFIX = ["196319", "246319"]`. **Jangan** memakai 4 digit `6319`, karena nomor Kemitraan …186319 sah dipakai di staging dan akan ikut tertolak.
2. Perbarui komentar di baris 4 dan 10, serta pesan di baris ±55, supaya tidak lagi menyebut "1119/0124" sebagai akhiran.
3. Test bertag `@tahap-1`, dengan nomor sintetis yang hanya meniru akhirannya:
   - nomor berakhiran `196319` → **ditolak** (G2);
   - nomor berakhiran `246319` → **ditolak** (G2);
   - nomor berakhiran `186319` → **lolos**;
   - nomor berakhiran `1119` saja (pola lama) → tidak lagi menjadi syarat. Catat perubahan perilaku ini di laporan.
4. Jalankan guard pada seluruh repo. Hasilnya harus tetap lulus. Bila ada temuan baru di fixture atau seed, ganti datanya; **jangan** melonggarkan guard.
5. Jumlah test `@tahap-1` hanya boleh **naik**. Perbarui baseline.

**B. Yang akan diperiksa auditor di #4** (siapkan buktinya di deskripsi PR)
- Migrasi `0006` hanya maju; diuji pada database kosong **dan** snapshot data tahap 0000–0005.
- Pemicu sinkronisasi ditegakkan **sekali saja** dan dalam **24 jam** di server/database, bukan hanya di UI. Panggilan kedua ditolak walaupun dikirim langsung ke API.
- Event history ditandai dan **tidak** memicu otomatisasi, unread, label, atau follow-up (AGENTS.md §6.3). Ada test-nya.
- Flag fitur default mati. Panel UI menampilkan status jujur: "Belum tersedia" atau "ditolak Meta (131000/10)", bukan "aktif".
- F1-03 (identitas BSUID) dan F2-01 (backup mode Docker) punya test atau bukti.
- Status uji nyata ditulis jujur: impor riwayat nyata **belum dapat diuji** (ditolak Meta), kecuali ada bukti baru.
- Laporan `docs/reports/s12-sinkronisasi-riwayat.md` memakai format AGENTS.md §12.

### 2.4 PR #5 — runbook M-12
- Setelah #4 di-merge: `git merge origin/main`, pastikan diff hanya `docs/tahap-2/runbook-uji-m12.md` (dan dokumen terkait).
- **Wajib diselaraskan dengan koreksi identitas nomor** (`docs/gates/keputusan-pemilik-fase-0-2026-11-26.md` §13 dan §15):
  - runbook tidak boleh menyuruh memakai, menyambungkan, atau menguji …196319 (Admisi) maupun …246319 (Hotline);
  - nomor uji hanya …186319 (Kemitraan/staging) atau nomor uji baru yang bersih;
  - semua nomor ditulis maksimal 6 digit terakhir.
- Judul tetap jujur: "disiapkan, belum dijalankan".

### 2.5 PR #6 — struktur Tahap 4
- Setelah #4 di-merge: `git merge origin/main` (sekarang tertinggal 51 commit). Selesaikan konflik tanpa rebase.
- Migrasi `0007`–`0008`: hanya maju; diuji pada DB kosong dan snapshot `0000`–`0006`. Nomor migrasi tidak boleh bentrok dengan `0006` dari #4.
- **Tanpa perilaku AI:** tidak ada panggilan ke provider sungguhan; izin baru berstatus "Belum tersedia"; flag default mati.
- Selaraskan `docs/prompts/tahap-4.md` dan ADR-0010/0011 dengan keputusan yang sudah masuk `main`:
  - **D-25:** jadwal, harga, dan link hanya dari tabel jadwal. Skema harus punya kolom terstruktur: kode program, kode batch, tanggal mulai/selesai, cut-off bertimestamp WIB, harga, DP, link, status manual.
  - **D-09** masih Terbuka → tulis sebagai **ASUMSI (D-09)**, bukan keputusan.
  - Cek C16 dan C01/C02 (§1.3 butir 4) dicatat sebagai kebutuhan perilaku tahap berikutnya.
- Jumlah test `@tahap-4` dan semua tag sebelumnya tidak turun.

### 2.6 Isi deskripsi setiap PR sebelum minta audit
Mengikuti `.github/pull_request_template.md`:
- Ringkasan dan tahap.
- Checklist §10 diisi jujur. Bila CI gagal karena gangguan runner, sertakan bukti log, jangan hanya "flaky".
- Bukti dipisahkan menjadi **nyata / simulasi / belum dapat diuji**.
- Asumsi D-xx yang dipakai.
- Daftar test baru per tag dan jumlah test sebelum/sesudah.

### 2.7 Opsional: pengerasan CI
Run #117 pada PR #7 gagal di langkah "Pasang Chromium" karena repo apt `packages.microsoft.com` membalas 403 di runner GitHub. Untuk mencegah terulang, tambahkan langkah sebelum `npx playwright install --with-deps chromium` yang menonaktifkan sumber apt Microsoft (mis. menghapus berkas `microsoft-prod.list` di `/etc/apt/sources.list.d/`). Ini bukan syarat audit; bisa digabung di #4.

---

## Ringkasan untuk pemilik
1. **D-09:** pemilik mengisi dan menandatangani formulir (usulan §1.2). Setelah itu developer mengerjakan §1.3.
2. **#4:** developer menambah perbaikan G2-B08 dan bukti §2.3, lalu pemilik meminta audit. Setelah lulus, pemilik merge.
3. **#5 dan #6:** developer menyinkronkan dengan `main` setelah #4 masuk, lalu menyiapkannya sesuai §2.4–2.5. Setelah itu diaudit, satu per satu.
