# Checklist pendaftaran Tech Provider — aplikasi Meta "Trilogika Edutama TE-One"

Sumber (dibaca auditor 26 Nov 2026, developers.facebook.com): *Become a Tech Provider* (`solution-providers/get-started-for-tech-providers`), *App Review* (`solution-providers/app-review`), *Embedded Signup implementation* (`embedded-signup/implementation`), *Onboard WhatsApp Business app users* (`embedded-signup/onboarding-business-app-users`). Nama menu dapat berubah — ikuti tampilan dashboard saat itu. Keputusan pemilik: opsi (i), 26 Nov 2026.

## A. Persiapan (pemilik + tim, ±1 hari)
- [ ] Halaman **Kebijakan Privasi** publik di domain trilogikaedutama.id (wajib untuk App Review; sebut data WhatsApp yang diproses, pihak ketiga Meta, retensi D-18).
- [ ] **Ikon aplikasi** 1024×1024 dan **kategori aplikasi** (mis. Business/Productivity).
- [ ] Dokumen legal usaha untuk verifikasi (akta/NIB, alamat, telepon, email domain, website).
- [ ] Siapa admin penuh di Meta Business portfolio Trilogika Edutama (PIC pendaftaran).

## B. Verifikasi bisnis (Meta Business)
- [ ] business.facebook.com → Settings → **Security Center** → *Business verification* → isi nama, alamat, telepon, email, website → unggah dokumen bila diminta.
- [ ] Status **Verified**, dan business portfolio ini **terhubung ke aplikasi TE-One**.
> "Your business must be verified before you can start the app review process."

## C. Pendaftaran Tech Provider (developers.facebook.com)
- [ ] Aplikasi **TE-One** → *Use cases* → WhatsApp → *Customize* → menu kiri **Tech Provider onboarding**.
- [ ] Step 1 *Verify your business* → tercentang otomatis bila B selesai.
- [ ] Step 2 *App Review* — **App settings**: ikon, URL kebijakan privasi, kategori.
- [ ] **Video 1** (satu video per izin; rekaman layar, bukan screenshot): pesan dibuat & dikirim dari TE One lalu **diterima di WhatsApp** (pakai staging + nomor uji …186319 → tester).
- [ ] **Video 2**: membuat **message template** (boleh rekaman WhatsApp Manager / skrip cURL API Setup bila TE One belum punya fitur template).
- [ ] Deskripsi tertulis per izin, minta **Advanced access**:
  - `whatsapp_business_messaging` — "mengirim/menerima pesan untuk klien/nomor yang di-onboard lewat TE One (inbox tim, balasan admin)".
  - `whatsapp_business_management` — "mengakses aset WhatsApp (WABA, nomor, template) milik klien yang di-onboard".
  - Jangan minta izin yang tidak dipakai (alasan penolakan umum).
- [ ] Klik **Begin App Review** (draft tidak ditinjau). Rata-rata ±24 jam menurut Meta; bisa lebih lama.
- [ ] Pilih **Onboard without a partner** (kecuali memilih Solution Partner).

## D. Setelah disetujui (developer — perintah terpisah dari auditor)
- [ ] Facebook Login for Business → Client OAuth settings (HTTPS, JS SDK, domain staging/production di *Allowed domains* & *Valid OAuth redirect URIs*).
- [ ] Buat **konfigurasi Embedded Signup** → catat `config_id`.
- [ ] Bangun tombol "Hubungkan nomor WhatsApp" (JS SDK, versi terbaru, alur Business app / coexistence) + panggil SMB App Data (PR S-12) ≤ 24 jam setelah onboarding.
- [ ] Uji pada nomor **…196319** atau **…246319** (bukan …186319 yang sudah tersambung dan bukan Admisi/Hotline), lalu baru Admisi di Tahap 9.

## E. Paralel hari ini
- [ ] Tiket dukungan Meta: "WABiz: Cloud API" → "Coexistence Data Synchronization APIs and Webhooks" — SMB App Data ditolak `131000/10` untuk nomor yang terhubung langsung ke aplikasi TE-One; minta konfirmasi syaratnya. Sertakan App ID + phone_number_id, **tanpa token**.

## Catatan risiko
- Embedded Signup v2/v3 dinyatakan usang sejak 15 Okt 2026 → implementasi wajib versi terbaru.
- Batas pelanggan untuk Tech Provider baru: tidak ditemukan di dokumentasi yang dibaca.
- Bila belum disetujui sebelum ±20 Des 2026: go-live 15 Jan tanpa impor riwayat (opsi ii, usulan cadangan).
