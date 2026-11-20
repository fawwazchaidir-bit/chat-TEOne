# Laporan Akhir — Tahap 2: Konektor WhatsApp Cloud API & Coexistence

> ### Pembaruan 21 Nov 2026 — audit independen Gate 2 diterima
> Audit ([`docs/gates/gate-2.md`](../gates/gate-2.md)) merekomendasikan **TAHAN**: **G2-A01** identitas dua pelanggan dapat tercampur · **G2-A02** timestamp hilang membuka jendela 24 jam · **G2-A03** history→langsung dapat memicu hook ·
> **G2-A04** verifikasi dicatat pada pemetaan yang sudah berubah · G2-A05 "terverifikasi" menyesatkan · G2-A06 `diproses` tertahan · **G2-A07** bukti nyata/prasyarat Gate 1 belum ada.
> **Penilaian CCP 2.7 dan 2.9 di §5 ("Terpenuhi (simulasi)") salah pada saat laporan awal dan DIKOREKSI** (lihat §5). A01–A06 **diperbaiki di kode dan dikunci 35 test + uji mutasi 15 mutan** ([ADR-0006](../adr/0006-perbaikan-audit-gate-2.md),
> [`gates/gate-2-tindak-lanjut.md`](../gates/gate-2-tindak-lanjut.md)) — **menunggu verifikasi ulang auditor**. A07 **terbuka**. Angka terkini: Vitest **281** (`@tahap-1` 143 · `@tahap-2` **138**), E2E 6 + 7 placeholder. Tahap 2 tetap **BELUM LULUS PENUH**.

> Disusun oleh **pembangun**. Ini **bukan audit** (AGENTS.md §2.6). Gate 2 memerlukan `docs/gates/gate-2.md` dari **sesi auditor baru**.
> **STATUS TAHAP 2: BELUM LULUS PENUH.** Uji nyata dengan Meta dan nomor uji — termasuk **coexistence** — **belum dilakukan** (spesifikasi §1, §14; CCP 2.10).
> Semua "lulus" di bawah adalah **simulasi** (mock Graph API + fixture sintetis) kecuali dinyatakan lain.

## 1. Ringkasan hasil
Konektor resmi Meta WhatsApp Cloud API dibangun sebagai kode yang berjalan dan teruji **secara simulasi**: webhook (challenge, tanda tangan pada raw body, simpan-sebelum-200, dedup idempoten, karantina, antrean PostgreSQL tahan restart), adapter Meta (kirim teks/gambar/PDF, unggah/unduh media, normalisasi event, rate limiter, kategori galat, pembentuk template), model **Kontak → Percakapan → Pesan** (ADR-0003), pesan masuk/keluar, **echo** dan **history** (tidak memicu apa pun), status pesan yang tahan urutan, **hasil belum pasti tanpa retry buta**, jendela layanan 24 jam, media privat, pemetaan channel ↔ WABA ↔ `phone_number_id` dengan status verifikasi jujur, dan **alat uji integrasi** (izin khusus `integration.test`, penerima uji ditegakkan server).

**Yang TIDAK terbukti:** tidak ada pesan yang pernah dikirim/diterima lewat Meta sungguhan; bentuk payload resmi, nama field coexistence, kode galat, batas throughput, dan seluruh butir coexistence §4 spesifikasi **belum terverifikasi** (host dokumentasi Meta tidak dapat dijangkau dari lingkungan pembangun; tidak ada aplikasi Meta/token/nomor uji/staging).
**Gate 1 belum diputuskan** (audit independen ada: `gates/gate-1.md`, rekomendasi TAHAN; keputusan pemilik kosong) — Tahap 2 dikerjakan atas instruksi eksplisit pemilik proyek dan **tidak dapat diterima** sebelum Gate 1 diputuskan.
**Nomor Admisi (…1119) dan Hotline (…0124) serta Halo AI tidak disentuh** (§11).

## 2. Repository, branch, commit, tag
- Repository: `https://github.com/fawwazchaidir-bit/chat-TEOne`. Branch kerja: `claude/lucid-carson-blf4x0` (ketentuan sesi; AGENTS.md §2 menyebut `tahap-2-<ringkas>` — sama seperti T1-F05, pemilik memutuskan cara landing).
- Commit awal: `021492a` (akhir Tahap 1; CI hijau). Commit kode Tahap 2: `918138d` (di-push); commit berikutnya hanya dokumentasi (pencatatan hasil CI). Daftar lengkap: `git log 021492a..HEAD`.
- Tag diusulkan: `tahap-2-diterima` — **belum dibuat**; hanya setelah Gate 1 **dan** Gate 2 diputuskan. Tidak ada PR dibuat; tidak ada merge ke `main`; tanpa force push.
- Berkas baru dari pemilik: `docs/prompts/tahap-2.md` (prompt Tahap 2). `docs/jalur-0.md` dan `tahap-3…9.md` masih tidak ada (T1-F04).

## 3. Status fitur (istilah AGENTS.md §4)
| Fitur | Status |
|---|---|
| Webhook: challenge, tanda tangan raw body, simpan-sebelum-200, dedup, karantina, antrean tahan restart | **Terbukti simulasi** (test integrasi + E2E dengan webhook bertanda tangan sungguhan ke server produksi lokal); **bukan** terhadap Meta |
| Normalisasi payload `messages`/`statuses`/echo/history/contact-sync/referral | **Terbukti simulasi** terhadap fixture **berbentuk asumsi** — bentuk nyata **belum terverifikasi** |
| Kontak → Percakapan → Pesan; kontak sama di 2 channel tidak tertukar; simulasi 5 channel; pemetaan salah ditolak | **Terbukti simulasi** |
| Pesan masuk teks/gambar/PDF; jenis lain = "belum didukung" tanpa menggagalkan | **Terbukti simulasi** |
| Kirim teks/gambar/PDF (alat uji) + idempotensi + penerima uji server + jendela layanan | **Terbukti simulasi** |
| Hasil belum pasti: tepat 1 panggilan, rekonsiliasi (opaque) + penyelesaian manual teraudit | **Terbukti simulasi** |
| Status pesan tidak berurutan/berulang/sebelum pesan tercatat | **Terbukti simulasi** |
| Echo WhatsApp Business App (dicatat sebagai keluar, dedup, tidak membuka jendela) | **Terbukti simulasi**; **nyata belum diuji** (CCP 2.8) |
| History (ditandai, tidak memicu hook/unread; chunk tak berurutan, penolakan) | **Terbukti simulasi**; nyata belum diuji |
| Referral / `SumberLead` | **Terbukti simulasi** (fixture); nyata belum (tidak ada iklan uji) |
| Media privat (sniffing byte, batas ukuran, sha256, anti-SSRF, izin) | **Terbukti simulasi** |
| Pemetaan channel + verifikasi koneksi (`nyata` hanya untuk graph.facebook.com; selain itu `simulasi`) | **Terbukti simulasi**; verifikasi **nyata belum dilakukan** |
| Mode uji D-03 (pengirim di luar daftar → karantina minimal, dilaporkan) | **Terbukti simulasi** |
| Alat uji integrasi `/integrasi` + panel koneksi di `/channel` (di balik flag `whatsapp_connector`, default mati) | **Terbukti simulasi** (E2E G2 simulasi) |
| Rate limiter kirim (token bucket per `phone_number_id`) | **Terbukti simulasi**; per-proses (T2-F10); batas Meta nyata **belum diverifikasi** |
| Fungsi kirim template (pembentuk payload + `postMessage`) | **Dibuat, terbukti simulasi**; uji nyata opsional/belum; sengaja **tidak** terhubung ke UI/API (Tahap 6) |
| Retensi payload mentah 30 hari + pembersih di worker | **Terbukti simulasi**; angka = **ASUMSI (D-18)** |
| Worker `scripts/worker.ts`, diagnostik `meta:check` | **Dibuat; worker terbukti simulasi (test)**; `meta:check` **dibuat, belum dijalankan terhadap Meta asli** |
| Compose staging: service `worker` + volume media; Dockerfile UID tetap | **Dibuat, belum diuji** (belum ada server/Docker build — T1-F03) |
| Coexistence nyata, Cloud API nyata, Golden E2E **G2 NYATA** | **Belum dibuat/ belum dapat diuji** (placeholder `[BELUM TERSEDIA]`, bukan bukti) |
| Grup (D-01) | **Di luar lingkup** (D-01 Terbuka; lihat `docs/tahap-2/coexistence.md` §5) |
| Inbox tim, AI, label, pipeline, UI template & follow-up, migrasi nomor operasional, impor Halo AI | **Di luar lingkup** (Tahap 3–9) |

## 4. Hasil pengujian (perintah → hasil aktual)
Lingkungan: PostgreSQL 16, Node 22, Chromium (Playwright), lokal/sandbox. **Tidak ada pengujian nyata terhadap Meta.**

### 4.1 Otomatis / SIMULASI (mock Graph API lokal + fixture sintetis)
| Perintah | Hasil aktual |
|---|---|
| `npm run lint` · `npm run typecheck` | 0 error |
| `node scripts/guard-operational.mjs` · `node scripts/secret-scan.mjs` | lulus (221 berkas) |
| `npm audit --omit=dev` | 0 temuan |
| `npm run build` | sukses, tanpa peringatan; standalone hanya `node_modules`, `package.json`, `server.js` (75 MB) |
| `npx vitest run` (DB dibuat dari kosong → migrasi `0000–0002` teruji) | **16 berkas, 227 test, 0 gagal, 0 dilewati** |
| `npm run e2e` (server produksi hasil build) | **6 lulus** (3 G1 + 3 G2 simulasi), 7 dilewati = placeholder resmi |
| `npm run test:report` | `@tahap-1`: 124 + 3; `@tahap-2`: **103 + 3**; baseline: 124/3 dan 103/3; tidak ada masalah |
| `bash scripts/backup-restore-drill.sh` | lulus: 26 tabel/38 baris identik setelah restore, 3 migrasi, audit tetap append-only |

Rincian Vitest Tahap 2 (103): webhook 18 · channels-worker 10 · connection 10 · messages 18 · send 24 · migration-retention 3 · unit 20.
Cakupan sesuai §13 spesifikasi: challenge valid/tidak valid; tanda tangan valid/salah/tidak ada/payload diubah (**90 varian ditolak 100%**); beberapa event per payload; kirim ulang (**120× berurutan, 40 paralel, 110 event × 2**); channel tak dikenal; **database menolak tulis → bukan 200, event tersimpan tepat sekali setelah pulih**; restart worker (lease); 2 worker paralel pada 80 event; teks masuk/keluar; gambar/PDF masuk/keluar; echo; status berulang/tak berurutan/sebelum pesan dicatat; kontak sama di 2 channel; simulasi 5 channel; referral (fixture); klik ganda (12 paralel → 1 panggilan); timeout → belum pasti → tetap 1 panggilan; di luar jendela diblokir; alat uji tanpa izin ditolak; history tidak memicu apa pun; pengirim di luar daftar uji tidak diproses; migrasi pada snapshot data Tahap 1; fuzz normalizer.
**Uji mutasi** (merusak pengaman → test harus gagal): M1 tanda tangan selalu valid → gagal ✔ · **M2 hapus dedup event → LOLOS pada percobaan pertama** (celah test: tidak ada uji "event sudah diproses lalu dikirim ulang"); test ditambahkan, **M2 ulang → gagal ✔** · M3 penerima uji tidak ditegakkan → 2 gagal ✔ · M4 timeout dianggap gagal-pasti (retry) → 3 gagal ✔ · M5 jendela selalu terbuka → 2 gagal ✔ · M6 echo membuka jendela → 2 gagal ✔ · M7 history memancarkan hook → 2 gagal ✔ · M8 karantina "menebak" channel → 2 gagal ✔ · M9 galat query dicatat mentah → 1 gagal ✔ · M10 status terverifikasi tanpa pemeriksaan → 2 gagal ✔.
Temuan selama pengujian yang **diperbaiki di kode**: pesan galat driver DB memuat parameter kueri (isi chat) → `safeErrorLabel` di semua titik log/`last_error` (diuji M9); status yang datang sebelum echo tercatat tidak pernah diterapkan → diperbaiki + diuji.

### 4.2 NYATA (Meta asli / nomor uji)
**Tidak ada.** Tidak dilakukan: Cloud API nyata, coexistence nyata, echo nyata, history nyata, pemeriksaan koneksi nyata, golden E2E G2 nyata.

### 4.3 Belum dapat diuji (dan mengapa)
| Hal | Penghalang |
|---|---|
| Semua uji nyata (CCP 2.8, 2.10; G2 nyata; `meta:check` asli) | Tidak ada aplikasi Meta milik TE One, token system user, nomor uji (D-03), staging HTTPS (J0-03); D-02 Terbuka |
| Verifikasi dokumentasi Meta (payload, kode galat, coexistence §4, throughput, versi API) | `developers.facebook.com` tidak terjangkau dari lingkungan pembangun (DNS/proxy). Percobaan lewat subagen `web-fetch` gagal; lingkungan cloud baru `chat-teone` dibuat atas persetujuan pemilik tetapi tetap gagal; `curl` langsung ditolak pengklasifikasi izin dan **tidak disiasati**. Hanya sumber **sekunder** (hasil pencarian web) yang tersedia |
| Build image Docker, compose `worker`, volume media di server | Tidak ada server/akses Docker registry (T1-F03) |
| Kinerja/beban nyata, throughput Meta | Tidak ada akses Meta |

## 5. Hasil CCP Tahap 2 (GATE-CHECKLIST bagian C — Gate 2)
| CCP | Kriteria | Hasil pembangun (bukan keputusan gate) | Bukti |
|---|---|---|---|
| 2.1 Tanda tangan raw body | 100% tanpa/salah/diubah ditolak | **Terpenuhi (simulasi)** — 90 varian + kasus header; diperiksa sebelum parse | `tahap2-webhook.test.ts` (CCP 2.1), `tahap2-units`; M1 |
| 2.2 Simpan sebelum 200 | DB mati → bukan 200; event tidak hilang | **Terpenuhi (simulasi)** — 500 saat DB menolak; tersimpan tepat sekali setelah pulih; atomik per payload | `tahap2-webhook.test.ts` (CCP 2.2) |
| 2.3 Idempotensi | 0 duplikat dari kiriman ulang ≥ 100 event | **Terpenuhi (simulasi)** — 110 event × 2, 120× berurutan, 40 paralel | CCP 2.3; M2 (setelah test ditambah) |
| 2.4 Pemetaan channel *(audit: G2-A01/A04 — diperbaiki, menunggu verifikasi)* | 0 pesan masuk channel lain; karantina | **Terpenuhi (simulasi)** — 5 channel, kontak sama di 2 channel, UNIQUE phone_number_id | `tahap2-channels-worker.test.ts`; M8 |
| 2.5 Daftar penerima uji | 0 pengiriman ke luar daftar (Test + log) | **Terpenuhi (simulasi)** — 403 server, 0 panggilan ke Meta, berlaku di semua mode, normalisasi nomor, teraudit | `tahap2-send.test.ts`; M3 |
| 2.6 Hasil kirim tidak pasti | 0 retry; tampil "belum pasti" | **Terpenuhi (simulasi)** — timeout/5xx/tanpa ID → belum pasti; tetap **1** panggilan setelah menunggu, pemeliharaan, klik ulang | `tahap2-send.test.ts`; M4 |
| 2.7 Jendela layanan *(DIKOREKSI — audit G2-A02: ❌)* | 0 pesan bebas di luar jendela | ~~Terpenuhi (simulasi)~~ **Celah ditemukan auditor** (waktu kedatangan membuka jendela); **diperbaiki** (waktu terbukti + cek ulang sebelum kirim; 7 test baru), menunggu verifikasi ulang — **Terpenuhi (simulasi) setelah perbaikan**;  — batas 24 jam tepat, tanpa pesan pelanggan, waktu masa depan, echo/history tidak membuka | `tahap2-send.test.ts`; M5, M6 |
| 2.8 Echo WhatsApp Business App | 0 echo tercatat sebagai pesan pelanggan (**uji nyata nomor uji**) | **BELUM TERPENUHI** — hanya simulasi (echo = keluar/*WhatsApp Business App*, dedup, tidak membuka jendela); **nyata belum diuji** | `tahap2-messages.test.ts`; M6 |
| 2.9 History *(DIKOREKSI — audit G2-A03: ❌)* | 0 otomatisasi/unread dari history | ~~Terpenuhi (simulasi)~~ **Celah ditemukan auditor** (history→langsung memicu hook); **diperbaiki** (kelayakan dari bukti waktu; 7 test baru), menunggu verifikasi ulang; hook masih in-memory (T2-F15) — **Terpenuhi (simulasi) setelah perbaikan**;  — tidak memicu hook, tidak menaikkan unread, dedup | `tahap2-messages.test.ts`; M7 |
| 2.10 Coexistence nyata | Terbukti dengan nomor uji **atau** "belum lulus penuh" | **Tidak terbukti → Tahap 2 dinyatakan BELUM LULUS PENUH** | §1, §4.2 |

## 6. Regresi tahap-tahap sebelumnya
| | Sebelum Tahap 2 | Sesudah Tahap 2 |
|---|---|---|
| Vitest total | 124 (`@tahap-1`) | **227** (124 `@tahap-1` + 103 `@tahap-2`) |
| E2E aktif | 3 (G1) | **6** (3 G1 + 3 G2 simulasi); placeholder 7 → 7 (G2 nyata, G3–G8) |
| `@tahap-1` | 124 Vitest + 3 E2E | **124 + 3 — tidak ada yang hilang, di-skip, atau dilemahkan** |
> **Pembaruan 20 Nov 2026 (audit Gate 1):** perbaikan G1-A01 menambah 19 test `@tahap-1` (`ci-guard`) → Vitest total **246** (`@tahap-1` 143 + `@tahap-2` 103); baseline `@tahap-1` Vitest = 143. Lihat `docs/gates/gate-1-tindak-lanjut.md`.

**Transparansi:** dua test Tahap 1 **dimodifikasi** karena registri izin/modul bertambah (dicatat di ADR-0004 sesuai AGENTS.md §10.2): `permission-engine.test.ts` kini menegaskan 19 kunci awal **tetap ada** (sebelumnya menegaskan jumlah total persis 19) dan menambah `integration.test`; `architecture.test.ts` mengeluarkan `whatsapp-adapter` dari daftar modul terlarang (kini sah) dan **menambah** modul Tahap 3+ lain ke daftar (`program-cards`, `knowledge`, `labels`, `templates`, `inbox`) — modul yang belum boleh ada tetap terlarang. Penjaga baseline tidak menunjukkan penurunan. Pemilik/auditor perlu menilai apakah perubahan ini dapat diterima.

## 7. Perubahan database dan migrasi
- `drizzle/0002_tahap2_whatsapp_connector.sql` (177 baris; **maju-saja**): `channel_connections`, `contacts`, `contact_identities`, `conversations`, `messages`, `message_status_events`, `media`, `lead_sources`, `inbound_events`, `test_recipients`. Kunci unik: dedup event `(provider,event_key)`, percakapan `(contact_id,channel_id)`, identitas, `phone_number_id` per channel, pesan per provider-id dan idempotency key.
- Teruji pada **database kosong** (tiap eksekusi Vitest) dan **snapshot data Tahap 1** (`tahap2-migration-retention.test.ts`); drill backup/restore setelah migrasi baru lulus (26 tabel).
- Fitur di balik flag `whatsapp_connector` (default **mati**). Tidak ada perubahan destruktif pada tabel Tahap 1.

## 8. Kondisi environment
| Lingkungan | Kondisi |
|---|---|
| Development (lokal/sandbox) | Semua pengujian §4.1 dijalankan; Meta = mock lokal |
| CI GitHub Actions | Konfigurasi diperbarui (nama langkah E2E; baseline `@tahap-2` di `tests/baseline-counts.json`; tidak butuh rahasia Meta — nilai uji sintetis di `tests/test-env.ts` dan `tests/e2e/env.ts`). **Hasil nyata di GitHub: run [#44442821597](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44442821597) pada `918138d` — hijau penuh** (Lint·Typecheck·Guard·Secret scan termasuk gitleaks; Build·Test regresi·E2E; Drill backup & restore). Ini bukti CI untuk **kode simulasi**, bukan bukti Meta nyata. Run harus diulang pada commit yang diaudit |
| Staging | **Belum ada** (J0-03). Compose `worker`, volume media, UID tetap: dibuat, **belum diuji** |
| Production | Tidak ada; tidak ada konektor Meta nyata terpasang |

## 9. Temuan
| ID | Prio | Temuan / risiko | Dampak | Bukti | Tindakan | PJ | Status |
|---|---|---|---|---|---|---|---|
| T2-F01 | **tinggi** | **Uji nyata Meta & coexistence belum dilakukan** (CCP 2.8, 2.10; G2 nyata). Hanya simulasi | Tahap 2 **belum lulus penuh**; Gate 2 tidak dapat menutup | §4.2–4.3 | Sediakan aplikasi Meta TE One, token, nomor uji, staging; jalankan `tahap-2/panduan-uji-nomor-uji.md` | Pemilik/Pembangun | Terbuka |
| T2-F02 | **tinggi** | **Bentuk payload Meta, nama field coexistence (`smb_message_echoes`, `history`, `smb_app_state_sync`), objek `referral`, pengenal selain `wa_id`, kode galat Meta BELUM TERVERIFIKASI** (dokumentasi tak terjangkau). Fixture mengikuti asumsi | Pesan nyata bisa tak terproses/terkarantina atau salah tafsir saat uji nyata | `normalize.ts`, `errors.ts` (header STATUS VERIFIKASI), `tahap-2/webhook-dan-keamanan.md` §8 | Verifikasi ke dokumentasi resmi + nomor uji; perbarui satu tempat (adapter) + fixture. Normalizer aman: tidak melempar, mengabaikan field asing, mengarantina | Pembangun | Terbuka |
| T2-F03 | sedang | **Gate 1 belum tercatat** (`docs/gates/gate-1.md` tidak ada; tidak ada audit independen). Tahap 2 dikerjakan atas instruksi eksplisit pemilik | Tahap 2 tidak dapat diterima; dasar Tahap 2 belum divalidasi auditor | `docs/gates/` | Jalankan audit Gate 1 di sesi terpisah | Pemilik | Terbuka |
| T2-F04 | sedang | **Keputusan/prasyarat terbuka**: D-01 (grup), D-02 (jalur Meta), D-03 (nomor uji), J0-01/02/03. Dipakai sebagai **ASUMSI** | Jadwal uji nyata (batas D-02/D-03 ±1 Des 2026) | `decisions.md` | Pemilik memutuskan | Pemilik | Terbuka |
| T2-F05 | sedang | **Catatan coexistence (deliverable §15) tidak terverifikasi**; hanya sumber sekunder. Butir 3, 4, 6 (media), 8 tidak ditemukan sumbernya | Bahan Tahap 8 belum dapat dipakai untuk keputusan | `tahap-2/coexistence.md` | Isi ulang dari dokumentasi Meta + nomor uji | Pembangun | Terbuka |
| T2-F06 | sedang | **Retensi**: payload 30 hari adalah **ASUMSI (D-18)**; **pembersih isi chat/media belum ada**; hapus-atas-permintaan belum ada | Data pelanggan menumpuk; kepatuhan PDP | `klasifikasi-data-dan-retensi.md` | Putuskan D-18; bangun pembersih sebelum Tahap 7 | Pemilik/Pembangun | Terbuka |
| T2-F07 | rendah | Versi Graph API `v23.0` **ASUMSI** (belum diverifikasi sebagai versi yang didukung) | Panggilan bisa ditolak bila versi tidak valid | `env.ts` | Verifikasi; ubah lewat `META_GRAPH_API_VERSION` | Pembangun | Terbuka |
| T2-F08 | rendah | Dua test Tahap 1 disesuaikan (lihat §6) | Perlu penilaian apakah melemahkan | ADR-0004 | Tinjauan pemilik/auditor | Auditor | Terbuka |
| T2-F09 | rendah | Fungsi kirim template hanya teruji simulasi dan tidak terhubung ke UI | Tahap 6 | `tahap2-send.test.ts` | Uji nyata opsional; sambungkan di Tahap 6 | Pembangun | Terjadwal |
| T2-F10 | sedang | **Rate limiter per proses** (satu instans); default 5/detik per koneksi bukan angka Meta | >1 instans melewati batas; batas Meta nyata tak diketahui | `rate-limiter.ts` | Pindah ke DB bila >1 instans; sesuaikan dengan batas nyata | Pembangun | Terbuka |
| T2-F11 | sedang | **Media di filesystem privat (`MEDIA_DIR`) tanpa backup**, bukan penyimpanan objek | Kehilangan media bila volume hilang | `konfigurasi-staging.md` §2 | Sertakan di backup / pindah ke object storage sebelum production | Pembangun/Operasi | Terbuka |
| T2-F12 | sedang | Compose `worker`, volume media, dan UID tetap 10001 **belum diuji di server**; image Docker belum pernah ter-build (T1-F03) | Deploy staging bisa gagal | `deploy/`, `Dockerfile` | Bangun & uji di server/CI | Pembangun | Terbuka |
| T2-F13 | sedang | **Grup tidak dicakup dan tidak diuji** (D-01 Terbuka); bentuk payload grup tidak diketahui | Kebutuhan grup lama tidak terpenuhi | `tahap-2/coexistence.md` §5 | Putuskan D-01 sebelum Tahap 3 | Pemilik | Terbuka |
| **G2-A01** | **tinggi** | Identitas dua pelanggan dapat tercampur (fallback `contacts[0]`) | **Diperbaiki — menunggu verifikasi auditor** (ADR-0006; 7 test; mutan terdeteksi) |
| **G2-A02** | **tinggi** | Timestamp hilang/tak sah membuka jendela 24 jam | **Diperbaiki — menunggu verifikasi** (7 test) |
| **G2-A03** | **tinggi** | history→langsung memicu hook tanpa bukti umur | **Diperbaiki sebagian** — hook durable belum (T2-F15) |
| **G2-A04** | **tinggi** | Verifikasi dicatat pada pemetaan yang sudah berubah | **Diperbaiki — menunggu verifikasi** (migrasi 0003; 3 test) |
| G2-A05 | sedang | "Terverifikasi" menyesatkan (pemetaan ≠ siap menerima) | **Diperbaiki — menunggu verifikasi** (4 test) |
| G2-A06 | sedang | Pesan keluar `diproses` dapat tertahan setelah proses mati | **Diperbaiki — menunggu verifikasi** (7 test) |
| **G2-A07** | **tinggi** | Bukti nyata Meta/coexistence & prasyarat Gate 1 belum ada (sama dengan T2-F01/F03/F04) | **Terbuka** |
| T2-F15 | **tinggi** | **Hook otomatisasi berjalan dalam memori setelah commit** (tidak durable): event dapat hilang bila proses mati; harus dipindah ke outbox **sebelum** subscriber otomatisasi (Tahap 3–6) mengirim pesan | Perlu desain durable di Tahap 3 | `events.ts`, audit G2 §peta keterkaitan | Rancang outbox (ADR) di Tahap 3 | Pembangun | Terbuka |
| T2-F16 | sedang | **Ambang kelayakan otomatisasi 10 menit (`AUTOMATION_MAX_AGE_MS`) dan aturan "event langsung bercap waktu terbukti ≤ 24 jam membuka jendela" adalah ASUMSI teknis** — belum ada keputusan bisnis | Perilaku otomatisasi Tahap 3–4 | ADR-0006 | Pemilik/Tahap 3–4 memutuskan | Pemilik | Terbuka |
| T2-F17 | rendah | Data identitas yang **sudah** tercampur tidak dapat dipisah otomatis (pesan tak menyimpan identitas pengirim); belum ada penggabungan kontak | Hanya relevan bila terjadi setelah uji nyata | `scripts/contacts-repair.ts` | Rancang merge/split kontak bila perlu | Pembangun | Terbuka |
| T2-F14 | rendah | Pengamatan: peringatan Turbopack "seluruh proyek ikut tracing" pada akses filesystem media menyebabkan `docs/`/`AGENTS.md` ikut ke bundle standalone | Ukuran/isi image | build | **Teratasi**: `turbopackIgnore` pada akses berkas media; standalone kini hanya `node_modules`, `package.json`, `server.js` | Pembangun | Teratasi |

Temuan terbuka Tahap 1 (T1-F01, F03–F06, F08–F09, dst.) **tidak berubah**, kecuali T1-F16 (placeholder G2 sebagian digantikan E2E G2 simulasi).

## 10. Asumsi yang dipakai
| ID | Asumsi | Status |
|---|---|---|
| D-01 | Opsi A (grup tetap di WhatsApp Business App; tidak terlihat di TE One) — tidak ada modul grup | **Terbuka** (ASUMSI) |
| D-02 | Jalur akses Meta belum diputuskan; kode netral terhadap jalur (tanpa Embedded Signup) | **Terbuka** (ASUMSI) |
| D-03 | Nomor uji = Kemitraan (belum dipublikasikan); mode uji default aktif; pengirim di luar daftar dikarantina minimal | **Terbuka** (ASUMSI) |
| D-18 | Payload mentah ≤ 30 hari; isi chat/media 2 tahun (belum diimplementasikan) | **Terbuka** (ASUMSI) |
| — | Graph API `v23.0`; limiter default 5/detik; batas payload 3 MB; gambar ≤ 5 MB, PDF ≤ 16 MB | Asumsi teknis (belum diverifikasi ke Meta) |

## 11. Bukti bahwa nomor operasional dan Halo AI tidak diubah
- Tidak ada koneksi, pemetaan, atau panggilan ke Meta oleh kode ini selama pembangunan; seluruh uji memakai **mock lokal** (`assertSafeBaseUrl` menolak basis URL selain `graph.facebook.com` atau loopback, dan menolak non-Meta di production; diuji).
- Guard nomor operasional (`npm run guard:operational`, CI) lulus: tidak ada penanda operasional, nomor berakhiran 1119/0124, atau nomor telepon lengkap di seed/fixture/config/test (221 berkas dipindai). Nilai nomor uji **sintetis**, bukan nomor Indonesia, dan dibangun saat runtime.
- Seed hanya memuat 3 channel **CONTOH**; tidak ada channel `isOperational`. Tidak ada konfigurasi, webhook, atau aplikasi Meta Halo AI yang dirujuk atau diubah. Tidak ada WAHA/Baileys/whatsapp-web.js (ditegakkan test arsitektur).
- Satu-satunya akses jaringan keluar ke `developers.facebook.com` adalah **upaya membaca dokumentasi publik** (bukan API) yang gagal; tidak ada kredensial terlibat.
- Tidak ada rahasia, data pelanggan asli, atau isi chat di repository, log, atau laporan (secret scan lulus; gitleaks dijalankan di CI).

## 12. Prasyarat tahap berikutnya
1. **Gate 1** diputuskan (`docs/gates/gate-1.md`) lewat auditor independen, lalu **Gate 2**; tag `tahap-N-diterima` + backup titik-kembali hanya setelah keputusan.
2. Pemilik menyediakan: aplikasi Meta milik TE One, token system user, `META_APP_SECRET`, `META_VERIFY_TOKEN`, WABA + nomor uji (Kemitraan, D-03), staging HTTPS (J0-03), daftar peserta uji; memutuskan **D-02** dan **D-03** (±1 Des 2026) dan **D-01** (sebelum Tahap 3).
3. Menjalankan `docs/tahap-2/panduan-uji-nomor-uji.md` (Cloud API **dan** coexistence), mengisi `docs/tahap-2/coexistence.md` dari dokumentasi Meta resmi, dan memperbarui `normalize.ts`/`errors.ts`/fixture sesuai hasil nyata; mengganti placeholder **G2 NYATA** hanya dengan bukti.
4. Tahap 3 (inbox) boleh dikerjakan paralel hanya jika prompt tahap **dan** keputusan gate mengizinkan; D-05 (dampak echo pada status AI) diputuskan sebelum Tahap 3.
