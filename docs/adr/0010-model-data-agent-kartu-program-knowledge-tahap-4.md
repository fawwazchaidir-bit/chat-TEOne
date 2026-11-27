# ADR-0010 — Model data Tahap 4: agent, Kartu Program, knowledge, versi, penempatan, akses, dan izin

- **Status:** Diusulkan · menunggu persetujuan pemilik
- **Tahap:** 4 (STRUKTUR; migrasi 0007–0008) · **tidak mengubah** kontrak inti #1–#7 (§6 AGENTS.md); menambah entitas dan izin secara aditif
- **Asumsi dipakai (semuanya masih Terbuka di `docs/decisions.md`; default usulan = ASUMSI):** D-10 (sapaan "asisten virtual Trilogika"), D-15 (eskalasi tanpa janji waktu), D-20 (kelompok/≥ 5 peserta → Tim Kemitraan), D-22 (lead nyasar → Tim Admisi di percakapan yang sama), D-23 (kategori keluhan Hotline). **D-09 (provider/model/biaya) tidak berdefault** dan **tidak dipakai** di ADR ini.

## Konteks
Prompt Tahap 4 meminta agent yang dapat dikonfigurasi, Kartu Program sebagai sumber tunggal harga/jadwal/tautan, knowledge terfilter hak akses, serta riwayat versi, penerbitan terpisah, dan penempatan per channel. Bentuk data harus **benar sebelum ada perilaku**: kesalahan di sini (mis. knowledge agent lain terbaca, versi terbit berubah diam-diam, dua agent aktif di satu channel) tidak boleh bergantung pada kehati-hatian kode aplikasi. Tahap ini dikerjakan atas instruksi eksplisit pemilik sementara Gate 2 belum diputuskan (preseden Tahap 3); semua di balik flag `ai_agents` (default **mati**), dan **tidak ada** AI, provider, ataupun pengiriman WhatsApp.

## Keputusan

### 1. Entitas + versi (draft → terbit → diganti)
`ai_agents`, `program_cards`, `knowledge_sources` masing-masing punya tabel `*_versions` dengan status `draft` → `terbit` → `diganti`. **Satu draft dan satu terbit per entitas** (indeks unik parsial). **Versi terbit tidak berubah**: trigger `te_version_guard` menolak ubah/hapus (kode `TE010`); satu-satunya transisi sah selain edit draft adalah `draft → terbit` dan `terbit → diganti` tanpa perubahan isi; versi baru wajib lahir sebagai draft. Riwayat versi = baris-barisnya. **Tidak ada** kolom `current_version_id` (menghindari FK sirkular dan dua sumber kebenaran): "versi berlaku" = baris berstatus `terbit`.
Penerbitan (draft → terbit, mengisi `published_by/at`) adalah aksi dengan **izin terpisah** (§7) yang akan dibungkus layanan + audit pada tahap berikutnya.

### 2. Agent
Nama adalah **data** (unik tanpa peduli huruf besar/kecil, 1–80 karakter, dapat diganti). Peran, bahasa, gaya, sapaan, emoji, instruksi, dan **aturan eskalasi per alasan → tim** disimpan di `ai_agent_versions.config` (JSON). Alasan JSON: bidang ini sering berubah; skema zod ada di modul `ai-agents` (tahap berikutnya) sehingga perubahan bentuk tidak memerlukan migrasi DB, sementara **riwayat tetap utuh** karena versi terbit tidak berubah. Status `aktif|nonaktif`.

### 3. Penempatan di channel
`ai_channel_agents` menyimpan **riwayat** penempatan. **Satu channel = satu penempatan aktif** (indeks unik parsial `ended_at IS NULL`); satu agent boleh di banyak channel. DB menolak (`TE012`) penempatan agent **nonaktif**, agent **tanpa versi terbit**, atau pada channel yang **diarsipkan**; baris riwayat hanya boleh **diakhiri sekali** (tidak diubah/dihapus). Agent yang masih ditempatkan **tidak dapat dinonaktifkan/dihapus** (`TE011`) sampai penempatannya ditangani. Pergantian agent = akhiri lama + tempatkan baru **dalam satu transaksi** (aplikasi, tahap berikutnya); waktu, pelaku, agent lama dan baru tercatat oleh baris-baris itu.

### 4. Akses sumber DUA ARAH (double opt-in)
Agent hanya boleh memakai sebuah sumber bila **keduanya** setuju: (a) versi agent **memilih** sumber (`ai_agent_version_sources`; hanya berubah selama versi draft — `TE014`; versi terbit = sumbernya beku) **dan** (b) sumber **mengizinkan** agent: Kartu Program → `program_card_agents`; knowledge `shared` → `knowledge_source_agents` ("shared tidak otomatis berlaku untuk semua agent"); knowledge `agent` → hanya `owner_agent_id`. Kombinasi ini dipilih karena kesalahan satu sisi tidak membuka akses. **Penyaringan terjadi di kode SEBELUM konteks dirakit untuk model** (ADR-0011); tabel ini menyediakan datanya, bukan penegakannya.

### 5. Kartu Program
Kolom terstruktur (nama, kategori, mode online/offline, lokasi, tanggal mulai/selesai bertipe `date` + `timezone`, `registration_close_at` timestamptz, harga/ketentuan, persyaratan, URL, brief, alur khusus). Kolom boleh kosong pada **draft**; **kelengkapan** diperiksa kode saat terbit. DB hanya menjaga bentuk yang tak boleh salah: **URL pendaftaran hanya `https` tanpa spasi (≤ 2000)**, tanggal nyata (mis. 31 Feb ditolak) dengan selesai ≥ mulai, mode terbatas, kode program berformat dan unik. Status kartu `draft|aktif|diarsipkan`; **`aktif` hanya bila ada versi terbit** (`TE013`). **Kelayakan tautan** (aktif, belum lewat tutup pendaftaran, jadwal belum lewat, URL ada) diputuskan **kode** tepat sebelum kirim, bukan DB dan bukan model. *Flyer* belum ada kolomnya (menunggu modul aset media; ditambahkan expand-only).
**Terbuka — ASUMSI (belum ada D-id):** definisi "jadwal belum lewat". Usulan: **tanggal mulai** belum lewat pada zona kartu (program yang sudah berjalan tidak ditawarkan pendaftarannya). Perlu konfirmasi pemilik sebelum validator dibuat.

### 6. Knowledge
`knowledge_sources`: `scope` `shared|agent` (aturan pemilik ditegakkan CHECK), `kind` `teks|txt|pdf|docx`, `status` enam keadaan (`draft`, `diproses`, `siap_ditinjau`, `aktif`, `gagal`, `diarsipkan`); **`aktif` hanya bila ada versi terbit** (`TE013`). Versi menyimpan teks hasil ekstraksi, SHA-256, ukuran, dan `error_category` (kategori saja, tanpa isi dokumen). Pemrosesan file (PDF berbasis teks, DOCX) berjalan di latar pada tahap berikutnya; OCR di luar lingkup.

### 7. Izin
Sembilan kunci baru, aditif, semua **`available: false`** (fiturnya belum ada → UI wajib "Belum tersedia"): `agent.view`, `agent.publish`, `agent.place`, `programcard.manage`, `programcard.publish`, `knowledge.publish`, `ai.simulator`, `ai.testset`, `ai.audit`. Empat dari 13 izin prompt §17 memakai kunci yang **sudah ada** (`agent.manage`, `knowledge.manage`, `ai.toggle`, dan kill switch AI = `killswitch.channel`/`killswitch.manage` + fitur `ai_reply`). Semua bercakupan channel secara mekanis (kontrak izin Tahap 1 tidak diubah); **operasi global** (buat/ubah/terbitkan agent, kartu, knowledge) mensyaratkan **cakupan semua channel**, hanya `agent.place` yang sungguh per channel. Tidak ada kunci `superAdminOnlyGrant` baru. Flag tunggal `ai_agents` (stage 4) untuk seluruh Tahap 4.

### 8. Yang SENGAJA belum ada
Tabel pemakaian/biaya dan log jawaban (`ai_runs`; menunggu D-09), hasil set uji, notifikasi tim, agent contoh (CONTOH), layanan/API/UI, modul `ai-agents`/`program-cards`/`knowledge` di `src/` (tes memastikan belum ada). Semua ditambahkan **expand-only** pada tahap berikutnya.

## Konsekuensi
- (+) Integritas inti ditegakkan PostgreSQL (versi beku, satu agent per channel, agent dipakai tak hilang, URL aman); diuji langsung (`tests/integration/tahap4-struktur.test.ts`), termasuk lewat peran aplikasi.
- (+) Migrasi 0007 murni membuat tabel baru; 0008 menambah fungsi/trigger/indeks; keduanya maju-saja dan diuji pada DB kosong **dan** snapshot 0000–0006.
- (−) Trigger menambah kompleksitas: setiap perubahan bentuk tabel versi harus mempertahankan `te_version_guard` (kolom turunan `content_tsv` dikecualikan dari perbandingan — ditemukan oleh tes, bukan asumsi).
- (−) `config` JSON longgar di DB: validasi bentuk sepenuhnya di kode; versi lama harus tetap terbaca (zod dengan bawaan).
- **Alternatif ditolak:** satu dokumen JSON per entitas tanpa tabel versi (riwayat tak terjaga DB); `current_version_id` (FK sirkular); versi sebagai tabel snapshot append-only terpisah (duplikasi tanpa manfaat tambahan).
