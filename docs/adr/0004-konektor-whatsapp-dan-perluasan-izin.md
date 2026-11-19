# ADR-0004 — Konektor WhatsApp Cloud API (Tahap 2): keputusan teknis dan perluasan registri izin

- **Status:** Diusulkan · menunggu persetujuan pemilik (AGENTS.md §6: kontrak inti dibekukan setelah tahap pembuatnya diterima; ADR ini mencatat apa yang **ditambahkan**, bukan mengubah kontrak)
- **Tahap:** 2 · Mengimplementasikan ADR-0002 (antrean) dan ADR-0003 (model data)

## Konteks
Tahap 2 menambah konektor resmi Meta WhatsApp Cloud API. Pembangun **tidak** memiliki akses ke aplikasi Meta, token, nomor uji, atau staging HTTPS, dan
host dokumentasi resmi Meta tidak dapat dijangkau dari sesi pembangunan. Semua bentuk payload dan perilaku Meta yang tidak stabil/umum karenanya
**ASUMSI — BELUM TERVERIFIKASI** dan diisolasi di satu tempat (`normalize.ts`, `errors.ts`) agar mudah dikoreksi setelah uji nyata.

## Keputusan

### 1. Registri izin diperluas (bukan diubah)
Ditambahkan satu kunci: **`integration.test`** — "Alat uji integrasi WhatsApp", `channelScoped: true`, `available: true`.
- Tidak ada kunci Tahap 1 yang dihapus atau diubah artinya. Mesin izin (default tolak, deny per-pengguna menang, cakupan channel, anti-eskalasi) tidak berubah.
- Dua test Tahap 1 disesuaikan **tanpa melemahkan**: `permission-engine.test.ts` kini menegaskan 19 kunci awal **tetap ada** (sebelumnya menegaskan jumlah total persis); `architecture.test.ts`
  mengeluarkan `whatsapp-adapter` dari daftar modul terlarang (kini sah) dan menambah modul Tahap 3+ lain (`program-cards`, `knowledge`, `labels`, `templates`, `inbox`) ke daftar; modul yang belum boleh ada tetap terlarang. Perubahan ini tercatat di sini sesuai AGENTS.md §10.2.

### 2. Penyimpanan event masuk = antrean PostgreSQL (ADR-0002)
- `inbound_events`: `UNIQUE(provider, event_key)` → dedup idempoten; status `pending → processing → processed | failed | quarantined`.
- Klaim batch `FOR UPDATE SKIP LOCKED` + **lease** (`locked_until`) → tahan restart, aman >1 worker; gagal → backoff eksponensial, setelah 5 percobaan `failed` (pemrosesan ulang manual lewat alat uji).
- Webhook membalas 200 **hanya setelah** event tersimpan; gagal simpan → 500 (Meta mengirim ulang).
- Pemrosesan + penandaan `processed` dalam **satu transaksi**.

### 3. Identitas & model data (ADR-0003 diimplementasikan)
Tabel baru (migrasi `0002_tahap2_whatsapp_connector`, maju-saja, diuji pada DB kosong dan snapshot data Tahap 1): `channel_connections`, `contacts`, `contact_identities`, `conversations`,
`messages`, `message_status_events`, `media`, `lead_sources`, `inbound_events`, `test_recipients`.
- `UNIQUE(contact_id, channel_id)` pada percakapan; `UNIQUE(provider, identity_type, identity_value, scope)` pada identitas.
- Status pesan **diturunkan dari log** `message_status_events` (tidak bergantung urutan datang): prioritas `dibaca > diterima > gagal > terkirim > diterima_api` (`gagal` kalah hanya oleh bukti penerimaan).
- `messages.provider_message_id` UNIQUE per channel (masuk) dan `idempotency_key` UNIQUE (keluar).

### 4. Pengiriman keluar (kontrak inti #5)
Penerima HARUS ada di `test_recipients` **di semua lingkungan** (alat uji ≠ inbox operasional); kunci idempotensi unik; baris dicatat sebelum memanggil Meta;
`biz_opaque_callback_data` = kunci idempotensi (untuk rekonsiliasi); timeout/jaringan/5xx = **`belum_pasti`**, tanpa retry otomatis; penyelesaian lewat status webhook atau tindakan manual teraudit.

### 5. Mode uji (D-03, ASUMSI)
`channel_connections.test_mode` default **true**. Pada mode uji, event dari/ke pihak di luar daftar uji **dikarantina seminimal mungkin**: payload dibuang, hanya hitungan & alasan tersisa; tidak diproses otomatisasi apa pun (belum ada otomatisasi di Tahap 2); dilaporkan di alat uji.

### 6. Status koneksi jujur
`verification_mode`: `nyata` hanya bila `META_GRAPH_BASE_URL` = `graph.facebook.com`; selain itu `simulasi`. Perubahan pemetaan channel mereset verifikasi.

### 7. Log tidak pernah memuat isi chat
`safeErrorLabel` (nama kelas + kode) menggantikan pencatatan pesan galat — pesan galat driver DB memuat parameter kueri (isi chat) dan terbukti bocor pada uji.

### 8. Versi API Meta
`META_GRAPH_API_VERSION` default **`v23.0` — ASUMSI**, belum diverifikasi sebagai versi didukung/terbaru. Dapat diubah lewat env tanpa rilis.

### 9. Kredensial
Token/secret Meta dibaca dari environment (secret store per lingkungan), **tidak disimpan di database**, tidak pernah dicatat/ditampilkan. Penyimpanan persisten terenkripsi tidak diperlukan pada Tahap 2.

## Asumsi yang dipakai (rujuk `decisions.md`)
- **ASUMSI (D-01)** grup: tidak dicakup (lihat `docs/tahap-2/coexistence.md` §5). **ASUMSI (D-02)** jalur akses belum diputuskan. **ASUMSI (D-03)** nomor uji = Kemitraan, mode uji default aktif. **ASUMSI (D-18)** retensi payload mentah 30 hari.
- Tidak ada keputusan di atas yang dinyatakan final.

## Konsekuensi
- Seluruh fitur di balik feature flag `whatsapp_connector` (default **mati**); saat mati, webhook membalas 404 dan UI menampilkan "Belum tersedia".
- Pembatas kecepatan kirim bersifat **per proses** (satu instans). Untuk >1 instans aplikasi, pindahkan ke database (temuan T2-F10).
- Bila uji nyata menunjukkan bentuk payload berbeda, perubahan terbatas pada `normalize.ts` / `errors.ts` / `client.ts`; skema tidak perlu berubah (tipe identitas dan `inbound_events.payload` bersifat longgar).
