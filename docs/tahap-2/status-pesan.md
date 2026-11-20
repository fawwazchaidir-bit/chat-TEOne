# Status pesan dan penanganan hasil belum pasti (Tahap 2)

> Status: **Terbukti simulasi** (mock Graph API + webhook status sintetis). Perilaku status nyata Meta **belum terbukti**.

## 1. Status pesan keluar
`diproses → diterima_api → terkirim → diterima → dibaca` ; cabang: `gagal`, `belum_pasti`.

| Status | Arti | Sumber bukti |
|---|---|---|
| `diproses` | baris pesan sudah dicatat, panggilan ke Meta belum selesai | internal |
| `diterima_api` | Meta menerima permintaan dan mengembalikan ID pesan | respons Graph API (HTTP 200 + ID) |
| `terkirim` | Meta melaporkan `sent` | webhook status |
| `diterima` | Meta melaporkan `delivered` | webhook status |
| `dibaca` | Meta melaporkan `read` | webhook status |
| `gagal` | Meta menolak (galat 4xx dengan kategori) atau melaporkan `failed` tanpa bukti penerimaan (`delivered`/`read`) | respons API / webhook |
| `belum_pasti` | **hasil tidak diketahui**: timeout, gangguan jaringan, HTTP 5xx, atau respons sukses tanpa ID | internal |

Pesan masuk tidak memiliki status pengiriman.

## 2. Status diturunkan dari log (tahan urutan)
Setiap status webhook disimpan di `message_status_events` (unik per provider+pesan+status+waktu) lalu status pesan **dihitung ulang** dari seluruh log:
urutan prioritas **`dibaca` > `diterima` > `gagal` > `terkirim` > `diterima_api`**: `gagal` mengalahkan `terkirim` (mis. `sent` lalu `failed`, atau `sent` yang datang terlambat setelah `failed` → tetap `gagal`) tetapi **kalah** oleh bukti `diterima`/`dibaca`. Akibatnya:
- **Berulang:** status yang sama datang berkali-kali → tidak mengubah apa pun.
- **Tidak berurutan:** `read` sebelum `delivered`, atau `delivered` terlambat setelah `read` → tetap `dibaca`; status mundur tidak pernah terjadi.
- **Sebelum pesan selesai dicatat:** status disimpan lebih dulu, lalu diterapkan saat pesan (balasan API atau **echo**) tercatat.
- **`failed` terlambat** setelah bukti `delivered`/`read` → tidak menimpa (bukti penerimaan menang) — **asumsi desain; perilaku Meta nyata belum diverifikasi**.

## 3. Hasil belum pasti dan rekonsiliasi (tanpa retry buta)
1. Panggilan kirim dilakukan **tepat sekali**. Timeout/jaringan/5xx → pesan ditandai `belum_pasti`; **tidak ada** pengiriman ulang otomatis (kontrak inti #5). Diuji: tepat 1 panggilan ke Meta pada timeout.
2. Setiap permintaan membawa `biz_opaque_callback_data` = kunci idempotensi. Bila Meta kemudian mengirim status dengan nilai itu atau ID pesan, `belum_pasti` otomatis diselesaikan (rekonsiliasi oleh worker, minimal umur 60 detik).
3. Bila tidak ada bukti, pengguna berizin `integration.test` menyelesaikannya **manual** (`POST /api/v1/integration/messages/{id}/resolve`) sebagai `terkirim` atau `gagal` **dengan catatan wajib**; teraudit. Tidak ada tombol "kirim ulang" untuk pesan `belum_pasti` — mengirim lagi adalah keputusan manusia dengan kunci idempotensi baru dan risiko ganda yang disadari.
4. Klik ganda / permintaan ulang dengan kunci idempotensi yang sama → mengembalikan hasil sebelumnya (`duplicate: true`), **tidak** mengirim lagi (diuji, termasuk paralel).

### 3b. `diproses` yang tertahan (G2-A06)
Bila proses mati setelah baris dicatat (sebelum **atau** sesudah panggilan Meta), pesan tertahan di `diproses`. Pemeliharaan worker menandai `diproses` **tanpa ID provider** yang lebih tua dari `max(120 dtk, 4 × META_HTTP_TIMEOUT_MS)` sebagai
**`belum_pasti`** (`proses_terhenti`; teraudit; UPDATE bersyarat sehingga dua pekerja aman) agar masuk alur di atas. **Tidak pernah dikirim ulang.** Pengirim yang hanya lambat (bukan mati) tetap dapat menyelesaikan hasil pastinya (`diterima_api` + ID).

## 4. Kategori galat Meta → operasional
`autentikasi` (token) · `izin` · `rate_limit` · `jendela_layanan` (butuh template) · `penerima_tidak_valid` · `media` · `template` · `parameter` · `server_meta` · `tipe_tidak_didukung` · `tidak_dikenal`; plus lokal: `timeout`, `jaringan`, `media_upload`, `konfigurasi`.
**Pemetaan kode → kategori disusun dari sumber sekunder dan BELUM diverifikasi** terhadap tabel kode galat resmi Meta; kode tak dikenal → `tidak_dikenal` (aman). Pesan mentah dari Meta **tidak** dicatat ke log; yang tersimpan hanya kode/kategori.

## 5. Jendela layanan
- Dihitung dari `last_customer_message_at` + 24 jam, yang HANYA diperbarui dengan **cap waktu provider yang sah** (ada, terbaca, tidak di masa depan > 5 menit). **Waktu kedatangan webhook bukan bukti waktu pesan** (G2-A02): pesan tanpa cap waktu sah tetap tersimpan tetapi tidak membuka/memperpanjang jendela. **History dan echo tidak pernah memperbaruinya.** Jendela diperiksa ulang tepat sebelum panggilan kirim.
- Tertutup / belum ada pesan pelanggan / waktu di masa depan (>5 menit dari jam server) → pesan bebas **diblokir** dengan alasan (diuji, termasuk batas tepat 24 jam). Di luar jendela hanya template yang disetujui (**Tahap 6**).
- Galat Meta `131047` (di luar jendela) tetap dipetakan ke `jendela_layanan` sebagai lapis kedua.
