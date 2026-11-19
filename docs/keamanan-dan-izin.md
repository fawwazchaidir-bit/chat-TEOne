# Keamanan & izin (Tahap 1; diperbarui Tahap 2)

> Keamanan webhook/Meta/media ada di [`tahap-2/webhook-dan-keamanan.md`](tahap-2/webhook-dan-keamanan.md).

## 1. Autentikasi
| Kontrol | Implementasi | Bukti uji |
|---|---|---|
| Penyimpanan sandi | **Argon2id** (m=19 MiB, t=2, p=1); min. 12 karakter; waktu respons disamakan untuk akun tak ada (`burnPasswordCheck`) | `auth.test` |
| Sesi | Token acak 256-bit; di DB hanya **hash SHA-256**; cookie `HttpOnly; SameSite=Lax` (+`Secure`/`__Host-` di staging/production); absolut 12 jam, idle 4 jam; sesi *pending* (belum lolos 2FA) hanya 10 menit | `auth.test` |
| Pencabutan sesi | Saat dinonaktifkan, sandi/2FA direset, atau sandi diganti → baris sesi **dihapus di DB** (eager) dan dicek ulang di setiap permintaan | `auth.test` (diperkuat mutation test) |
| CSRF | Token per-sesi (`X-CSRF-Token`, dibandingkan konstan-waktu) **dan** pemeriksaan `Origin`/`Referer` untuk semua POST/PUT/PATCH/DELETE (juga login) | `auth.test`, E2E |
| Pembatasan login | ≥5 kegagalan/15 mnt per akun atau ≥30 per IP (IP diketahui) → 429 + `Retry-After`; kegagalan password/TOTP/kode pemulihan dihitung bersama | `auth.test` |
| Validasi input | zod di server untuk semua body/query/param; batas 100 KB | `auth.test` |
| Pesan error | Generik untuk login; 500 hanya `INTERNAL` + ID korelasi | `auth.test` |

## 2. 2FA (TOTP)
- **Wajib** untuk Super Admin; dapat diwajibkan per pengguna atau per peran (hanya Super Admin yang mengubahnya); opsional untuk lainnya.
- Selama TOTP belum selesai, **seluruh API/halaman administratif ditolak** (`403 TOTP_REQUIRED` / `TOTP_SETUP_REQUIRED`) dan UI mengarahkan ke langkah 2FA. Stage dihitung ulang di setiap permintaan.
- Rahasia TOTP: **AES-256-GCM** dengan `APP_ENCRYPTION_KEY` (terpisah dari DB). Proteksi **replay**: satu langkah 30 detik hanya sekali (update atomik `totp_last_step`).
- **10 kode pemulihan** (80-bit, tampil sekali): hanya **HMAC-SHA256** (sub-kunci HKDF) yang tersimpan; sekali pakai lewat `UPDATE … WHERE used_at IS NULL RETURNING` (atomik; diuji 4 permintaan paralel → tepat 1 berhasil).
- **Prosedur pemulihan akun:** (1) pengguna biasa/Super Admin lain kehilangan perangkat → administrator berizin `user.manage` melakukan *Reset 2FA* (sesi dicabut; wajib mendaftar ulang); (2) **Super Admin satu-satunya** kehilangan 2FA/sandi → akses server: `npm run admin:recover -- reset-2fa|reset-password <email>` (tercatat di audit, aktor `cli:recover`).

## 3. Model izin: AKSI + CAKUPAN
20 izin (registri `roles-permissions/registry.ts`; Tahap 2 menambah `integration.test` — ADR-0004). Izin bercakupan channel (`channelScoped`) dapat diberikan pada **semua channel** atau **channel tertentu**; izin global (kelola pengguna/peran/tim, lihat audit, kill switch) hanya "semua".

Aturan keputusan (fungsi murni `PermissionSet`, 11 unit test):
1. **Default menolak.** Tanpa grant → ditolak.
2. **Penolakan spesifik pengguna mengalahkan izin dari peran** (juga sebagian: "semua channel kecuali X").
3. Aksi bercakupan channel tanpa `channelId` berarti "di semua channel" → hanya lolos bila izin "semua" dan tidak ada penolakan sama sekali.
4. Perubahan izin berlaku **pada permintaan berikutnya** (izin dimuat dari DB tiap permintaan; tanpa cache).
5. **Super Admin** = penanda khusus (bukan peran): akses penuh; penolakan tidak berlaku.

**Respons:** tanpa izin sama sekali → `403`; punya izin tetapi channel di luar cakupan → `404` (keberadaan channel tidak dibocorkan); daftar disaring di server. Contoh terbukti: pengguna Hotline tidak dapat melihat/mengubah/mengarsipkan channel Admisi lewat UI maupun API langsung (integrasi + Golden E2E G1).

### Anti-eskalasi (CCP 1.2)
- Tidak ada yang dapat mengubah **peran, izin, atau status akun sendiri**.
- Hanya Super Admin yang dapat memberi/mencabut hak Super Admin; non-Super Admin **tidak dapat menyentuh akun Super Admin** (ubah, nonaktifkan, reset).
- **Pemberi hanya dapat memberikan izin yang ia miliki sendiri** (termasuk cakupannya) — berlaku untuk grant langsung dan untuk peran yang ditambahkan ke pengguna. Menolak (deny) selalu boleh.
- Pemegang `role.manage` tidak dapat mengubah/menghapus **peran yang ia pegang**.
- `killswitch.manage` hanya dapat diberikan oleh Super Admin; mewajibkan 2FA per pengguna/peran hanya oleh Super Admin.
- **Super Admin aktif terakhir** tidak dapat dinonaktifkan/diturunkan/dihapus — dijaga di API **dan trigger database** (advisory lock; uji dua Super Admin saling menurunkan bersamaan → tepat satu berhasil).

## 4. Tim
Entitas sederhana (nama, anggota, channel yang ditangani) + CRUD & audit; dipakai antrean/routing di Tahap 3. Nama channel di luar cakupan `channel.view` pengguna **tidak ditampilkan**, dan menyimpan perubahan **tidak menghapus** channel tersembunyi milik tim.

## 5. Channel (aturan data)
- Batas aktif = pengaturan organisasi (bawaan 5), ditegakkan **trigger + advisory lock** (24 permintaan API paralel & 30 INSERT langsung ke DB → tepat 5).
- Arsip membebaskan slot segera; memulihkan butuh slot kosong + nama aktif belum dipakai; jejak audit tetap.
- Status hanya `belum_dikonfigurasi | sedang_dikonfigurasi` (CHECK DB) — **tidak ada "terhubung"**; status tidak dapat diubah lewat API.
- Penanda `operasional`: hanya Super Admin, hanya di lingkungan production dan bukan data contoh (CHECK DB); guard CI menolaknya di seed/fixture.

## 6. Audit log
Peristiwa: login/logout, login gagal/terblokir, TOTP/kode pemulihan, pembuatan & perubahan pengguna, aktivasi/nonaktivasi, peran/izin/cakupan, tim, channel, pengaturan organisasi, feature flag, kill switch. Isi: waktu, aktor, tindakan, objek, hasil, ID korelasi, IP. Ditulis **dalam transaksi yang sama** dengan perubahan. Rahasia disamarkan (`redact`); tidak ada isi chat.
**Append-only bagi aplikasi — dua lapis:** (1) role `teone_app` tidak punya UPDATE/DELETE/TRUNCATE dan tidak punya DDL; (2) trigger menolak UPDATE/DELETE/TRUNCATE **bahkan oleh pemilik tabel**.
**Batas perlindungan:** *superuser/administrator database* masih dapat melepas trigger atau mengubah data. Mitigasi (belum dibuat): pembatasan akses DB admin, pengiriman audit ke penyimpanan luar server (Tahap 7), backup terenkripsi berkala sebagai pembanding.

## 7. Kontrol lain
Feature flag default mati & fail-closed; kill switch fail-closed tanpa cache dan tidak pernah melepas sendiri (dijaga test arsitektur); guard nomor operasional + secret scan di CI; header keamanan; health minimal; tidak ada konektor WhatsApp tidak resmi (test arsitektur memeriksa dependensi & kode).
