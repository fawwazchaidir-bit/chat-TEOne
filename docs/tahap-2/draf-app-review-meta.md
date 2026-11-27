# Draf App Review Meta — deskripsi izin + naskah video (aplikasi "Trilogika Edutama TE-One")

> Disusun auditor 26 Nov 2026 dari dokumentasi resmi Meta (*Become a Tech Provider*, *App Review*). **Draf**; dipakai hanya bila pemilik melanjutkan pendaftaran Tech Provider (lihat `gates/keputusan-pemilik-fase-0-2026-11-26.md` §9–§10).
> Aturan Meta yang diikuti: satu deskripsi tertulis **dan** satu rekaman layar **per izin**; jangan satu video untuk beberapa izin; tidak boleh screenshot; jangan minta izin yang tidak dipakai; draft tidak ditinjau.
> Deskripsi ditulis dalam **bahasa Inggris** (bahasa peninjau). Hanya klaim fitur yang **benar-benar ada** di TE One per commit `0463559`.

---

## 1. `whatsapp_business_messaging`

### Deskripsi (tempel ke formulir App Review)
```
TE One is a customer service inbox built by Trilogika Edutama, a vocational training institute in Indonesia.
Businesses onboarded through our app use it to send and receive WhatsApp messages with their customers
(prospective trainees, participants and partners) via the WhatsApp Business Platform Cloud API.

How we use whatsapp_business_messaging:
- Receive incoming customer messages and message status updates (sent, delivered, read) through webhooks,
  and show them to authorized staff in a team inbox, scoped per phone number and per team.
- Let authorized staff reply to customers from the inbox within the 24-hour customer service window,
  and send approved message templates outside the window.
- Record messages that the business sends from the WhatsApp Business app (coexistence echoes) so the
  conversation history in TE One is complete, without treating them as customer messages.

Safeguards: every outgoing message is sent by an authenticated staff member with two-factor authentication
and channel-level permissions; sends are idempotent and logged in an append-only audit log; a kill switch can
stop sending per chat, per number, or globally. We do not use message content for advertising and we do not
sell customer data. Privacy policy: https://trilogikaedutama.id/privacy-policy
```

### Naskah video 1 (±1–2 menit, rekaman layar, tanpa suara pun boleh; tambahkan teks keterangan)
Disiapkan di **staging** dengan nomor bisnis …186319 dan ponsel tester …4062 (daftar penerima uji). Tidak memakai data pelanggan; samarkan nomor bila tampil.
| # | Layar | Tindakan | Keterangan di video |
|---|---|---|---|
| 1 | Halaman login TE One (HTTPS staging) | Login Super Admin + kode 2FA | "Staff sign in with 2FA" |
| 2 | Menu **Integrasi** (alat uji integrasi) | Pilih channel Kemitraan, penerima uji …4062, ketik `Hello from TE One — App Review demo`, klik kirim | "Message created and sent from our app" |
| 3 | Daftar pesan / status | Tampilkan status berubah ke **Diterima** (dari webhook) | "Delivery status received via webhook" |
| 4 | Layar ponsel tester (rekaman ponsel atau kamera) | Pesan yang sama **diterima di WhatsApp** | "Message received in the WhatsApp client" |
| 5 | (opsional) Ponsel tester membalas → pesan masuk tampil di TE One | — | "Incoming reply shown to staff" |
> Catatan: flag `inbox` di staging **mati**; video memakai alat **Integrasi** (aktif di bawah `whatsapp_connector`). Bila ingin merekam inbox tim, nyalakan `inbox` sementara dengan kill switch otomatisasi tetap aman (`ai_simulation` mati) lalu matikan lagi.

---

## 2. `whatsapp_business_management`

### Deskripsi
```
TE One uses whatsapp_business_management to manage the WhatsApp Business Accounts (WABA) of businesses
onboarded through our app, only to the extent needed to operate the inbox:
- Read the phone numbers of the onboarded WABA (display number, verified name, status) to map each number to
  the correct inbox channel and to verify the connection before any message is sent.
- Subscribe our app to the onboarded WABA's webhooks so incoming messages and status updates are delivered.
- Read and use the business's approved message templates so staff can send them outside the 24-hour window.
- Synchronize WhatsApp Business app contacts and message history right after onboarding (coexistence), when
  the business chooses to share it, so staff see prior context.

We access only assets the business explicitly shares with our app during onboarding. Access is limited to
authorized staff, logged, and can be revoked by the business at any time. Privacy policy:
https://trilogikaedutama.id/privacy-policy
```
> Baris "Synchronize … message history" hanya dimasukkan **bila** fitur sinkronisasi (PR S-12) sudah ada saat pengajuan; bila belum, hapus baris itu (jangan mengklaim fitur yang belum dibangun).

### Naskah video 2 (template; ±1–2 menit)
Meta mengizinkan rekaman **WhatsApp Manager** atau skrip cURL *API Setup* untuk bagian template.
| # | Layar | Tindakan | Keterangan |
|---|---|---|---|
| 1 | business.facebook.com → **WhatsApp Manager** → akun WhatsApp Kemitraan | Tampilkan nomor …186319 terhubung | "WABA shared with our app" |
| 2 | **Message templates → Create template** | Kategori **Utility**, nama `jadwal_pelatihan_demo`, bahasa Indonesia, isi: `Halo {{1}}, jadwal pelatihan Anda: {{2}}. Balas pesan ini bila ada pertanyaan.` + contoh nilai | "Creating a message template" |
| 3 | Submit | Tampilkan status *In review* / *Active* | "Template submitted for approval" |
| 4 | TE One → halaman **Channel** → pemeriksaan koneksi | Klik **Periksa koneksi** → status pemetaan + langganan webhook terverifikasi | "Our app reads the WABA phone numbers and webhook subscription" |

---

## 3. Isian lain di App Review
| Kolom | Isi |
|---|---|
| App icon | Logo Trilogika Edutama 1024×1024 |
| Privacy Policy URL | `https://trilogikaedutama.id/privacy-policy` (setelah draf revisi dipublikasikan) |
| Data deletion | URL yang sama, bagian 8 |
| Category | Business |
| Tech Provider path | *Onboard without a partner* |

## 4. Kesalahan umum yang dihindari
- Satu video untuk dua izin → **ditolak**; buat dua berkas terpisah.
- Video tanpa bukti pesan **diterima di WhatsApp** → ditolak.
- Meminta `business_management` atau izin lain yang tidak dipakai → risiko ditolak. **Jangan diminta.**
- Menampilkan token, App Secret, nomor lengkap, atau data pelanggan di video → samarkan / jangan direkam.
