# Checklist Gate CCP — TE One

Dokumen ini dipakai pada **setiap rapat gate** (akhir Tahap 1–9) untuk memutuskan apakah pekerjaan boleh maju ke tahap berikutnya tanpa merusak tahap sebelumnya.

**Critical Control Point (CCP)** adalah titik yang, jika gagal, menimbulkan risiko serius (pesan salah kirim, otomatisasi tak terkendali, kebocoran data, kehilangan data). Setiap CCP punya **batas kritis**. Jika batas kritis terlampaui, keputusan untuk lingkup terdampak adalah **TAHAN**, berapa pun tekanan tanggalnya.

---

## Cara pakai

1. Developer menyelesaikan tahap dan menulis `docs/reports/tahap-N.md` (format AGENTS.md §12).
2. **Auditor independen** (sesi AI baru, memakai prompt di bagian G, bukan sesi yang membangun) memeriksa repository dan bukti, lalu mengisi salinan checklist ini sebagai `docs/gates/gate-N.md`.
3. **Rapat gate 30 menit** (agenda di bagian E). Pemilik proyek memutuskan dan mengisi formulir di bagian F.
4. Pilihan keputusan:
   - **LANJUT** — semua CCP lulus dan bukti nyata tersedia.
   - **LANJUT TERBATAS** — boleh mulai tahap berikutnya dengan simulasi/paralel. Bagian yang belum terbukti nyata wajib ditulis beserta penanggung jawab dan tenggatnya.
   - **TAHAN** — ada CCP gagal, temuan kritis/tinggi, atau bukti tidak memadai.
5. Jika LANJUT: developer membuat tag `tahap-N-diterima` dan backup database titik-kembali.

Simbol pengisian: ✅ lulus · ❌ gagal · ⏳ tertunda (sebutkan alasan) · N/A tidak berlaku (sebutkan alasan).

---

## A. Gate maju — berlaku di setiap gate

| # | Pemeriksaan | Bukti yang diminta | Hasil |
|---|---|---|---|
| A1 | Laporan tahap lengkap sesuai format AGENTS.md §12 | `docs/reports/tahap-N.md` | |
| A2 | CI hijau pada commit yang diaudit | Link run CI + hash commit | |
| A3 | Semua CCP tahap ini (bagian C) lulus pada batas kritisnya | Tabel bagian C terisi + bukti | |
| A4 | Temuan **kritis = 0**; temuan **tinggi = 0** pada lingkup yang menjadi dasar tahap berikutnya | Daftar temuan | |
| A5 | Hasil nyata dan simulasi dipisahkan; yang belum terbukti nyata tercantum eksplisit | Bagian hasil uji pada laporan | |
| A6 | Keputusan `docs/decisions.md` yang dibutuhkan tahap berikutnya sudah **Diputuskan**, atau pemakaian ASUMSI disetujui eksplisit di rapat ini | Daftar ID D-xx | |
| A7 | Nomor operasional (Admisi, Hotline) dan koneksi Halo AI **tidak diubah** | Pernyataan + bukti konfigurasi | |
| A8 | Tidak ada rahasia atau data pelanggan di repository | Hasil secret scan + guard nomor operasional | |
| A9 | Dokumentasi yang diwajibkan prompt tahap tersedia | Daftar file | |
| A10 | Prasyarat tahap berikutnya (akses, server, data, Jalur 0) tersedia atau ada rencana bertanggal | Status `docs/jalur-0.md` | |

---

## B. Proteksi mundur — tahap baru tidak boleh merusak tahap lama

| # | Pemeriksaan | Batas kritis | Bukti | Hasil |
|---|---|---|---|---|
| B1 | Test regresi `@tahap-1` … `@tahap-(N−1)` lulus di CI | 0 gagal; jumlah test tidak berkurang; tidak ada test di-skip tanpa ADR | Ringkasan CI: jumlah test per tag sebelum vs sesudah | |
| B2 | Migrasi diuji pada DB kosong **dan** snapshot data contoh tahap sebelumnya | 0 kegagalan; 0 kehilangan data | Log migrasi + hitungan baris sebelum/sesudah | |
| B3 | Kontrak inti (AGENTS.md §6) tidak berubah, atau ada ADR + regresi penuh | 0 perubahan tanpa ADR | Diff file kontrak / ADR | |
| B4 | Fitur baru berada di balik feature flag; dengan flag mati, perilaku tahap lama identik | 0 perbedaan pada test regresi dengan flag mati | Hasil test dengan flag mati | |
| B5 | Golden E2E (daftar di bawah) yang sudah tersedia lulus di staging dengan nomor uji | 0 gagal | Log/rekaman E2E | |
| B6 | Guard nomor operasional dan secret scan lulus | 0 temuan | Log CI | |
| B7 | Backup titik-kembali dibuat dan prosedur restore-nya pernah terbukti | Restore terakhir berhasil | Log backup/restore | |
| B8 | Ada rencana kembali ke tag `tahap-(N−1)-diterima` jika tahap ini harus dibatalkan | Rencana tertulis | Catatan di laporan | |

### Golden E2E (diperluas setiap tahap)

| ID | Skenario | Tersedia sejak |
|---|---|---|
| G1 | Login + 2FA Super Admin; pengguna dengan cakupan Hotline ditolak saat membuka data Admisi (UI & API langsung) | Tahap 1 |
| G2 | Pesan masuk dari peserta uji tercatat di channel yang benar; webhook yang sama dikirim ulang tidak menggandakan pesan | Tahap 2 |
| G3 | Admin membalas dari inbox; status pesan sesuai bukti provider; AI Off pada chat itu | Tahap 3 |
| G4 | AI menjawab dari Kartu Program; peserta minta manusia → eskalasi ke tim yang benar; AI Off | Tahap 4 |
| G5 | Admin mengaktifkan AI kembali; pesan lama tidak dijawab; pesan baru dijawab | Tahap 3/4 |
| G6 | Label kata kunci diterapkan **tanpa** mengirim pesan; data pipeline dibuat dari chat dan terhubung benar | Tahap 5 |
| G7 | FU-1 terjadwal; peserta membalas → jadwal lama dibatalkan; AI Off → tidak ada follow-up terkirim | Tahap 6 |
| G8 | Kill switch global menghentikan semua pengiriman otomatis dalam < 1 menit dan tidak menyala sendiri | Tahap 3 |

---

## C. CCP per gate

### Gate 1 — Fondasi produksi

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 1.1 Izin diperiksa di server, termasuk cakupan channel | 0 uji akses negatif yang lolos (UI & API langsung) | Laporan test otorisasi | |
| 1.2 Super Admin terakhir terlindungi; pengguna tidak bisa menaikkan hak sendiri | 0 lolos | Test | |
| 1.3 2FA wajib sebelum akses administratif Super Admin | 0 bypass | Test | |
| 1.4 Audit log append-only bagi aplikasi | UPDATE/DELETE dari aplikasi ditolak | Test + penjelasan mekanisme | |
| 1.5 Tidak ada rahasia di repository | 0 temuan secret scan; `.env` tidak ter-commit | Log CI | |
| 1.6 Batas channel aman terhadap permintaan bersamaan | 0 kelebihan pada ≥ 20 permintaan paralel | Test konkurensi | |
| 1.7 Backup & restore nyata | Restore berhasil; data terbaca; waktu tercatat | Log restore | |
| 1.8 Status channel jujur | Tidak ada status "terhubung" | Screenshot disamarkan | |
| 1.9 Fondasi regresi aktif | CI menjalankan semua test, secret scan, guard; feature flag & registri kill switch berfungsi | Konfigurasi CI + test | |

### Gate 2 — Konektor WhatsApp

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 2.1 Validasi tanda tangan webhook pada raw body | 100% payload tanpa/salah/diubah ditolak | Test | |
| 2.2 Simpan sebelum respons sukses | DB mati → bukan 200; event tidak hilang setelah pulih | Test | |
| 2.3 Idempotensi event | 0 duplikat dari kiriman ulang ≥ 100 event | Test | |
| 2.4 Pemetaan channel | 0 pesan masuk channel lain; event channel tak dikenal dikarantina | Test | |
| 2.5 Daftar penerima uji | 0 pengiriman ke luar daftar | Test + log | |
| 2.6 Hasil kirim tidak pasti | 0 retry otomatis; tampil "belum pasti" | Test timeout | |
| 2.7 Jendela layanan | 0 pesan bebas terkirim di luar jendela | Test | |
| 2.8 Echo WhatsApp Business App | 0 echo tercatat sebagai pesan pelanggan | Uji nyata nomor uji | |
| 2.9 History | 0 otomatisasi/unread terpicu oleh history | Test | |
| 2.10 Coexistence nyata | Terbukti dengan nomor uji, **atau** tahap dinyatakan "belum lulus penuh" | Bukti nyata disamarkan | |

### Gate 3 — Inbox, routing, pengambilalihan

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 3.1 Visibilitas per channel di daftar, pencarian, filter, jumlah, realtime, media, panel riwayat lintas channel | 0 kebocoran | Test | |
| 3.2 Akses percakapan yang dialihkan antartim | Hanya percakapan itu, bukan seluruh channel | Test | |
| 3.3 Ambil alih atomik | 0 job AI simulasi terkirim setelah ambil alih | Test | |
| 3.4 Aktivasi ulang AI | 0 pesan lama/history/duplikat/terlambat dinyatakan layak | Test | |
| 3.5 Kirim manual | 0 duplikat dari klik ganda | Test | |
| 3.6 Kill switch per chat/channel/fitur/global | Berhenti < 1 menit; tidak menyala sendiri | Test + G8 | |
| 3.7 Echo dari HP | Sesuai D-05; event lama tidak membalik status terbaru | Test | |

### Gate 4 — AI agent

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 4.1 Filter knowledge & Kartu Program sebelum model | 0 kebocoran knowledge agent lain (termasuk uji injeksi) | Test | |
| 4.2 Validasi jadwal & tautan oleh kode | 0 tautan terkirim untuk program kedaluwarsa/tidak jelas/tanpa URL | Test | |
| 4.3 Set uji AI | Memenuhi ambang D-21; **0 fabrikasi** harga/jadwal/tautan | Laporan batch per versi agent | |
| 4.4 Pemeriksaan ulang sebelum kirim (10 syarat) | 0 kirim saat salah satu syarat gagal | Test | |
| 4.5 Eskalasi & routing | AI Off + alasan tercatat + tim tujuan benar | Test | |
| 4.6 Batas biaya & kill switch AI | Batas menghentikan pemanggilan; kill switch AI < 1 menit | Test | |
| 4.7 Simulator terisolasi | 0 efek ke WhatsApp, status chat, label, pipeline, follow-up | Test | |

### Gate 5 — Label, pipeline, laporan

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 5.1 Label tidak pernah memicu pesan/AI/follow-up | 0 | Test | |
| 5.2 Tanpa backfill; history/echo/pesan keluar tidak dievaluasi | 0 | Test | |
| 5.3 Label tidak tertukar antarchannel | 0 | Test | |
| 5.4 Konflik edit pipeline terdeteksi | 0 penimpaan diam-diam | Test | |
| 5.5 Relasi pipeline–chat utuh | 0 relasi hilang setelah perubahan status/PIC | Test | |
| 5.6 Laporan & ekspor mengikuti izin channel | 0 kebocoran; ekspor teraudit | Test | |
| 5.7 Angka laporan benar | Cocok dengan hitungan manual pada ≥ 3 metrik | Lembar pencocokan | |

### Gate 6 — Template & follow-up

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 6.1 AI Off / opt-out / jeda per chat / kill switch | 0 follow-up terkirim | Test | |
| 6.2 Pemeriksaan ulang tepat saat kirim | 0 jadwal tak layak terkirim | Test | |
| 6.3 Satu job satu worker | 0 duplikat pada uji 2 worker + restart | Test | |
| 6.4 Batas 24 jam, jam kirim, jarak minimum (D-06, D-07) | 0 pelanggaran pada simulasi waktu, termasuk zona waktu server berbeda | Test + tabel contoh | |
| 6.5 Template | 0 template belum disetujui/salah WABA/parameter kurang terkirim | Test | |
| 6.6 Hasil tidak pasti | 0 retry buta | Test | |

### Gate 7 — Audit terpadu & UAT

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 7.1 Auditor independen | Auditor bukan sesi/agen pembangun | Pernyataan + identitas sesi | |
| 7.2 Golden E2E G1–G8 lulus **nyata** dengan nomor uji | 0 gagal | Log | |
| 7.3 Temuan kritis/tinggi | 0 terbuka | Daftar temuan | |
| 7.4 Keputusan bisnis untuk go-live | Semua D-xx yang relevan **Diputuskan** | `docs/decisions.md` | |
| 7.5 Parity Halo AI (D-24) | Setiap fitur harian: tersedia / pengganti disepakati / diterima hilang | Tabel parity | |
| 7.6 Restore & kill switch drill | Restore tidak mengirim apa pun; kill switch < 1 menit | Log drill | |
| 7.7 UAT diterima | Persetujuan nyata dari perwakilan berwenang | Formulir UAT | |

### Gate 8 — Pilot & persiapan perpindahan

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 8.1 Pilot role-play 5 hari kerja | 0 temuan kritis/tinggi terbuka | Laporan pilot | |
| 8.2 Kill switch dijalankan oleh manajer non-teknis | Berhasil tanpa bantuan developer | Catatan drill | |
| 8.3 Restore drill production-like | 0 pesan/follow-up terkirim ulang | Log | |
| 8.4 Runbook per nomor | Tiga runbook terpisah (Kemitraan, Admisi, Hotline), ditinjau | File runbook | |
| 8.5 Pencegahan dua sistem membalas | Prosedur teruji pada nomor uji | Catatan uji | |
| 8.6 Rencana sinkronisasi riwayat | PIC, langkah, dan batas waktu jelas per nomor | Runbook | |
| 8.7 Pelatihan | Pengguna inti sudah berlatih (bukti nyata) | Daftar hadir | |

### Gate 9 — Per nomor (diulang untuk setiap nomor)

| CCP | Batas kritis | Bukti | Hasil |
|---|---|---|---|
| 9.1 Keputusan GO tertulis untuk nomor dan lingkup ini | Ada | Formulir | |
| 9.2 Di luar masa freeze; PIC & piket tersedia selama observasi | Ya | Jadwal | |
| 9.3 Pemeriksaan awal setelah pindah (10 butir Tahap 9 §14) | 10/10 lulus | Checklist | |
| 9.4 Kriteria penghentian (bagian D) tidak terpicu selama observasi | 0 | Log pemantauan | |
| 9.5 Nomor berikutnya hanya setelah observasi selesai (D-14) | Ya | Laporan observasi | |
| 9.6 Hotline khusus: D-01 diputuskan & teknologi 0124 terverifikasi | Ya | Decisions + J0-04 | |

---

## D. Kriteria penghentian darurat (berlaku kapan pun, di tahap mana pun)

Jika salah satu terjadi: **aktifkan kill switch → catat insiden → TAHAN** lingkup terdampak sampai diperbaiki dan diuji ulang.

- Pesan terkirim ke penerima yang salah.
- Pengiriman otomatis tidak terkendali atau duplikat.
- AI membalas setelah admin mengambil alih.
- Follow-up terkirim saat AI Off, opt-out, atau melanggar aturan waktu.
- Kebocoran data, rahasia, atau akses tanpa izin.
- Pesan masuk tidak diterima secara andal.
- Backup gagal atau tidak dapat dipulihkan.

---

## E. Agenda rapat gate (30 menit)

| Menit | Isi | Oleh |
|---|---|---|
| 0–5 | Ringkasan: apa yang terbukti nyata, apa yang baru simulasi | Auditor |
| 5–15 | CCP tahap ini (bagian C) dan temuan | Auditor |
| 15–20 | Proteksi mundur (bagian B) | Auditor / teknis |
| 20–25 | Keputusan bisnis yang dibutuhkan tahap berikutnya + status Jalur 0 | Pemilik |
| 25–30 | Keputusan gate, penanggung jawab, tenggat | Pemilik |

---

## F. Formulir keputusan gate

Salin ke `docs/gates/gate-N.md`.

```
GATE N — <nama tahap>
Tanggal rapat     :
Commit diaudit    :
Auditor           :            (sesi/agen independen: ya/tidak)
Peserta rapat     :

Ringkasan bagian A : __/10 lulus
Ringkasan bagian B : __/8 lulus
Ringkasan bagian C : __/__ lulus

Temuan terbuka     : kritis __ · tinggi __ · sedang __ · rendah __
Yang baru terbukti simulasi (belum nyata):
  -
Keputusan D-xx yang diambil di rapat ini:
  -

KEPUTUSAN: [ ] LANJUT   [ ] LANJUT TERBATAS   [ ] TAHAN

Jika LANJUT TERBATAS — bagian yang belum terbukti, PIC, tenggat:
  -
Jika TAHAN — syarat untuk gate ulang:
  -

Tag yang dibuat    : tahap-N-diterima   (ya/tidak)
Backup titik-kembali: <lokasi/waktu>

Diputuskan oleh   :                     Tanggal:
```

---

## G. Prompt auditor independen

Jalankan di **sesi AI baru** yang tidak pernah membangun kode proyek ini. Ganti `N`.

```
Anda adalah Auditor Independen (QA Engineer + Application Security Engineer) untuk proyek TE One.
Anda TIDAK membangun kode ini. Tugas Anda memeriksa, bukan memperbaiki.

Repository: https://github.com/fawwazchaidir-bit/chat-TEOne
Tahap yang diaudit: Tahap N
Commit yang diaudit: <hash>

Langkah:
1. Baca AGENTS.md, docs/decisions.md, docs/jalur-0.md, docs/gates/GATE-CHECKLIST.md,
   prompt tahap di docs/prompts/tahap-N.md, dan laporan developer docs/reports/tahap-N.md.
2. Jangan percaya laporan developer begitu saja. Verifikasi dari kode, konfigurasi,
   output CI, dan test yang benar-benar Anda jalankan sendiri.
3. Jalankan seluruh test (termasuk regresi @tahap-1 s.d. @tahap-N), lint, typecheck,
   build, secret scan, dan guard nomor operasional. Catat perintah dan hasil aktual.
4. Isi bagian A, B, dan C (Gate N) dari GATE-CHECKLIST. Untuk setiap baris: hasil
   (✅/❌/⏳/N/A), bukti spesifik (file, baris, output test), dan alasan.
5. Cari secara aktif:
   - pemeriksaan izin yang hanya ada di UI, bukan di server;
   - jalur pengiriman otomatis yang tidak memeriksa ulang status/kill switch tepat sebelum kirim;
   - tempat history, echo, atau event duplikat bisa memicu otomatisasi;
   - retry pada hasil kirim yang tidak pasti;
   - rahasia atau data pelanggan di repo/log;
   - perubahan kontrak inti (AGENTS.md §6) tanpa ADR;
   - test regresi yang dihapus, di-skip, atau dilemahkan;
   - klaim "terhubung/lulus/aktif" tanpa bukti nyata;
   - asumsi D-xx yang dilaporkan seolah keputusan final.
6. Tulis hasil ke docs/gates/gate-N.md memakai formulir bagian F (kosongkan bagian
   keputusan untuk diisi pemilik), lalu daftar temuan dengan prioritas
   kritis/tinggi/sedang/rendah, bukti, dan langkah reproduksi.
7. Berikan rekomendasi: LANJUT / LANJUT TERBATAS / TAHAN, dengan alasan berbasis bukti.

Larangan: jangan mengubah kode aplikasi, jangan menyentuh nomor operasional atau Halo AI,
jangan mengirim pesan ke selain daftar penerima uji, jangan mengarang hasil.
```
