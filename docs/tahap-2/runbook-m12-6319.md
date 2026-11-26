# Runbook M-12 (sinkronisasi kontak & riwayat) pada nomor Kemitraan …6319 — dengan kontinjensi

**Keputusan pemilik (26 Nov 2026):** M-12 diuji nyata **pada nomor Kemitraan …6319** (bukan nomor uji bersih), "siapkan dengan kontinjensi". Disusun auditor; **belum dijalankan**.

## Fakta resmi Meta (dibaca auditor 26 Nov 2026 dari `developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/`)
- Step 1 dan Step 2: `POST https://graph.facebook.com/<API_VERSION>/<BUSINESS_PHONE_NUMBER_ID>/smb_app_data`, body `{"messaging_product":"whatsapp","sync_type":"smb_app_state_sync"}` (kontak) lalu `"history"` (riwayat). Sukses = `{"messaging_product":"whatsapp","request_id":"…"}` — **hanya berarti permintaan diterima**, bukan bahwa riwayat dibagikan.
- "you have 24 hours to synchronize their contacts and messaging history, otherwise they must be offboarded and complete the flow again." Tiap step: "You can only perform this step once."
- Field yang harus di-subscribe sebelumnya: `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes`.
- Riwayat = pesan ≤ 180 hari, tanpa grup; ID media hanya untuk media ≤ 14 hari; bila pemilik bisnis menolak berbagi → webhook `history` galat `2593109`.
- Offboarding: dari WhatsApp Business App **Settings > Account > Business Platform > Disconnect Account** (Deregister API tidak bisa untuk nomor coexistence). Onboarding ulang memutus semua perangkat tertaut. Embedded Signup v2/v3 sudah tidak didukung sejak 15 Okt 2026 (pakai v4/v5).

## Dua jalur
| | Jalur A — hari ini, jendela onboarding 25 Nov | Jalur B — onboarding ulang …6319 setelah PR S-12 |
|---|---|---|
| Kapan | Sebelum jendela 24 jam tutup (onboarding ±16.00 WIB 25 Nov **menurut ingatan** → ±16.00 WIB 26 Nov) | Setelah PR S-12 diaudit + dipasang di staging |
| Cara memicu | Panggilan satu kali dari dalam kontainer app (token dari env, tidak pernah dicetak) | Tombol di TE One (pengaman server P2) |
| Yang terbukti | Jalur **ingest** history nyata: CCP 2.9 (0 otomatisasi/unread), karantina pengirim di luar daftar uji | Jalur ingest **dan** pemicu TE One |
| Dampak akun | Subscribe 4 field di aplikasi TE-One | Offboard + onboarding ulang Kemitraan: perangkat tertaut terputus, webhook `PARTNER_REMOVED`/`ACCOUNT_RECONNECTED`, jeda layanan Cloud API |
| Biaya peluang | Kesempatan sinkronisasi 25 Nov terpakai (tetap hangus hari ini bila tidak dipakai) | Tidak ada, tetapi butuh Embedded Signup v4/v5 |

## Prasyarat Jalur A (semua harus "ya")
1. Pemilik menulis **"SETUJU JALUR A"**.
2. Channel …6319 `test_mode = true` dan daftar penerima uji hanya nomor tim (P-1).
3. Worker berjalan (riwayat diproses cepat sehingga payload pengirim di luar daftar segera dibuang).
4. Backup baru dibuat tepat sebelum uji (P-3).
5. Kill switch **global** dinyalakan dari halaman Kill switch (pengaman tambahan; history memang tidak memicu otomatisasi).
6. Pemilik men-subscribe `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes` di **aplikasi TE-One** (App Dashboard > WhatsApp > Configuration) — bukan aplikasi Halo AI.

## Kontinjensi
| Kondisi | Tindakan |
|---|---|
| Step 1 mengembalikan galat (mis. di luar 24 jam) | **Berhenti.** Jangan panggil Step 2. Unsubscribe `history`/`smb_app_state_sync` bila tidak dipakai. Lanjut Jalur B |
| Step 1/2 timeout / jaringan | **Jangan ulangi** (sekali saja). Catat; tunggu webhook ≤ 30 menit; bila tidak ada, anggap hangus → Jalur B |
| Webhook `history` galat 2593109 | Pemilik bisnis menolak berbagi di ponsel → catat; CCP 2.9 diamati sebagian (event diterima, tanpa pesan) |
| Antrean `inbound_events` menumpuk (`pending` > 0 lebih dari 10 menit) atau galat worker | Unsubscribe `history` di App Dashboard; catat; laporkan |
| Ditemukan pesan pelanggan nyata tersimpan (bukan dari daftar uji) | Insiden D-18: catat jumlah (bukan isi), hapus ≤ 3 hari kerja |
| Webhook berhenti / app tidak sehat | Rollback image (runbook Fase 2 Langkah 5) — data tidak terpengaruh |
| Kontak/riwayat masuk tetapi bentuk tidak dikenal (karantina `bentuk_tidak_dikenal`) | Normal-aman (S-05); catat hitungan untuk perbaikan normalizer di PR S-12 |

## Hasil Jalur A — 26 Nov 2026, 10.30 WIB
Prasyarat terpenuhi (test_mode, terverifikasi nyata, 1 penerima uji, kill switch global menyala — diperiksa otomatis sebelum panggilan; backup `20261126T032838Z` offsite=ok). Baseline: pesan 9 · history 0 · unread_eligible 5 · automation_jobs 0 · domain_outbox 3 · kontak 1.

Step 1 (`smb_app_state_sync`): **ditolak Meta** — `http 400`, `code 131000`, `subcode 10`, "This API is only available to WhatsApp Business App phone numbers onboarded on to WhatsApp Business Platform". Step 2 **tidak** dipanggil. Tidak ada data yang berubah; kesempatan sinkronisasi tidak terpakai.

**Temuan G2-B06 (tinggi, sementara):** Meta tidak mengakui …6319 sebagai nomor WhatsApp Business App yang di-onboard (coexistence) untuk aplikasi TE-One. Dampak: M-11 (echo) kemungkinan tidak menghasilkan event; CCP 2.10 belum terbukti; rencana pemindahan Admisi (coexistence di Halo AI) mungkin memerlukan Embedded Signup aplikasi TE-One dan status Tech Provider/Solution Partner (D-02). Diagnosis berikut: `GET /<phone_number_id>?fields=is_on_biz_app,platform_type` (baca-saja).

## Diagnosis identitas nomor — 26 Nov 2026 (baca-saja, Graph API)
```
TERSAMBUNG KE STAGING: nomor …186319 · verified_name "Admisi Trilogika Edutama" · is_on_biz_app=true · platform_type=CLOUD_API · status=CONNECTED
SEMUA NOMOR DI WABA YANG SAMA: hanya …186319
```
Pemilik menyatakan memiliki tiga nomor yang sama-sama berakhiran 6319.

**Temuan G2-B07 (berpotensi KRITIS, menunggu konfirmasi pemilik):** nomor yang tersambung ke staging bernama tampilan **"Admisi Trilogika Edutama"** dan aktif di WhatsApp Business App (coexistence). AGENTS.md §1 mencatat Admisi = …1119 dan Kemitraan sebagai "cadangan Admisi". Bila …186319 adalah nomor yang dipakai operasional Admisi (lead iklan) atau terhubung ke Halo AI, staging melanggar AGENTS.md §3.1/§3.2. Bila …186319 adalah nomor Kemitraan/cadangan yang kebetulan bernama "Admisi", tidak ada pelanggaran, tetapi nama tampilan menyesatkan dan dokumen harus memakai 6 digit terakhir. Penolakan SMB App Data (131000/10) konsisten dengan nomor coexistence yang **di-onboard lewat jalur lain** (bukan Embedded Signup aplikasi TE-One).

**Tindakan sementara (tanpa mengubah registrasi):** hentikan M-11/M-12 pada …186319; kill switch global tetap menyala; matikan sementara langganan field `smb_message_echoes` dan `history` di aplikasi TE-One sampai identitas jelas; hitung lalu lintas masuk (angka saja).
