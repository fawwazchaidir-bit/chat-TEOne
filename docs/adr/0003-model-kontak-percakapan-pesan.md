# ADR-0003 — Model data Kontak → Percakapan → Pesan

- **Status:** Diusulkan (**rancangan; tabel dibuat di Tahap 2**) · menunggu persetujuan pemilik
- **Tahap:** 1 (rancangan) → 2 (tabel) · Memenuhi AGENTS.md §6.2

## Keputusan
```
Kontak (1) ─── (N) IdentitasKontak          identitas dari provider
   │
   └── (N) Percakapan  — satu per pasangan (kontak, channel)  [UNIQUE(contact_id, channel_id)]
              └── (N) Pesan
```
### Kontak
- `id` (uuid internal) dan **`public_ref`** (uuid opak, stabil) — satu-satunya pengenal yang dipakai integrasi Internal Portal / Training & Operations di masa depan. **Nomor telepon tidak pernah menjadi pengenal integrasi.**
- Atribut tampilan (nama profil, nomor tampil) **opsional dan tidak otoritatif**.
- Sumber lead (mis. iklan Click-to-WhatsApp) disimpan sebagai atribut terstruktur milik kontak/percakapan pertama (dasar D-11 "Sumber lead" otomatis).

### IdentitasKontak — identitas dari Meta, bukan nomor tampil
- `(provider, identity_type, identity_value, scope)` **UNIQUE**; `identity_type` mengikuti **identitas yang benar-benar dikirim Meta pada payload** (mis. `wa_id`, dan pengenal lain yang disediakan Meta untuk pengguna yang menyembunyikan nomor). **Nama field dan perilakunya wajib diverifikasi ke dokumentasi Meta terbaru pada Tahap 2** (lihat `rencana-integrasi-meta-tahap-2.md`); skema dirancang agar tipe identitas baru dapat ditambah tanpa migrasi destruktif.
- Satu kontak dapat memiliki banyak identitas; penggabungan kontak adalah tindakan eksplisit & teraudit.

### Percakapan
- Kunci: `(contact_id, channel_id)`. Memuat: status AI + **nomor versi** (kontrak #4), `last_customer_message_at` (dasar jendela layanan 24 jam, dibuktikan dari waktu server/provider), batas "pesan yang layak diproses" saat AI diaktifkan kembali.
- Status belum dibaca **per pengguna** (D-16) di tabel terpisah (`conversation_reads`).

### Pesan
- `direction` (in/out), **`source`**: `customer | whatsapp_business_app_echo | te_one_user | ai | follow_up | history`.
- `provider_message_id` UNIQUE per channel (idempotensi masuk), `idempotency_key` UNIQUE (keluar), `status` (termasuk `uncertain`).
- **`is_history`** menandai pesan hasil sinkronisasi riwayat: **tidak pernah** memicu otomatisasi, unread, label, atau follow-up (kontrak #3).
- Echo dari WhatsApp Business App dicatat sebagai pesan keluar bersumber `whatsapp_business_app_echo`; tidak membuka/memperpanjang jendela layanan.

### Relasi ke modul lain (semua merujuk ID percakapan/kontak, bukan nomor)
Label (`conversation_labels`) · Pipeline (`pipeline_items.conversation_id` — relasi tidak boleh hilang saat status/PIC berubah, CCP 5.5) · Follow-up (`follow_up_jobs.conversation_id`) · Tim/routing (`conversation_assignments`).

### Cakupan akses
Setiap kueri atas Percakapan/Pesan difilter oleh `PermissionSet` (modul `roles-permissions`, sudah ada) pada `channel_id`, termasuk pencarian, jumlah, realtime, media, dan panel riwayat lintas channel (CCP 3.1). Pengalihan antartim memberi akses **hanya untuk percakapan itu** (kontrak #1).

## Konsekuensi
- Tabel dibuat di Tahap 2 di balik feature flag `whatsapp_connector`; migrasi diuji pada DB kosong + snapshot Tahap 1.
- Retensi isi chat/media mengikuti D-18 (usulan: 2 tahun) — lihat `klasifikasi-data-dan-retensi.md`.
