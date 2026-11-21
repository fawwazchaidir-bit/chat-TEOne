# ADR-0009 — Pembaruan tampilan inbox: polling terkendali (bukan SSE/WebSocket)

- **Status:** Diusulkan · menunggu persetujuan pemilik
- **Tahap:** 3 · memenuhi §12 prompt Tahap 3 ("catat pilihan dan alasannya dalam ADR")

## Konteks
Inbox harus memperbarui diri tanpa refresh manual untuk ±10 pengguna, dengan syarat: izin diperiksa di server untuk **setiap** pembaruan, tidak membocorkan isi ke pengguna yang tidak berhak, tidak menduplikasi tampilan, pulih setelah koneksi terputus, dan beban server terkendali.

## Pilihan
| Opsi | Kelebihan | Kekurangan untuk proyek ini |
|---|---|---|
| **Polling** `GET /inbox/changes` | Setiap panggilan adalah permintaan biasa → melewati `apiFull` (sesi, 2FA, nonaktif ditolak) dan **fragmen akses yang sama** dengan daftar; izin dicabut berlaku pada panggilan berikutnya; tanpa koneksi panjang/state server; mudah diuji end-to-end; tahan restart | Latensi ≤ interval (4 dtk); beban konstan kecil |
| SSE | Latensi rendah | Koneksi panjang di balik reverse proxy; izin harus diperiksa ulang per event di proses yang menyimpan koneksi; pencabutan izin saat koneksi hidup perlu mekanisme tambahan; kebutuhan broker/LISTEN-NOTIFY bila >1 proses |
| WebSocket | Dua arah | Semua beban SSE + autentikasi ulang + CSRF/Origin pada handshake; berlebihan untuk 10 pengguna |

## Keputusan
**Polling** dengan rancangan berikut:
- **Sumber perubahan:** `conversations.change_at`, diperbarui oleh trigger basis data (`te_conversation_touch` pada UPDATE percakapan; `te_conversation_bump` pada INSERT/UPDATE pesan yang relevan dan catatan internal), sehingga setiap perubahan — termasuk hasil pengiriman dan status AI — terlihat tanpa kode tambahan di tiap modul.
- **Kursor:** server mengembalikan `serverTime` (jam basis data). Klien meminta `since = serverTime − 2 dtk` (**jendela tumpang-tindih**) dan **menggabung per `id`** (hasil muat ulang daftar **mengganti** isi daftar) ⇒ tidak ada duplikasi dan tidak ada perubahan yang terlewat karena selisih jam/transaksi yang commit terlambat.
- **Izin per panggilan:** `inboxChanges` memakai `conversationAccessSql` — percakapan yang aksesnya dicabut (pengalihan ditarik, peran dicabut, pengguna nonaktif) **tidak muncul**, dan isi tidak dikirim. Kursor tidak membawa data; kursor rusak/kosong → `resync: true` (klien memuat ulang penuh).
- **Beban terkendali:** interval 4 dtk; **jeda saat tab tersembunyi** (lanjut + resync saat terlihat); backoff eksponensial sampai 30 dtk bila galat; maksimum 100 item per respons (`truncated` → muat ulang daftar); muat ulang daftar dibatasi ≤ 100 baris. Untuk ~10 pengguna ≈ 2,5 permintaan/dtk di puncak.
- **Pulih setelah koneksi terputus:** galat jaringan → indikator "koneksi pembaruan terputus" + coba lagi; peristiwa `online` memicu resync; setelah pulih sukses pertama → muat ulang daftar, navigasi, dan percakapan terbuka.
- **Nonaktif/sesi habis:** 401 → klien diarahkan ke halaman login (sesi lama ditolak server).

## Konsekuensi
- Latensi pembaruan ≤ ~4 dtk (diterima untuk inbox tim ±10 orang; bukan percakapan real-time antar-pelanggan).
- Bila jumlah pengguna tumbuh jauh (>100 serentak), ganti transport ke SSE **tanpa mengubah kontrak**: sumber kebenaran dan pemeriksaan izin tetap `inboxChanges`. Perubahan itu memerlukan ADR baru.
- Bukti: test `@tahap-3` untuk umpan perubahan (hanya yang berhak; resync; tanpa duplikasi; akses dicabut tidak bocor; perubahan admin lain terlihat tanpa refresh) — **simulasi** (tanpa browser nyata); E2E G3 memverifikasi dari sisi browser.
