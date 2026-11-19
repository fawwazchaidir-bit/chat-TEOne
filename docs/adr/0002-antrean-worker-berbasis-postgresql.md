# ADR-0002 — Antrean/worker berbasis PostgreSQL (kerangka untuk Tahap 2)

- **Status:** Diusulkan (keputusan + kerangka; **belum ada tabel/worker di Tahap 1**) · menunggu persetujuan pemilik
- **Tahap:** 1 (keputusan) → 2 (implementasi) · Memenuhi AGENTS.md §6.3 dan §6.5

## Konteks
Tahap 2 harus menerima webhook Meta dan memprosesnya **tahan restart**: simpan dulu sebelum respons sukses, proses idempoten, tanpa kehilangan event.
Tahap 3–6 menambah pengiriman keluar dan penjadwalan follow-up. Infrastruktur tambahan (Redis dsb.) menambah beban operasi untuk tim kecil.

## Keputusan
Memakai **PostgreSQL sebagai antrean**, tanpa komponen baru:

1. **Penerimaan (`inbound_events`)** — satu pernyataan `INSERT … ON CONFLICT (provider, provider_event_id) DO NOTHING` pada **raw body yang sudah lolos validasi tanda tangan**; respons 200 **hanya setelah commit**. Bila DB tidak tersedia → respons non-2xx agar Meta mengirim ulang. Payload mentah disimpan ≤ 30 hari (D-18).
2. **Pemrosesan** — worker mengambil pekerjaan dengan `SELECT … FOR UPDATE SKIP LOCKED` + *lease* (`locked_until`); pekerjaan yang lease-nya habis (worker mati) diambil ulang. Pemrosesan **idempoten** berdasarkan kunci unik dari provider; urutan per percakapan dijaga dengan advisory lock `hashtext(conversation_id)`.
3. **Pengiriman keluar (`outbox`)** — baris dengan **kunci idempotensi**; status `queued → sending → sent → delivered/read | failed | uncertain`. Status mengikuti bukti provider. **`uncertain` masuk rekonsiliasi — tidak ada retry buta** (AGENTS.md §6.5).
4. **Penjadwalan (Tahap 6)** — tabel pekerjaan yang sama dengan kolom `run_at`; satu pekerjaan hanya dimiliki satu worker (CCP 6.3 diuji dengan 2 worker + restart).
5. **Pemeriksaan ulang sebelum kirim** — setiap eksekusi pengiriman otomatis memanggil `checkAutomation()` (modul `kill-switch`, sudah ada di Tahap 1) dan memuat ulang status percakapan **tepat sebelum kirim** (AGENTS.md §6.6–6.7).
6. **Proses** — worker adalah entrypoint terpisah (`node worker.js`) dari image yang sama; dapat dijalankan ≥ 2 replika.

## Disiapkan di Tahap 1
- `checkAutomation()` / `guardedAutomation()` (fail-closed) — pola yang akan membungkus eksekusi worker.
- Feature flag `whatsapp_connector`, `inbox`, `follow_up` (default mati).
- Role DB terpisah dan hak minimum (`db/grants.sql`) yang akan diperluas per tabel baru.

## Alternatif
| Opsi | Alasan ditolak (untuk sekarang) |
|---|---|
| Redis + BullMQ | Komponen baru yang perlu dibackup/dipantau; durabilitas ≠ database utama (event bisa hilang saat restart) |
| `pg-boss` | Wajar sebagai pustaka, tetapi kontrol atas semantik `uncertain`/rekonsiliasi dan idempotensi per kontrak inti lebih jelas bila skema sendiri |
| Antrean cloud (SQS) | Data keluar dari server tersendiri; biaya & kebijakan data (D-18/D-19) |

## Konsekuensi
- Throughput terbatas oleh PostgreSQL — memadai untuk skala ini; **dibuktikan dengan uji beban di Tahap 7** (D-13), bukan diasumsikan.
- Backup database otomatis mencakup antrean (restore tidak boleh mengirim ulang apa pun — CCP 7.6/8.3).
- Migrasi tabel-tabel ini maju-saja dan di balik feature flag.
