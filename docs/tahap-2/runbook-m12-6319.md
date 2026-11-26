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
