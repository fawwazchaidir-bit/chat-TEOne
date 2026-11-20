# ADR-0006 — Perbaikan audit independen Gate 2: bukti identitas & waktu, kelayakan otomatisasi, versi pemetaan, bukti koneksi, `diproses` tertahan

- **Status:** Diusulkan · menunggu persetujuan pemilik · berasal dari temuan **G2-A01…A06** audit independen Gate 2 (`docs/gates/gate-2.md`; rekomendasi auditor **TAHAN**)
- **Tahap:** 2 (kontrak inti #2, #3, #5, #6 AGENTS.md §6 diperketat, **tidak diubah artinya**; Tahap 2 belum diterima sehingga kontraknya belum dibekukan)

## Konteks
Audit menemukan empat temuan **tinggi** dan dua **sedang** pada konektor: identitas dua pelanggan dapat tercampur (A01), jendela layanan dapat dibuka tanpa bukti waktu pesan (A02), pesan history yang kemudian
datang sebagai event langsung dapat memicu otomatisasi (A03), hasil verifikasi dapat dicatat pada pemetaan yang sudah berubah (A04), status "terverifikasi" disalahartikan sebagai siap menerima pesan (A05), dan pesan keluar
`diproses` dapat tertahan setelah proses mati (A06). A07 (bukti nyata Meta/coexistence belum ada) **tidak dapat diselesaikan dengan kode** dan tetap terbuka.

## Keputusan

### A01 — identitas hanya digabung bila terbukti dari payload
- Entri `contacts[]` dikaitkan ke pesan **hanya** bila `wa_id` entri = `from` pesan, atau `user_id` entri = `user_id` pesan, dan entri itu tidak bertentangan dengan pengenal lain pada pesan; entri ambigu ditolak. **Tidak ada lagi fallback ke `contacts[0]`.** Nama profil hanya dari entri yang terbukti.
- Ingest **memvalidasi ulang** (`contactMatchesMessage`) — event lama di antrean yang dinormalisasi sebelum perbaikan tetap aman.
- `upsertContact`: bila identitas dalam satu permintaan menunjuk ≥ 2 kontak **berbeda** → `IdentityConflictError` → event **dikarantina** `identitas_bentrok` (payload dipertahankan untuk ditinjau, dibatasi retensi; tidak ada kontak/pesan/identitas ditulis; audit tanpa nomor). Tidak ada penggabungan otomatis.
- Pemulihan: `detachIdentity` + CLI `npm run contacts:repair` (`list-multi`, `detach <id>`; diaudit). **Batasan jujur:** pesan tidak menyimpan identitas pengirim, jadi percakapan yang sudah tercampur tidak dapat dipisah otomatis; belum ada penggabungan (merge) kontak.

### A02 — waktu kedatangan ≠ waktu pesan
- `provenCustomerTime(ts)`: hanya cap waktu provider yang sah (ada, terbaca, tidak di masa depan melebihi toleransi 5 menit) yang boleh menjadi **dasar jendela** (`last_customer_message_at`). Selain itu pesan **tetap disimpan** (dengan `received_at` terpisah), `last_message_at` (urutan tampilan) memakai waktu kedatangan, tetapi **dasar jendela tidak diperbarui** → kirim bebas diblokir.
- Jendela **diperiksa ulang tepat sebelum panggilan kirim** (setelah unggah media/limiter): tertutup → `gagal` pasti (`jendela_layanan`), tanpa panggilan ke Meta.

### A03 — pembaruan data ≠ kelayakan otomatisasi
- Penggolongan ulang history→langsung memperbarui **data** (sumber, isi, waktu provider) tetapi **bukan** "pesan baru". Hook otomatisasi dipancarkan hanya bila `automationEligible`: waktu pesan **terbukti** dan umur ≤ `AUTOMATION_MAX_AGE_MS` (**10 menit — ASUMSI teknis konservatif**, belum ada keputusan bisnis; Tahap 3/4 menentukan dan mengikatnya ke "batas pesan layak diproses", kontrak inti #4). Ketidakpastian ⇒ tidak layak (AGENTS.md §8).
- Berlaku sama untuk pesan langsung biasa yang sangat terlambat atau tanpa cap waktu: tersimpan dan (bila terbukti) membuka jendela, **tidak** memicu otomatisasi.
- **Keputusan desain yang perlu dinilai pemilik:** event langsung yang menggolongkan ulang salinan history **dengan cap waktu terbukti ≤ 24 jam** membuka jendela (event langsung dari Meta adalah bukti pelanggan menulis pada waktu itu); spesifikasi §10 mengatakan "history tidak dihitung" — history **murni** tetap tidak dihitung.
- **Keterbatasan:** hook berjalan **dalam memori** setelah commit; event dapat hilang bila proses mati di antaranya (T2-F15). **Wajib** dipindah ke desain durable (outbox) sebelum ada subscriber otomatisasi yang mengirim pesan (Tahap 3–6).

### A04 — optimistic concurrency pada verifikasi
Migrasi `0003`: `channel_connections.mapping_version` (naik tiap pemetaan berubah) dan `mapping_changed_at`. Hasil verifikasi hanya ditulis `WHERE mapping_version = <versi yang diperiksa>`; bila berubah → hasil **dibuang**, audit `denied (stale)`, API **409 `MAPPING_CHANGED`**. Menyimpan pemetaan yang sama tidak menaikkan versi.

### A05 — tiga bukti terpisah, "siap" hanya bila ketiganya ada
`verified`/status "terverifikasi" = **pemetaan nomor** saja (UI diberi label itu). Ditambah: **langganan webhook** (`terkonfirmasi` | `ada_aplikasi_tidak_dipastikan` | `aplikasi_lain` | `tidak_berlangganan` | `tidak_diketahui`; konfirmasi butuh `META_APP_ID` opsional) dan **event benar-benar diterima** sejak pemetaan terakhir berubah.
`readiness = siap_menerima` hanya bila pemetaan **NYATA** (bukan mock) + langganan **terkonfirmasi** + ≥ 1 event diterima; selain itu "Belum terbukti siap" beserta alasannya. Bentuk `subscribed_apps` (`whatsapp_business_api_data.id`) **BELUM TERVERIFIKASI** ke dokumentasi Meta.

### A06 — `diproses` yang tertahan
Pemeliharaan worker (`reconcileUncertain` → `expireStaleProcessing`) menandai `diproses` tanpa ID provider yang lebih tua dari `max(120 dtk, 4 × META_HTTP_TIMEOUT_MS)` sebagai **`belum_pasti`** (`proses_terhenti`), teraudit, UPDATE bersyarat (dua pekerja aman). **Tidak pernah mengirim ulang.** Penyelesaian: status webhook via kunci idempotensi, atau manual teraudit. Penyelesaian pengirim yang lambat (bukan mati) tetap diterima (`settle` kini menerima `belum_pasti` tanpa ID provider).

## Pengujian (SIMULASI)
`tests/integration/tahap2-gate2.test.ts` — **35 test** `@tahap-2` (identitas multi-kontak/hilang/bentrok/lintas channel/event lama/pemulihan; timestamp kosong-rusak-masa depan-lama; cek ulang jendela; history↔langsung lama/baru; restart; balapan verifikasi; tiga bukti; crash sebelum/sesudah panggilan, dua pekerja, pengirim lambat).
**Uji mutasi:** 15 mutan (fallback `contacts[0]`, tanpa validasi ulang, konflik diabaikan, waktu kedatangan jadi dasar jendela, tanpa cek ulang jendela, cap waktu masa depan dianggap bukti, hook selalu menyala, tanpa batas umur, tanpa syarat versi, versi tak naik, readiness mengabaikan simulasi/event, langganan "ada" = terkonfirmasi, penyapu mati, settle hanya dari `diproses`) — **semuanya terdeteksi** (≥ 1 test gagal).

## Dampak pada test lama (transparansi, AGENTS.md §10.2)
Disesuaikan karena perilaku memang berubah, **tanpa melonggarkan**: daftar migrasi kini 4 (`tahap2-migration-retention`, +pemeriksaan kolom 0003); alasan blokir untuk pesan bercap waktu masa depan kini `belum_ada_pesan_pelanggan` (data tidak sah tidak lagi dicatat) dengan pemeriksaan pertahanan-berlapis untuk baris DB tak sah; hasil `reconcileUncertain` memuat `expired`;
test history↔langsung yang dipersoalkan auditor (`tahap2-messages`, cap waktu 60–120 dtk) **tidak diubah** dan tetap lulus karena bukti waktunya segar; skenario lama/tak terbukti ditambahkan sebagai test baru; assertion audit di beberapa test Tahap 2 disaring per objek karena `audit_log` append-only tidak di-reset antar test (menghilangkan ketergantungan pada urutan berkas — kerapuhan yang ditemukan saat pekerjaan ini).

## Konsekuensi
- Migrasi `0003` additive (maju-saja; diuji pada DB kosong dan snapshot data Tahap 1).
- Aplikasi baru yang menerima pesan nyata **tidak** akan menandai kanal "siap" sampai ketiga bukti ada — perilaku yang disengaja.
- Variabel baru opsional `META_APP_ID` (bukan rahasia).
- Event yang dikarantina `identitas_bentrok` **tidak dapat diproses ulang** lewat alat uji sampai ada keputusan penggabungan/pemisahan kontak (fitur belum dibangun).
