# Klasifikasi data & rancangan retensi

> **D-18 Diputuskan (26 Nov 2026) untuk STAGING**; untuk production arah disetujui, **final setelah tinjauan penasihat hukum** (bukan nasihat hukum). Staging **tidak boleh menyimpan data pelanggan nyata**: payload mentah ≤ 30 hari (diterapkan di kode, dijalankan **worker**), log teknis ≤ 30 hari tanpa isi chat dan debug Caddy mati, data penguji dihapus sebelum go-live, backup rotasi 7 hari (D-12), insiden data nyata → catat jumlah dan hapus ≤ 3 hari kerja.
> **Nilai yang SAMA dengan keputusan** (penanda ASUMSI diganti): payload mentah ≤ 30 hari. **Nilai yang BERBEDA — tidak diubah diam-diam, dilaporkan di `reports/perbaikan-fase-1.md`:** log teknis (tabel: ≤ 90 hari; keputusan: staging ≤ 30, production 90) dan isi chat/media (tabel: 2 tahun; keputusan: staging dihapus saat reset/sebelum go-live, production 2 tahun).

## 1. Klasifikasi
| Kelas | Contoh | Perlakuan |
|---|---|---|
| **Rahasia** | sandi (hash Argon2id), rahasia TOTP (terenkripsi), hash kode pemulihan, token sesi (hash), `APP_ENCRYPTION_KEY`, token Meta/API AI (Tahap 2+) | tidak pernah di repo/log/audit/screenshot; enkripsi saat disimpan dengan kunci terpisah; akses minimum |
| **Pribadi (internal)** | email & nama pengguna TE One, IP/UA sesi, `login_attempts` | akses oleh pengguna berizin; tampil ke pemilik data dan Super Admin |
| **Pribadi (pelanggan)** — *Tahap 2+* | identitas kontak, nomor, nama profil, isi chat, media, sumber lead | difilter per cakupan channel; media privat; retensi & hapus-atas-permintaan (D-18) |
| **Internal** | audit log (tanpa rahasia & isi chat), konfigurasi organisasi, channel/tim/peran | append-only (audit); backup terenkripsi |
| **Teknis** | log aplikasi, payload webhook mentah (Tahap 2) | tanpa isi chat/rahasia; retensi pendek |

## 2. Retensi (usulan awal D-18; keputusan di catatan atas) dan status implementasi
| Data | Usulan | Status Tahap 1 |
|---|---|---|
| Payload webhook mentah | ≤ 30 hari | **Dibuat (Tahap 2), terbukti simulasi**: dibuang saat tidak diperlukan; sisanya dibersihkan **worker** setelah 30 hari (**D-18 Diputuskan**; tidak berjalan tanpa worker, S-10) |
| Isi chat & media | usulan 2 tahun, lalu arsip/hapus | Data kini **disimpan** (Tahap 2); **pembersih/arsip belum ada**; media di filesystem privat **tanpa backup** (T2-F11) |
| Log teknis | ≤ 90 hari, tanpa isi chat (**keputusan: staging ≤ 30 hari, production 90**) | Log akses Caddy: tanpa header/body, dipangkas 720 jam (`deploy/Caddyfile`); log kontainer dibatasi **ukuran**, belum umur (butir berikutnya); log aplikasi hanya pesan error + ID korelasi |
| `login_attempts` | ikut log teknis ≤ 90 hari | **Belum ada pembersih** (T1-F06) |
| Sesi kedaluwarsa | segera | Dibersihkan *lazy* (saat dipakai / login berikutnya); pembersih terjadwal belum ada |
| Audit log | belum ditetapkan (usulan: selama kebutuhan audit; tidak dihapus aplikasi) | Append-only; kebijakan arsip/hapus **belum diputuskan** — perlu jalur terkontrol (ADR) bila diputuskan |
| Permintaan akses/hapus dari pelanggan | ≤ 14 hari kerja oleh pengguna berwenang, teraudit | Belum ada (Tahap 2+); skema kontak (ADR-0003) dirancang agar penghapusan per kontak dapat dilakukan |

## 3. Pihak ketiga & lokasi (dicatat sesuai D-18/D-19)
| Pihak | Data yang akan dikirim | Status |
|---|---|---|
| Meta (WhatsApp Cloud API) | pesan, media, nomor penerima, nama profil, ID kontak | **Kode siap (Tahap 2); belum ada koneksi nyata**. Nomor penerima dikirim **hanya** ke nomor di daftar uji |
| Provider AI (D-09) | konteks percakapan minimum **tanpa nomor telepon**, tanpa rahasia | **D-09 belum diputuskan**; belum ada |
| Hosting (D-19) | seluruh data | VPS tersendiri; **lokasi dicatat saat staging/production dibuat** (belum ada) |

## 4. Kontrol yang sudah ada di Tahap 1
Enkripsi rahasia saat disimpan, hash sandi/kode pemulihan, audit tanpa rahasia (diuji memindai seluruh `audit_log`), pembatasan akses per cakupan channel, backup terenkripsi, pemisahan lingkungan, guard CI yang menolak nomor telepon lengkap di repository.
