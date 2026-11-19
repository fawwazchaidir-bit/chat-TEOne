# Arsitektur konektor WhatsApp dan alur data (Tahap 2)

> Status: **Dibuat dan terbukti simulasi** (mock Graph API + fixture sintetis). **Belum terbukti nyata** terhadap Meta. Lihat `README.md` di folder ini.

## 1. Modul dan batas
| Modul | Tanggung jawab | Boleh mengimpor |
|---|---|---|
| `whatsapp-adapter` | **Satu-satunya** tempat logika Meta: tanda tangan, challenge, normalisasi payload, klien Graph API, kategori galat, rate limiter, penyimpanan antrean event, pemeriksaan koneksi | `db`, `lib`, `audit`, `channels`, `feature-flags` (bukan modul inbox/UI) |
| `contacts` | Kontak + identitas dari provider | `db`, `lib` |
| `conversations-messages` | Percakapan, pesan, ingest idempoten, status, jendela layanan, kirim, media, rekonsiliasi, worker, alat uji | `whatsapp-adapter` lewat `index.ts` |
| Rute `/api/webhooks/whatsapp` | Tipis: validasi → simpan → 200 | adapter + `kickProcessing` |
| Rute `/api/v1/integration/*`, `/api/v1/channels/[id]/connection*`, `/api/v1/media/[id]` | Dibungkus `apiFull/apiSession` (Origin, CSRF, sesi, 2FA) + izin per aksi dan cakupan channel | modul di atas |

Ditegakkan oleh `tests/unit/architecture.test.ts` (impor lintas-modul, tidak ada `fetch` Meta di luar adapter, tidak ada konektor tidak resmi — AGENTS.md §3.3, §5).

## 2. Alur masuk (pesan pelanggan / echo / status / history)
```
Meta ──POST──► /api/webhooks/whatsapp
   1. flag whatsapp_connector mati → 404
   2. META_APP_SECRET kosong → 503 (tidak pernah menerima tanpa bisa memvalidasi)
   3. baca RAW body (maks 3 MB → 413)
   4. verifikasi X-Hub-Signature-256 (HMAC-SHA256, constant-time) SEBELUM parse → salah/tidak ada: 401
   5. JSON.parse → normalizePayload()  (tidak pernah melempar; banyak event per payload)
   6. storeEvents(): INSERT ... ON CONFLICT DO NOTHING (provider,event_key)
        • channel/WABA tak dikenal → status 'quarantined' (tidak pernah masuk channel lain)
        • duplikat → dihitung 'duplicates'
   7. gagal menyimpan → 500 (Meta mengirim ulang)   |  sukses → 200 {received, stored, duplicates, quarantined}
   8. kickProcessing() (opsional, WORKER_INLINE) — tidak memengaruhi respons

worker (scripts/worker.ts, atau inline) ──► claimBatch (SKIP LOCKED + lease)
   └─ transaksi: ingestEvent() ──► kontak → percakapan → pesan  | echo | history | status
        • sumber: Pelanggan / WhatsApp Business App (echo) / History
        • history & echo: TIDAK memperbarui last_customer_message_at, TIDAK memicu hook (emitCustomerMessage)
        • mode uji (D-03): pihak di luar daftar uji → karantina minimal (payload dibuang)
      markProcessed | markQuarantined   (satu transaksi)
   └─ pasca-commit: unduh media (privat), hook pesan pelanggan
   gagal → failEvent(backoff) → setelah 5x: 'failed' (dapat diproses ulang manual)
```

## 3. Alur keluar (hanya lewat alat uji, ke penerima uji)
```
UI/API /integrasi → POST /api/v1/integration/send  (izin integration.test pada channel itu)
  1. penerima di test_recipients? (SEMUA lingkungan)    tidak → 403
  2. idempotency key unik?                              duplikat → kembalikan hasil lama, TIDAK kirim lagi
  3. jendela layanan 24 jam terbukti?                   tidak → blokir + alasan (template = Tahap 6)
  4. INSERT pesan 'diproses'
  5. rate limiter per phone_number_id
  6. (gambar/PDF) unggah media → ID media
  7. POST sekali ke Graph API (biz_opaque_callback_data = idempotency key)
  8. hasil: sukses → 'diterima_api' | galat Meta → 'gagal' (+kategori) | timeout/jaringan/5xx → 'belum_pasti'
     (TIDAK ADA retry otomatis)
status webhook (sent/delivered/read/failed) → message_status_events → status diturunkan ulang
```

## 4. Model data (ringkas; rinci di ADR-0003/0004)
`channel_connections` (channel ↔ WABA ↔ phone_number_id ↔ mode uji ↔ status verifikasi) · `contacts` / `contact_identities` · `conversations` (unik per kontak–channel) ·
`messages` (arah, sumber, jenis, waktu provider/diterima, status, ID Meta, kunci idempotensi, `is_history`) · `message_status_events` · `media` · `lead_sources` (referral) ·
`inbound_events` (antrean) · `test_recipients`.

Nomor telepon **tidak** menjadi pengenal integrasi; kontak memiliki `public_ref` (ADR-0003). Nomor lengkap tidak pernah dikirim ke browser (disamarkan `••••1234`).

## 5. Kontrak inti yang dipenuhi
| Kontrak (AGENTS.md §6) | Wujud di Tahap 2 |
|---|---|
| #1 Izin | Setiap rute memeriksa aksi + cakupan channel; media/pesan difilter per channel |
| #2 Identitas | Kontak → Percakapan (unik per kontak–channel) → Pesan |
| #3 Event masuk | Disimpan sebelum 200; idempoten `(provider,event_key)`; history ditandai & tidak memicu hook |
| #5 Pengiriman keluar | Idempotensi, status mengikuti bukti, `belum_pasti` + rekonsiliasi, tanpa retry buta |
| #6 Cek ulang sebelum kirim otomatis | Belum ada pengiriman otomatis (Tahap 4/6) — **Di luar lingkup** |
| #7 Kill switch | Belum ada otomatisasi yang dikendalikan — **Di luar lingkup** (registri Tahap 1 tidak diubah) |

## 6. Batas dan keterbatasan yang diketahui
- Rate limiter **per proses**; >1 instans aplikasi butuh limiter di database (T2-F10).
- Media disimpan di filesystem privat (`MEDIA_DIR`, berkas `0600`) — **belum ada backup media** dan bukan penyimpanan objek (T2-F11).
- Jenis pesan selain teks/gambar/PDF: tersimpan sebagai "jenis pesan belum didukung" (metadata), tidak menggagalkan pemrosesan.
- Template: pembentuk payload `buildTemplate` + `postMessage` **ada** dan teruji **simulasi** (mock Graph API); **belum diuji nyata** (opsional pada tahap ini) dan **sengaja tidak terhubung** ke alat uji/UI (pemakaian = Tahap 6; API kirim menolak `kind=template`).
