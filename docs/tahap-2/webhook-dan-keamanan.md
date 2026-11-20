# Webhook dan validasi keamanan (Tahap 2)

> Status: **Terbukti simulasi** (test integrasi + E2E dengan webhook bertanda tangan sungguhan terhadap server produksi lokal). **Belum terbukti nyata** terhadap Meta.
> Bentuk payload resmi Meta tidak dapat diverifikasi pada pembangunan (host dokumentasi diblokir) — semua asumsi bentuk berada di `src/modules/whatsapp-adapter/normalize.ts` dan ditandai **BELUM TERVERIFIKASI**.

## 1. Endpoint
`GET|POST /api/webhooks/whatsapp` (publik, tanpa sesi/CSRF — tidak boleh; Meta tidak mengirimnya). Keamanan **seluruhnya** dari tanda tangan + verify token.

## 2. Verifikasi langganan (GET)
- Syarat: `hub.mode=subscribe`, `hub.verify_token` = `META_VERIFY_TOKEN` (perbandingan konstan-waktu), `hub.challenge` ada dan hanya karakter `[A-Za-z0-9_.-]` (≤ 200) agar tidak ada refleksi karakter berbahaya.
- Salah/tidak lengkap → **403**; token belum dikonfigurasi → 403; flag mati → **404**.

## 3. Validasi tanda tangan (POST) — urutan wajib
1. Flag `whatsapp_connector` mati → 404 (endpoint seolah tidak ada).
2. `META_APP_SECRET` kosong → **503** (tidak pernah menerima tanpa kemampuan memvalidasi).
3. Baca **raw body** sebagai byte (maks 3 MB → **413**).
4. `X-Hub-Signature-256` = `sha256=<hex HMAC-SHA256(app secret, raw body)>`; dibandingkan dengan `timingSafeEqual`; header tidak ada/salah format/panjang → ditolak. Gagal → **401**, **sebelum** parsing.
5. Baru `JSON.parse` (UTF-8 ketat); bukan JSON → 400.
6. `normalizePayload` (tidak pernah melempar; field asing diabaikan; yang tak dikenali → `unknown` → karantina).
7. `storeEvents` — simpan **sebelum** membalas. Gagal simpan (mis. database mati) → **500** sehingga Meta mengirim ulang; **tidak** pernah 200.
8. Balas 200 `{received, stored, duplicates, quarantined}` (tanpa isi pesan).

Diuji: 90 varian (payload diubah setelah ditandatangani, tanda tangan diubah 1 karakter, secret lain) → **100% ditolak 401**; tanpa header / skema salah / bukan hex → 401; JSON rusak + tanda tangan salah → 401 (bukan 400) karena tanda tangan diperiksa sebelum parse.

## 4. Idempotensi dan antrean
- Kunci event dari provider: `UNIQUE(provider, event_key)`. Diuji (simulasi): payload yang sama dikirim ulang **120×** berurutan → 1 event, 1 pesan; **40** pengiriman identik paralel → 1 event; **110 event berbeda × 2 pengiriman (220 permintaan)** → tepat 110 pesan; event yang sudah diproses lalu dikirim ulang tidak diproses lagi. Uji mutasi (mengubah/menghapus kunci unik) terbukti membuat test gagal.
- Antrean tahan restart: klaim `SKIP LOCKED` + lease; worker mati di tengah → event diambil ulang setelah lease habis; hasilnya tetap satu pesan (diuji "restart worker").
- Gagal diproses: backoff eksponensial, `failed` setelah 5 percobaan; pemrosesan ulang manual (`POST /api/v1/integration/events/{id}/retry`, izin `integration.test`, teraudit).

## 5. Karantina (tidak pernah masuk channel lain)
| Alasan | Perlakuan |
|---|---|
| `channel_tidak_dikenal` (phone_number_id belum dipetakan) | disimpan sebagai `quarantined`; dapat diproses ulang **hanya** setelah pemetaan ada |
| `waba_tidak_cocok` (WABA di payload ≠ WABA channel) | karantina; tidak pernah memakai channel lain |
| `bentuk_tidak_dikenal` | karantina; hanya field/alasan yang disimpan |
| `pengirim_di_luar_daftar_uji` (mode uji D-03) | **payload dibuang**; hanya hitungan, jenis, dan alasan; dilaporkan di alat uji |
| `identitas_bentrok` (G2-A01: identitas pesan menunjuk ≥ 2 kontak berbeda) | karantina; **payload dipertahankan** (dibatasi retensi) untuk ditinjau; tidak ada kontak/pesan/identitas ditulis; audit tanpa nomor; belum dapat diproses ulang lewat alat uji |
| `pengirim_tanpa_identitas`, `echo_tanpa_penerima`, `history_tanpa_pelanggan` | karantina |

## 6. Data yang disimpan, retensi, log
- `inbound_events.payload` (mentah): dibuang saat sudah tidak diperlukan (`dropPayload`) dan dibersihkan oleh worker setelah **30 hari** — **ASUMSI (D-18)**, usulan belum diputuskan.
- **Tidak ada** payload, isi pesan, token, tanda tangan, atau URL media sementara di log aplikasi. Galat dicatat lewat `safeErrorLabel` (nama kelas + kode), karena pesan galat driver DB memuat parameter kueri.
- Audit log: aksi (simpan koneksi, verifikasi, kirim uji, penyelesaian manual, ulang event) tanpa isi chat.

## 7. Media
- Unduh inbound hanya dari URL yang lolos `isAllowedMediaUrl` (https, host Meta/mock lokal; **anti-SSRF**: IP privat/metadata, `evil.example`, redirect, dan lookalike ditolak — diuji).
- Tipe ditentukan dari **byte** (JPEG/PNG/WebP/PDF), bukan dari header/ekstensi; batas ukuran gambar 5 MB, PDF 16 MB; `sha256` dicatat; berkas `0600` di `MEDIA_DIR`.
- Akses hanya lewat `GET /api/v1/media/{id}` dengan sesi + izin channel pemilik pesan; header `nosniff`, `Cache-Control: no-store`.

## 8. Yang BELUM terbukti (jujur)
- Bentuk payload nyata (`messages`, `statuses`, `smb_message_echoes`, `history`, `smb_app_state_sync`, `referral`) dan pengenal selain `wa_id`.
- Apakah Meta mengirim ulang pada 5xx dan dengan jeda berapa; batas ukuran payload nyata (3 MB adalah asumsi).
- Pemetaan kode galat Meta → kategori (disusun dari sumber sekunder).
- Ketahanan di belakang proxy Caddy nyata (header/ukuran body).
