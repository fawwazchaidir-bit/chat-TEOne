# Tindak lanjut Gate 2 — tanggapan pembangun atas audit independen

> **Ditulis oleh PEMBANGUN, bukan auditor.** Tidak mengubah isi/rekomendasi audit (`docs/gates/gate-2.md`: **TAHAN**) dan **bukan** keputusan gate. Formulir keputusan pemilik **tidak diisi**; tag `tahap-2-diterima`
> dan backup titik-kembali **tidak dibuat**. Semua status adalah klaim pembangun yang **harus diverifikasi ulang auditor** pada commit perbaikan. Semua bukti di bawah adalah **SIMULASI** (mock Graph + fixture sintetis);
> **tidak ada** uji nyata Meta/coexistence (G2-A07).

## Ringkasan
| ID | Prioritas (auditor) | Tanggapan | Status menurut pembangun |
|---|---|---|---|
| G2-A01 | Tinggi | Identitas hanya digabung bila terbukti; konflik → karantina; validasi ulang event lama; pemulihan terkontrol | **Diperbaiki — menunggu verifikasi auditor** |
| G2-A02 | Tinggi | Dasar jendela hanya dari waktu pesan terbukti; waktu diterima terpisah; cek ulang jendela sebelum kirim | **Diperbaiki — menunggu verifikasi auditor** |
| G2-A03 | Tinggi | Pembaruan data dipisah dari kelayakan otomatisasi (bukti waktu + umur); keterbatasan hook in-memory dicatat | **Diperbaiki sebagian** — hook durable (outbox) **belum** (T2-F15), wajib sebelum subscriber mengirim |
| G2-A04 | Tinggi | Optimistic concurrency (`mapping_version`) + 409 `MAPPING_CHANGED` | **Diperbaiki — menunggu verifikasi auditor** |
| G2-A05 | Sedang | Tiga bukti terpisah; "siap" hanya bila nyata + langganan terkonfirmasi + event diterima | **Diperbaiki — menunggu verifikasi auditor** (bentuk `subscribed_apps` belum terverifikasi ke Meta) |
| G2-A06 | Sedang | `diproses` kedaluwarsa → `belum_pasti`, tanpa retry; penyelesaian pengirim lambat tetap sah | **Diperbaiki — menunggu verifikasi auditor** |
| G2-A07 | Tinggi | Bukti nyata Meta/coexistence & prasyarat Gate 1 | **Terbuka — tidak dapat dikerjakan dengan kode** (butuh akses Meta, nomor uji, staging, keputusan pemilik) |

Rincian keputusan teknis: [ADR-0006](../adr/0006-perbaikan-audit-gate-2.md).

## Konfirmasi dan bukti per temuan
**Catatan metodologi:** auditor menyimpulkan efek DB "dari kode"; pembangun mengonfirmasi tiap temuan dengan membaca kode, lalu **mengunci setiap skenario dengan test integrasi pada PostgreSQL 16 sungguhan** dan membuktikan test itu menangkap masalahnya lewat uji mutasi (mutan = perilaku lama/rusak → test gagal). Pembangun **tidak** menjalankan reproduksi gagal pada kode sebelum perbaikan secara terpisah.
Seluruhnya di `tests/integration/tahap2-gate2.test.ts` (**35 test**, tag `@tahap-2`). **Uji mutasi: 15 mutan, semuanya terdeteksi.**

### G2-A01 — identitas tercampur (Tinggi)
- **Konfirmasi:** benar — `contacts[0]` dipakai sebagai fallback; ingest menggabungkan `from` dengan `user_id` entri yang tak terkait.
- **Perbaikan:** `pickContact`/`contactMatchesMessage` (tanpa fallback; ambigu & bertentangan ditolak); validasi ulang di ingest (event lama); `IdentityConflictError` → karantina `identitas_bentrok` (payload dipertahankan, audit tanpa nomor, tidak ada penulisan); `detachIdentity` + `npm run contacts:repair` (`list-multi`, `detach`; diaudit; diuji manual pada DB uji).
- **Uji yang diminta auditor:** multi-kontak ✔ · kontak hilang ✔ · user_id bentrok ✔ · channel berbeda ✔ · kasus audit end-to-end (from=A, contacts hanya B) ✔ · event lama di antrean ✔ · pemulihan ✔.
- **Batasan jujur:** data yang **sudah** tercampur tidak dapat dipisah otomatis (pesan tidak menyimpan identitas pengirim) dan belum ada penggabungan kontak. Tidak ada data nyata yang diketahui terdampak (tidak pernah ada koneksi Meta nyata).

### G2-A02 — timestamp hilang membuka jendela (Tinggi)
- **Konfirmasi:** benar — waktu kedatangan dipakai sebagai dasar jendela bila cap waktu tak ada; cap waktu masa depan juga memperpanjang jendela.
- **Perbaikan:** `provenCustomerTime`; dasar jendela hanya diperbarui dengan waktu terbukti; `received_at` terpisah; cek ulang jendela tepat sebelum kirim (kontrak #6).
- **Uji:** tanpa/kosong/rusak/masa depan ✔ · kirim ulang tertunda > 24 jam ✔ · pesan tak terbukti tidak memperpanjang jendela ✔ · jendela tertutup saat unggah media berjalan ✔ (0 panggilan kirim).

### G2-A03 — history → langsung memicu hook (Tinggi)
- **Konfirmasi:** benar — penggolongan ulang mengembalikan `inserted:true` sehingga jendela dan hook berjalan tanpa bukti umur.
- **Perbaikan:** `insertMessage` mengembalikan `reclassified` (bukan `inserted`); kelayakan = bukti waktu + umur ≤ `AUTOMATION_MAX_AGE_MS` (10 menit, **ASUMSI**); berlaku juga untuk pesan langsung biasa yang sangat terlambat.
- **Uji:** history→langsung baru (hook tepat sekali) ✔ · lama ✔ · tanpa cap waktu ✔ · langsung→history ✔ · langsung sangat terlambat ✔ · duplikat setelah "restart" ✔ · ingest dua transaksi ✔ · subscriber tiruan (`onCustomerMessage`) ✔.
- ****[Pembaruan 25 Nov 2026 — kode terbaru]** Hook kini lewat **outbox durable** (`domain_outbox`, ADR-0008; at-least-once, idempoten, uji crash/lease/backoff/failed — **simulasi**). Teks di atas dipertahankan sebagai catatan historis sesuai kondisi saat itu.**
- **Belum selesai (jujur, kondisi saat itu):** hook masih **dalam memori**; pemancaran durable (outbox) harus dirancang sebelum Tahap 3–6 menyambungkan otomatisasi → **T2-F15**. Ambang 10 menit dan keputusan bahwa event langsung bercap waktu terbukti ≤ 24 jam membuka jendela perlu **disetujui pemilik/Tahap 3–4**.

### G2-A04 — balapan verifikasi (Tinggi)
- **Konfirmasi:** benar sebagai analisis interleaving; kini **dikunci** dengan mock yang dapat menahan permintaan (`mock.hold("phone")`): mutan tanpa syarat versi → test gagal.
- **Perbaikan:** migrasi `0003` (`mapping_version`, `mapping_changed_at`); UPDATE bersyarat; 409 `MAPPING_CHANGED`; audit `denied`.
- **Uji:** A→B saat verifikasi A ✔ · menyimpan pemetaan sama tidak menaikkan versi ✔ · dua verifikasi bersamaan ✔ · pemeriksaan ulang B ✔.

### G2-A05 — "terverifikasi" menyesatkan (Sedang)
- **Konfirmasi:** benar — `verified` hanya = pemetaan nomor; test lama sengaja menerima `webhookSubscribed=false`.
- **Perbaikan:** tiga bukti terpisah (pemetaan · langganan webhook · event diterima) + `readiness`; UI dilabeli ulang ("Pemetaan nomor terverifikasi"; "Belum terbukti siap menerima pesan"); `META_APP_ID` opsional untuk mengonfirmasi aplikasi yang benar.
- **Uji:** 5 keadaan langganan (terkonfirmasi / aplikasi lain / tak dipastikan / tidak berlangganan / tak diketahui) ✔ · simulasi tidak pernah "siap" ✔ · event sebelum perubahan pemetaan tidak dihitung ✔ · `computeReadiness` ✔ · E2E UI ✔.
- **Belum terbukti:** bentuk respons `subscribed_apps` nyata dan "event uji benar-benar diterima" pada Meta asli.

### G2-A06 — `diproses` tertahan (Sedang)
- **Konfirmasi:** benar — rekonsiliasi dan penyelesaian manual hanya melihat `belum_pasti`.
- **Perbaikan:** `expireStaleProcessing` (ambang `max(120 dtk, 4×timeout)`), dipanggil `reconcileUncertain`/worker; `settle` menerima hasil pengirim yang lambat; tanpa retry.
- **Uji:** crash sebelum panggilan ✔ (0 panggilan, bisa diselesaikan manual) · yang baru tidak disentuh ✔ · crash sesudah Meta menerima (status webhook via kunci idempotensi, dua urutan) ✔ · dua pekerja ✔ · pengirim lambat ✔.

### G2-A07 — bukti nyata & prasyarat Gate 1 (Tinggi)
Tidak ada perubahan: uji nyata Meta/coexistence, echo nyata, G2 nyata, staging HTTPS, image/compose, backup offsite, keputusan D-01/D-02/D-03/D-12/D-18, tag/backup Gate 1 menunggu **pemilik/infrastruktur**. Panduan: `docs/tahap-2/panduan-uji-nomor-uji.md`.

## Hubungan dengan Gate 1 (catatan auditor)
- **G1-A03:** auditor mencatat run `44823965100` bukan HEAD `e7b9c4e`. Untuk commit perbaikan Gate 2 `e2ea136` ada run push #8 hijau (lihat di bawah); auditor sebaiknya tetap menjalankan `workflow_dispatch` pada commit akhir yang dinilai.
- G1-A02/A04/A05 tetap menunggu lingkungan auditor/pemilik/infrastruktur (lihat `gate-1-tindak-lanjut.md`).

## Verifikasi pembangun (BUKAN independen)
`bash scripts/verify-all.sh` pada working tree perbaikan (Node 22.23.5, PostgreSQL 16.15, Chromium, gitleaks 8.24.3): lint ✔ · typecheck ✔ · guard operasional ✔ · secret scan ✔ · gitleaks riwayat ✔ · `npm audit --omit=dev` ✔ · build ✔ ·
Vitest (`test:report`) ✔ **281 test, 0 gagal, 0 dilewati** (`@tahap-1` 143 · `@tahap-2` 138), exit code Vitest 0 tercatat · E2E ✔ 6 lulus + 7 placeholder · penjaga akhir ✔ · drill backup/restore ✔ (4 migrasi) — **11/11 langkah LULUS**.

**Hasil CI GitHub pada commit perbaikan `e2ea136`** — run push [#8 `44833343168`](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44833343168): **3 job sukses** (Lint·Typecheck·Guard·Secret scan termasuk gitleaks seluruh riwayat; Build·Test regresi·E2E; Drill backup & restore), dibaca dari API dan log job Build·Test·E2E (`136623534603`):
- `node scripts/run-test-report.mjs`: `| @tahap-1 | 143 | 0 | 143 | 143 / 3 |`, `| @tahap-2 | 138 | 0 | 138 | 138 / 3 |`, `Vitest: 281 test, 0 gagal, 0 dilewati`, "Tidak ada masalah";
- Golden E2E: `6 passed`, `7 skipped` (placeholder resmi); penjaga akhir `--require-e2e`: `@tahap-1 | 143 | 3 | 146`, `@tahap-2 | 138 | 3 | 141`, "Tidak ada masalah".
**Batas pernyataan:** bukti CI pembangun; bukan verifikasi independen. Dokumen ini di-commit sesudahnya (commit baru) — auditor sebaiknya memicu `workflow_dispatch` pada commit akhir yang dinilai.

## Syarat audit ulang (dari auditor) — status pembangun
| # | Syarat | Status |
|---|---|---|
| 1 | Perbaiki G2-A01–A04 + test integrasi + A05–A06 | **Dikerjakan** (di atas) |
| 2 | Jalankan lint, typecheck, build, scan riwayat, guard, seluruh test Gate 1–2, G1/G2 simulasi, drill DB (snapshot & kosong) pada commit yang sama; tautan run + commit | **Sebagian** — `verify-all.sh` oleh pembangun; **auditor menjalankan ulang**; run CI dicatat setelah push |
| 3 | Audit ulang Gate 1, keputusan pemilik, tag & backup | **Menunggu pemilik/auditor** |
| 4 | Staging, HTTPS, backup DB+media, akses Meta, nomor uji, D-01/02/03, retensi; uji nyata echo/history/kirim-terima/coexistence | **Menunggu pemilik/infrastruktur** |
| 5 | Penilaian ulang CCP + keputusan gate | **Hak auditor dan pemilik** |
