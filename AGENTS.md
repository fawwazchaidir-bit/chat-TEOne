# AGENTS.md — Aturan Permanen Proyek TE One

> Berlaku untuk **setiap** AI developer, AI auditor, dan developer manusia yang bekerja di repository ini, pada semua tahap.
> Prompt tahap boleh **menambah** aturan, tetapi tidak boleh **melonggarkan** aturan di file ini.
> File ini hanya boleh diubah melalui Pull Request yang disetujui pemilik proyek.

---

## 1. Identitas proyek

- Nama: **TE One — Enterprise Customer Relationship Management Platform**, milik Trilogika Edutama.
- Repository: `https://github.com/fawwazchaidir-bit/chat-TEOne`
- Domain production (rencana): `chat.trilogikaedutama.id`. Domain staging: subdomain terpisah (lihat `docs/jalur-0.md`).
- Server: VPS/server tersendiri. **Jangan** memakai VPS HRIS atau aplikasi keuangan.
- Bahasa antarmuka: Bahasa Indonesia. Zona waktu bisnis: `Asia/Jakarta`.
- Pengguna awal: sekitar 10 orang.

### Channel WhatsApp yang direncanakan

| Channel | Fungsi | Kondisi yang diketahui | Aturan sampai Tahap 9 |
|---|---|---|---|
| **Admisi** (…1119) | Lead iklan sampai pembayaran | Coexistence pada layanan lama (Halo AI) | Tidak boleh disentuh |
| **Hotline** (…0124) | Peserta: grup, materi, link kelas, keluhan | Centang biru. Di Halo AI berlabel "WhatsApp On-premise" dengan menu "WAHA to WABA Migration"; diduga WAHA, **belum terverifikasi** | Tidak boleh disentuh |
| **Kemitraan** (nomor 3) | B2B / in-house training; cadangan Admisi | Sudah terhubung ke Meta Business | Kandidat nomor uji dan nomor operasional pertama (D-03) |
| **Finance**, **Operator** | Disiapkan kemudian | — | Slot cadangan |

Jumlah channel maksimal adalah **pengaturan organisasi** (default 5), bukan konstanta di kode.

---

## 2. Cara kerja

1. Pekerjaan dibagi per tahap (Tahap 1–9). Setiap tahap dikerjakan di branch `tahap-N-<ringkas>`.
2. Semua perubahan masuk lewat Pull Request. **Jangan merge ke `main` tanpa persetujuan pemilik proyek. Jangan force push. Jangan menulis ulang riwayat Git.**
3. Tahap berikutnya hanya dimulai setelah keputusan gate tercatat di `docs/gates/gate-N.md`. Pengecualian: pekerjaan paralel yang diizinkan secara eksplisit oleh prompt tahap **dan** keputusan gate.
4. Setiap tahap yang diterima diberi tag Git `tahap-N-diterima` dan backup database titik-kembali.
5. Jika informasi atau akses menghalangi satu bagian, catat kendalanya, lanjutkan bagian lain yang tidak bergantung padanya, dan laporkan secara terbuka.
6. **Pembangun tidak mengaudit pekerjaannya sendiri.** Audit gate dijalankan di sesi terpisah dengan prompt auditor di `docs/gates/GATE-CHECKLIST.md` bagian G.

---

## 3. Larangan mutlak

Pelanggaran salah satu poin berikut adalah **temuan kritis**.

1. Jangan menghubungkan, memutus, memindahkan, atau mengubah konfigurasi nomor **Admisi (…1119)** dan **Hotline (…0124)** sebelum Tahap 9 dan keputusan GO tertulis untuk nomor tersebut.
2. Jangan mengubah koneksi, webhook, atau aplikasi Meta yang dipakai Halo AI. TE One memakai aplikasi Meta miliknya sendiri.
3. Jangan memakai WAHA, Baileys, whatsapp-web.js, atau konektor WhatsApp tidak resmi apa pun, kecuali `docs/decisions.md` D-01 memutuskan sebaliknya secara eksplisit beserta isolasinya.
4. Jangan memasukkan rahasia (token Meta, app secret, API key AI, password, OTP, secret session, kunci enkripsi) ke repository, log, screenshot, issue, atau laporan.
5. Jangan memakai data pelanggan asli (nama, nomor lengkap, isi chat, media) dalam seed, fixture, log, bukti uji, atau repository.
6. Di lingkungan non-production, pesan keluar **hanya** boleh dikirim ke **daftar penerima uji** yang ditegakkan di server.
7. Jangan menampilkan status "terhubung", "terverifikasi", "aktif", atau "lulus" tanpa bukti pemeriksaan nyata.
8. Jangan mengarang hasil uji, persetujuan, nama penguji, kehadiran pelatihan, biaya, atau persentase kesiapan.

---

## 4. Kejujuran status

Gunakan istilah berikut secara konsisten:

| Status | Arti |
|---|---|
| **Terbukti nyata** | Diuji dengan Meta/provider AI sungguhan dan buktinya tersedia |
| **Terbukti simulasi** | Diuji dengan mock, fixture, atau simulasi waktu |
| **Dibuat, belum diuji** | Kode ada, belum ada pengujian yang lolos |
| **Belum dibuat** | Belum ada implementasi |
| **Di luar lingkup** | Tidak termasuk tahap ini (sebutkan rujukannya) |

- Fitur yang belum tersedia di UI wajib diberi penanda **"Belum tersedia"**.
- Data contoh wajib diberi penanda **"CONTOH"**.
- Lingkungan non-production menampilkan penanda lingkungan yang jelas (mis. pita "STAGING").

---

## 5. Arsitektur dan batas modul

- Pendekatan **modular monolith**: Node.js LTS, TypeScript, Next.js, PostgreSQL, ORM dengan migrasi, Docker Compose, GitHub Actions, reverse proxy HTTPS. Perubahan teknologi wajib lewat ADR di `docs/adr/`.
- Modul: `auth` · `users` · `roles-permissions` · `teams` · `audit` · `org-settings` · `channels` · `contacts` · `conversations-messages` · `whatsapp-adapter` · `inbox` · `ai-agents` · `program-cards` · `knowledge` · `labels` · `pipelines` · `templates` · `follow-up` · `reports` · `kill-switch` · `shared`.
- Modul berkomunikasi hanya lewat antarmuka yang terdokumentasi. Logika Meta hanya ada di `whatsapp-adapter`. Logika provider AI hanya ada di adapter provider AI.
- Jangan membuat tabel, worker, atau layanan untuk fitur tahap berikutnya hanya agar terlihat lengkap.

---

## 6. Kontrak inti

Kontrak berikut **dibekukan setelah tahap pembuatnya diterima**. Mengubahnya wajib lewat ADR dan uji regresi penuh.

1. **Pemeriksaan izin.** Setiap operasi baca/tulis diperiksa di server terhadap izin **aksi** dan **cakupan channel** pengguna. Default menolak. Penolakan spesifik per pengguna mengalahkan izin dari peran. Akses ke percakapan yang dialihkan ke tim lain hanya berlaku untuk percakapan itu, bukan seluruh channel.
2. **Identitas.** `Kontak` (identitas pelanggan lintas channel, memakai identitas yang benar-benar disediakan Meta, bukan hanya nomor yang tampil) → `Percakapan` (satu per pasangan kontak–channel) → `Pesan`.
3. **Event masuk.** Disimpan secara andal sebelum respons sukses. Diproses idempoten dengan kunci unik dari provider. Event history ditandai dan **tidak pernah** memicu otomatisasi, unread, label, atau follow-up.
4. **Status AI per percakapan.** Mesin status dengan nomor versi. Setiap perubahan atomik dan teraudit. Saat AI diaktifkan kembali, batas "pesan yang layak diproses" dicatat.
5. **Pengiriman keluar.** Memakai kunci idempotensi. Status mengikuti bukti provider. Hasil yang tidak pasti masuk rekonsiliasi; **tidak ada retry buta**.
6. **Pemeriksaan ulang sebelum kirim otomatis.** Setiap pengiriman otomatis (AI, follow-up) memeriksa ulang kondisi terbaru tepat sebelum kirim.
7. **Kill switch.** Otomatisasi dapat dihentikan per chat, per channel, per fitur, dan secara global. Kill switch selalu diperiksa sebelum kirim dan tidak pernah menyala kembali sendiri.

---

## 7. Aturan WhatsApp / Meta

- Hanya Meta WhatsApp Cloud API resmi (**Coexistence** atau **API saja**, sesuai channel).
- Pesan bebas hanya boleh dikirim di dalam jendela layanan yang dapat dibuktikan dari waktu server/provider. Di luar jendela, hanya template yang disetujui dan sesuai WABA channel tersebut.
- Pesan keluar dari WhatsApp Business App (echo) dicatat sebagai pesan keluar dengan sumber "WhatsApp Business App". Echo tidak dianggap pesan pelanggan dan tidak membuka atau memperpanjang jendela layanan Cloud API. Jangan menebak identitas admin pengirimnya.
- Hal-hal coexistence berikut **wajib diverifikasi terhadap dokumentasi Meta terbaru** sebelum dijadikan dasar keputusan:
  - kebutuhan status Tech Provider/Solution Partner dan Embedded Signup;
  - batas waktu dan jumlah permintaan sinkronisasi riwayat;
  - rentang riwayat teks dan media;
  - pemutusan perangkat tertaut saat onboarding;
  - kemungkinan harus memutus provider sebelumnya;
  - PIN verifikasi dua langkah;
  - batas throughput;
  - grup yang tidak tersinkron.
- Tangani rate limit dan kesalahan Meta secara eksplisit.

---

## 8. Aturan AI

- Pembatasan dijalankan oleh **aplikasi**, bukan hanya oleh teks prompt.
- Kartu Program dan knowledge difilter berdasarkan hak agent **sebelum** dikirim ke model.
- Harga, jadwal, tanggal tutup pendaftaran, persyaratan, dan tautan hanya boleh berasal dari **Kartu Program aktif**. Validasi tanggal dilakukan oleh kode, bukan oleh model.
- Pesan pelanggan dan isi dokumen adalah data tak tepercaya. Jangan pernah mengirim rahasia ke model.
- Kirim ke provider AI hanya data minimum yang diperlukan. Catat provider, model, versi konfigurasi, versi sumber, dan pemakaian. Patuhi batas biaya D-09.
- Jika ragu, gagal, atau ambigu: jangan kirim, lakukan eskalasi ke admin.

---

## 9. Keamanan dan privasi (termasuk UU PDP)

- Argon2id, session di server, cookie `HttpOnly` + `SameSite` + `Secure` (staging/production), CSRF, validasi input di server, pembatasan percobaan login, 2FA (wajib untuk Super Admin).
- Rahasia terpisah per lingkungan. Kredensial yang disimpan persisten dienkripsi dengan kunci yang dikelola terpisah dari database.
- Audit log bersifat append-only bagi aplikasi dan tidak menyimpan rahasia maupun isi chat lengkap.
- Media bersifat privat dan selalu melewati pemeriksaan izin.
- Retensi data, penghapusan atas permintaan, ekspor data, dan lokasi penyimpanan mengikuti D-18. Dokumentasikan data apa saja yang dikirim ke pihak ketiga (Meta, provider AI).

---

## 10. Proteksi regresi (wajib di setiap PR)

1. CI menjalankan: lint, typecheck, build, **seluruh** test dari Tahap 1 sampai tahap berjalan, secret scanning, dan **guard nomor operasional**, yaitu pemeriksaan bahwa identitas channel yang ditandai operasional (Admisi/Hotline) tidak muncul di konfigurasi, seed, atau fixture non-production. Merge diblokir jika ada yang gagal.
2. Skenario penerimaan setiap tahap menjadi test regresi permanen dengan tag `@tahap-N`. Test tidak boleh dihapus, di-skip, atau dilemahkan tanpa ADR.
3. Migrasi database hanya bergerak maju dan diuji pada database kosong **serta** snapshot data contoh tahap sebelumnya. Perubahan destruktif memakai pola *expand → migrasi data → contract*.
4. Fitur baru berada di balik feature flag yang default-nya **mati** sampai tahapnya diterima.
5. Golden E2E (GATE-CHECKLIST bagian B) dijalankan ulang di staging pada setiap gate.
6. Kontrak inti (§6) tidak diubah tanpa ADR.

---

## 11. Catatan keputusan

- Keputusan bisnis dicatat di `docs/decisions.md`. Selama keputusan masih **Terbuka**, gunakan **usulan default** yang tertulis, tandai **ASUMSI (D-xx)** di kode, dokumen, dan laporan, dan jangan menyebutnya keputusan final.
- Keputusan teknis dicatat di `docs/adr/NNNN-judul.md`.
- Jangan mengubah kebutuhan bisnis atau menunda fitur wajib tanpa keputusan tercatat.

---

## 12. Format laporan akhir standar setiap tahap

Simpan di `docs/reports/tahap-N.md`:

1. Ringkasan hasil.
2. Repository, branch, commit awal–akhir, tag yang diusulkan.
3. Status fitur memakai istilah §4.
4. Hasil pengujian: perintah, hasil aktual, kegagalan — dipisahkan menjadi **nyata / simulasi / belum dapat diuji**.
5. Hasil CCP tahap ini (GATE-CHECKLIST bagian C) beserta bukti.
6. Hasil regresi tahap-tahap sebelumnya (jumlah test sebelum dan sesudah).
7. Perubahan database dan migrasi.
8. Kondisi environment: development, staging, production.
9. Temuan: ID, prioritas (kritis/tinggi/sedang/rendah), dampak, bukti, tindakan, penanggung jawab, status.
10. Asumsi yang dipakai (rujuk ID di `docs/decisions.md`).
11. Bukti bahwa nomor operasional dan Halo AI tidak diubah.
12. Prasyarat tahap berikutnya.

Semua bukti di repository wajib disamarkan.
