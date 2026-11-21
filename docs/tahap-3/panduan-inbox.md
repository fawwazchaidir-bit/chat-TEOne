# Panduan inbox

> Semua izin diperiksa **di server**. Tombol yang tampil hanya mencerminkan izin Anda; menyembunyikan tombol bukan penjaga.

## Layout
`Navigasi` · `Daftar percakapan` · `Isi percakapan` · `Panel informasi`. Di layar sempit kolom bertumpuk.

### Navigasi
- **Semua percakapan**, **Ditugaskan ke saya**, **Belum ditugaskan**.
- Per **channel** dengan indikator kondisi dari **data nyata**: *Terverifikasi (nyata)*, *Terverifikasi — SIMULASI*, *Belum diperiksa*, *Pemeriksaan gagal*, *Belum dikonfigurasi*. Indikator ini **hanya** pemetaan nomor (lihat Tahap 2); bukan bukti "siap menerima pesan".
- Per **tim/antrian**. Jumlah di setiap entri sudah difilter izin channel Anda (tidak membocorkan jumlah channel lain).
- Spanduk merah muncul bila ada **kill switch** menyala pada cakupan yang terlihat.

### Daftar
Nama/identitas (nomor **disamarkan**: `••••1234`), channel, ringkasan pesan terakhir, waktu, jumlah belum dibaca, status AI, tim & PIC, penanda *Eskalasi*, *Lead nyasar*, *Perlu ditinjau*. Urut menurut waktu pesan; **history yang masuk terlambat tidak menaikkan chat lama ke atas**.
- **Cari** nama atau (≥ 4 digit) nomor; karakter `%`/`_` tidak berfungsi sebagai wildcard.
- **Filter**: channel, tim, PIC (saya/belum), belum dibaca, status AI, eskalasi, lead nyasar, perlu ditinjau. **Muat lebih banyak** memakai kursor yang stabil.

### Isi percakapan
Pesan masuk/keluar dengan **sumber**: *Pelanggan*, **TE One**, **WhatsApp Business App**, **History**, *AI (simulasi)*. Status keluar ditampilkan apa adanya: *Sedang dikirim / belum pasti*, *Diterima Meta*, *Terkirim*, *Diterima*, *Dibaca*, **Gagal** (dengan kategori), **BELUM PASTI**. Media yang tidak tersedia atau jenis yang belum didukung diberi penanda. **Catatan internal** tampil kuning bergaris putus dan **tidak pernah dikirim** ke pelanggan. Isi pesan dan nama berkas dirender sebagai teks biasa (tidak ada HTML).

### Panel informasi
Status AI (+ batas aktivasi, riwayat, job simulasi), tim & PIC, pengalihan, penanda Lead Nyasar, kontak (nomor lengkap hanya di sini, untuk yang berhak), sumber lead, **riwayat kontak yang sama di channel lain — hanya channel yang Anda berizin**, aktivitas penting.

## Membalas
1. **Tab "Balas pelanggan"**: teks, gambar (JPEG/PNG/WebP), atau PDF (+ keterangan). Penerima **tidak dapat diubah**: diambil server dari percakapan.
2. Bila **jendela layanan 24 jam tertutup** (atau belum ada pesan pelanggan yang terbukti), tombol kirim nonaktif dan alasannya ditampilkan; pesan bebas tidak akan dikirim (template = Tahap 6).
3. Klik ganda atau ulang jaringan **tidak menggandakan pesan**: komposer memakai **kunci idempotensi** yang sama sampai pengiriman berhasil.
4. Hasil: *Diterima Meta* / **Gagal** / **BELUM PASTI**. Untuk BELUM PASTI **jangan kirim ulang** sebelum memeriksa status; sistem tidak pernah mengirim ulang otomatis.
5. **Membalas mematikan AI** pada percakapan itu (alasan "admin membalas"). AI **tetap Off** walau pengiriman gagal.
6. Di non-production, penerima di luar **daftar penerima uji** ditolak (403) dan diaudit.

## Catatan internal
Tab **"Catatan internal"** (izin `chat.note`). Maks. 2000 karakter. Tidak masuk jalur kirim sama sekali (dijaga test struktural); isinya tidak dicatat di audit (hanya panjangnya). Tidak dapat diubah/dihapus aplikasi (append-only di database).

## Balasan cepat
Halaman **Balasan cepat** (izin `quickreply.manage` bercakupan channel): judul + isi per channel dengan variabel aman **`{nama}`** dan **`{channel}`**. Token lain (termasuk `{NAMA}`) **ditolak** agar tidak terkirim apa adanya. Memilih balasan cepat di komposer hanya **mengisi teks**; pengiriman tetap melewati izin, jendela layanan, dan idempotensi. Semua perubahan teraudit.

## Pembaruan tampilan
Polling 4 detik (ADR-0009): perubahan oleh admin lain terlihat tanpa refresh; jeda saat tab tersembunyi; spanduk kuning bila koneksi terputus; pulih otomatis. Sesi yang tidak sah lagi mengarahkan ke login.

## Batasan yang diketahui (jujur)
- Belum diuji dengan Meta nyata maupun browser berbagai perangkat; E2E hanya Chromium.
- Pesan lebih lama dari 100 terbaru dalam satu percakapan belum dapat digulir mundur di UI (API mendukung `before`).
- Notifikasi suara/desktop belum ada.
