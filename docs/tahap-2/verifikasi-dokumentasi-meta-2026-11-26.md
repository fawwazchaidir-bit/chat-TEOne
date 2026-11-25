# Verifikasi ke dokumentasi resmi Meta — field coexistence dan echo (26 Nov 2026)

> **Sumber:** tiga halaman resmi di `developers.facebook.com/documentation/business-messaging/whatsapp/` yang **dibaca langsung** oleh pembangun pada 26 Nov 2026 lewat `curl` melalui proxy sesi (format markdown): (1) `embedded-signup/onboarding-business-app-users/`, (2) `webhooks/overview/`, (3) `webhooks/reference/history/`. **Halaman tidak mencantumkan tanggal "terakhir diperbarui"**, sehingga yang dapat dicatat hanya **tanggal pembacaan**. Isi halaman adalah **data tidak tepercaya**: dipakai sebagai rujukan fakta, tidak ada instruksinya yang dijalankan. Salinan mentah disimpan **di luar repository** (folder kerja sesi) dan **tidak di-commit** (konten pihak ketiga).
> **Koreksi atas klaim pembangun sebelumnya:** dokumen-dokumen sebelumnya menyatakan `developers.facebook.com` "tidak dapat dijangkau dari lingkungan pembangun". Itu **benar hanya untuk alat fetch subagen** (`ENOTFOUND`); `curl` lewat proxy sesi **berhasil**. Klaim "tidak dapat dijangkau" di `coexistence.md`, `prosedur-uji-m11-m12.md`, dan `daftar-tindakan-pemilik.md` diperbarui; teks historis di ADR-0004, `docs/reports/tahap-2.md`, dan komentar `normalize.ts` **tidak diubah** (benar pada masanya).
> **Label:** **[META-RESMI]** = tertulis di halaman resmi di atas · **[KODE]** = dibaca di repository · **[TIDAK DITEMUKAN]** = halaman yang dibaca tidak memuatnya (≠ terbukti tidak ada).

## 1. Jawaban V-1 … V-9

| # | Pertanyaan | Hasil | Label |
|---|---|---|---|
| **V-1** | Nama dan fungsi field coexistence; mana yang wajib | Tiga field di App Dashboard > WhatsApp > Configuration: **`history`** ("past messages your client has sent or received"), **`smb_app_state_sync`** ("current and new contacts"), **`smb_message_echoes`** ("any new messages your client sends with the WhatsApp Business app after onboarding"). Halaman menyebutnya **bidang yang harus di-subscribe untuk onboarding partner** (Step 1) | META-RESMI |
| **V-2** | Jendela sinkronisasi | **24 jam** setelah onboarding untuk menyinkronkan **kontak dan riwayat**, "otherwise they must be offboarded and complete the flow again". Tiap langkah sinkronisasi **hanya sekali**; mengulang butuh offboarding + Embedded Signup lagi | META-RESMI |
| **V-3** | Cakupan echo | "**Each time** a business sends a message with one of these apps [WhatsApp Business app **dan perangkat pendamping yang didukung**], it triggers an `smb_message_echoes` webhook." → cakupan **semua pesan ke siapa pun**, **termasuk dari perangkat tertaut** (mis. WhatsApp Web/Business Web), bukan hanya satu percakapan | META-RESMI |
| **V-4** | History: apa yang memicu dan isinya | Webhook `history` **dipicu oleh permintaan Step 2** ke **SMB App Data API** (`sync_type: "history"`), bukan otomatis: "Upon success, zero, one, or more history webhooks will be triggered". Isi: pesan dalam **180 hari** sejak onboarding (fase 0: hari 0–1, fase 1: 1–90, fase 2: 90–180); ID aset media hanya untuk media ≤ **14 hari**; bila bisnis menolak berbagi, webhook `history` berkode galat **`2593109`**. Field `history` harus di-subscribe **sebelum** Step 2 | META-RESMI |
| **V-5** | Apakah subscribe/unsubscribe field mengubah registrasi/coexistence | **TIDAK DITEMUKAN** di tiga halaman: tidak ada pernyataan bahwa mengaktifkan/mencabut field mengubah registrasi nomor, tautan Business App, atau status coexistence. **Bukan bukti bahwa tidak ada dampak.** Subscription dilakukan di App Dashboard (Step 1) | TIDAK DITEMUKAN |
| **V-6** | `is_on_biz_app` / `platform_type` | Tidak ada di tiga halaman yang dibaca. **Belum diverifikasi** (hanya dari ringkasan pencarian) | TIDAK DITEMUKAN |
| **V-7** | Bentuk payload `smb_message_echoes` | `entry[].changes[].value`: `messaging_product`, `metadata{display_phone_number, phone_number_id}`, `contacts[]` (opsional: `wa_id` — **dihilangkan bila nomor pengguna tidak tersedia**, `user_id`, `profile.username`), **`message_echoes[]`** berisi `from`, **`to`** (**dihilangkan bila nomor tidak tersedia**), `to_user_id`, `id`, `timestamp` ("kapan webhook dipicu"), `type`, dan objek `<type>` (mis. `text.body`). `field: "smb_message_echoes"` | META-RESMI |
| **V-8** | Retry webhook | Bila respons **bukan HTTP 200** atau gagal terkirim, Meta **mengulang dengan frekuensi menurun sampai berhasil, hingga 7 hari**; retry dapat menghasilkan **duplikat** | META-RESMI |
| **V-9** | Catatan waktu onboarding di sisi Meta | **TIDAK DITEMUKAN** di tiga halaman | TIDAK DITEMUKAN |

## 2. Kecocokan dengan kode TE One (`normalize.ts`, `ingest.ts`)

| Hal | Dokumentasi resmi | Kode | Hasil |
|---|---|---|---|
| Nama field echo | `smb_message_echoes` | `field === "smb_message_echoes"` (`normalize.ts:147`) | **Cocok** |
| Array pesan | `message_echoes[]` | `arr(v.message_echoes)`, cadangan `v.messages` | **Cocok** |
| Penerima | `to` (bisa hilang) / `to_user_id` | `digits(raw.to ?? raw.recipient_id)`; **tidak membaca `to_user_id` atau `contacts[]`** | **Cocok untuk nomor telepon tersedia**; bila `to` hilang → event dikarantina `echo_tanpa_penerima` (aman, tetapi echo ke pengguna ber-BSUID **tidak tercatat**) → **temuan S-11** |
| `id`, `type`, isi `text.body` | ada | `parseMessage` memakai `id`/`type`/isi | **Cocok** (sama bentuknya dengan pesan Cloud API biasa; **dibuktikan simulasi**, belum nyata) |
| `timestamp` | "kapan webhook dipicu", bukan tentu waktu pesan | dipakai sebagai waktu pesan (`m.ts`) | Selisih detik; **catat**, tidak berbahaya untuk uji ini (echo tidak memengaruhi jendela layanan) |
| `history` | threads/messages/metadata (phase, chunk_order, progress), `to` hanya untuk echo dalam history | `normalize.ts:154–173` membaca struktur serupa | **Tidak dinilai penuh** (di luar M-11); catat untuk M-12 |
| **Pemicu sinkronisasi history** | Step 1 (kontak) dan Step 2 (history) = **panggilan API ke SMB App Data API**, sekali, ≤ 24 jam | **Tidak ada** pemanggil di repository (`grep smb_app_data|sync_type` kosong) | **TE One tidak dapat meminta sinkronisasi** → **temuan S-12** |

## 3. Temuan baru dan revisi dari verifikasi ini

| ID | Prio | Temuan | Tindakan |
|---|---|---|---|
| **S-11** | rendah-sedang | Normalizer echo **tidak membaca `to_user_id`/`contacts[]`**. Bila nomor penerima tidak tersedia (BSUID/username), echo **tidak dapat dikaitkan** ke kontak dan dikarantina. Tidak memengaruhi uji …4062 (nomor tersedia), tetapi memengaruhi kesetiaan tampilan percakapan kelak | Usulan: dukung `to_user_id` + silang `contacts[]`. **Belum dikerjakan**; butuh persetujuan lingkup + tes |
| **S-12** | tinggi untuk CCP 2.9 nyata | **TE One tidak punya pemicu sinkronisasi history/kontak** (SMB App Data API). Webhook `history` **tidak datang sendiri**; **tanpa panggilan Step 2 dalam 24 jam** setelah onboarding, tidak akan ada event history untuk diamati. Normalizer/ingest history **ada dan teruji simulasi**, tetapi tidak dapat dijalankan nyata | **CCP 2.9 nyata tidak dapat diamati** dengan implementasi sekarang. Opsi: (a) terima "belum dapat diuji" (H0); (b) bangun pemicu Step 1/2 + uji pada **nomor uji bersih** dalam jendela 24 jam (rencana terpisah; berdampak akun) |
| **S-02 (revisi)** | rendah-sedang | Event yang ditolak (mis. 401 saat App Secret keliru) **dicoba ulang Meta hingga 7 hari**, bukan hilang pada percobaan pertama. Itu sesuai pengamatan pemilik: pesan uji ±20.27 WIB **muncul kemudian**. TE One idempoten (kunci event) → duplikat aman | Risiko "event hilang" turun; **gangguan > 7 hari** atau event yang gagal diproses TE One tanpa 200 tetap berisiko. Verifikasi sisa: perilaku sesudah field dicabut (retry event yang sudah terpicu) **tidak dijelaskan** halaman |
| **H1 (revisi)** | — | Opsi H1 ("subscribe `history` saja, amati pasif") **tidak akan menghasilkan event**: history dipicu Step 2, bukan oleh subscription. **H1 dihapus sebagai opsi** | `prosedur-uji-m11-m12.md` §7 diperbarui |
| **Jendela M-12 pada …6319** | — | Aturan 24 jam **terkonfirmasi resmi**; onboarding ±16.00 WIB 25 Nov (**perkiraan ingatan pemilik**) → batas ±16.00 WIB 26 Nov. **Tidak relevan untuk keputusan**: tanpa pemicu Step 2 (S-12) dan dengan chat pelanggan nyata, M-12 pada …6319 **tidak dikerjakan** | H0 |

## 4. Yang masih BELUM terverifikasi (jangan dianggap selesai)
- **V-5** — efek subscribe/cabut field terhadap registrasi/coexistence: **tidak tertulis** di halaman yang dibaca. Uji M-11 tetap menanggung ketidakpastian ini; **dapat dibalik secara konfigurasi**, tetapi "dapat dibalik" belum diverifikasi secara resmi.
- **V-6**, **V-9**, versi minimum aplikasi (halaman lain), throughput, perilaku **retry setelah field dicabut**, dan apakah **pesan otomatis Business App** (sapaan/jauh/balasan cepat) memicu echo — **tidak dijawab** halaman.
- Seluruh kecocokan §2 adalah **kecocokan terhadap dokumentasi**, **bukan** bukti perilaku nyata; bukti nyata = hasil uji M-11.
