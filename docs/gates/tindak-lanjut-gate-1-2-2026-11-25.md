# Laporan tindak lanjut Gate 1 dan Gate 2 — 25 November 2026

> Menjawab *Instruksi Developer — Tindak Lanjut Gate 1 dan Gate 2*. **Dokumen pembangun, bukan audit independen.** Tidak mengubah laporan audit asli (`gate-1.md`, `gate-1-audit-ulang.md`, `gate-2.md`); tanggapan sebelumnya ada di `gate-1-tindak-lanjut.md` dan `gate-2-tindak-lanjut.md`.
> **Tidak ada** keputusan gate yang diisi, **tidak ada** tag penerimaan, **tidak ada** integrasi otomatisasi Tahap 3 yang dihubungkan ke Meta. Admisi (…1119), Hotline (…0124), dan Halo AI tidak disentuh.
> **Batas pembangun yang harus dibaca:** saya **tidak punya akses ke server staging, akun Meta, ponsel uji, atau log nyata**. Semua yang menyangkut staging/Meta nyata di bawah adalah **laporan operator** (diberi label), bukan hasil yang saya amati. Tiga label dipakai: **TERBUKTI** (bukti ada dan dapat diperiksa di repository/CI) · **KLAIM** (dilaporkan, bukti belum terlampir) · **BELUM DIUJI**.

## 1. Commit final, perubahan lokal staging, image, kondisi staging

### 1.1 Commit
| Hal | Nilai |
|---|---|
| Commit yang dilaporkan berjalan di staging | `9c297d36149bdac2133d0c6da1f53fef41629245` — **KLAIM** (pembangun tidak dapat memeriksa server) |
| Commit final yang dinilai | commit yang memuat dokumen ini; **SHA tidak dapat ditulis di dalam commit yang dihitungnya** → dicatat di §3.1 pada commit lanjutan setelah CI selesai |
| Yang berubah dari `9c297d3` ke final | (a) build Docker (`tsconfig.build.json`, `next.config.ts`, `.dockerignore`, `Dockerfile` label provenance); (b) `deploy/Caddyfile` memakai `{$SITE_ADDRESS}` + `deploy/.env.example`; compose memakai `TEONE_TAG`; (c) `scripts/build-staging-image.sh`, `scripts/check-docker-context.mjs`; (d) job CI **Image Docker**; (e) penjaga: `ai_simulation` terkunci terhadap Meta asli; (f) tes dan dokumen. **Tidak ada migrasi baru.** |

### 1.2 Perubahan lokal di server staging — rekonsiliasi
Pembangun **tidak dapat melihat isi** perubahan berikut, jadi analisis di bawah **berdasarkan akar masalah yang berhasil direproduksi**, bukan membaca diff-nya.

| Berkas (status di server) | Yang diketahui / dapat dibuktikan | Dugaan (BELUM terverifikasi) | Dampak yang perlu dipahami | Penyelesaian di repository |
|---|---|---|---|---|
| `.dockerignore` (M) | **Terreproduksi:** `.dockerignore` mengecualikan `tests/`, sedangkan `playwright.config.ts` (ikut diperiksa tipe oleh `next build` lewat `tsconfig.json`) meng-import `./tests/e2e/env` → `Cannot find module './tests/e2e/env'` saat build. Kegagalan identik direproduksi di konteks Docker tiruan (`scripts/check-docker-context.mjs`) | Operator mungkin **mengeluarkan `tests` dari `.dockerignore`** (atau menambah pengecualian) agar build lolos | Bila `tests/` masuk konteks, **seluruh tests/ (termasuk data uji sintetis) ikut ke tahap build**; bukan celah rahasia di runtime (image runtime hanya membawa `.next/standalone`) tetapi menyimpang dari commit dan melebarkan konteks | **Perbaikan akar:** `next build` memakai `tsconfig.build.json` (tanpa tests/ dan konfigurasi uji) → `.dockerignore` boleh tetap mengecualikan `tests`. `.dockerignore` terlacak kini juga mengecualikan artefak lokal (`.tools`, `.verify`, `.data`, `*.log`, `deploy/.env`). **Dengan commit baru, edit lokal tidak diperlukan lagi** |
| `deploy/Caddyfile` (M) | Di repository berisi domain placeholder `staging-chat.example.invalid` | Domain diganti `staging-chat.trilogikaedutama.id` **dan/atau** ditambah blok debug (log) | Edit lokal pada berkas terlacak ⇒ server ≠ commit; blok debug dapat membocorkan header/URL ke log bila dibiarkan menyala | **Perbaikan:** Caddyfile memakai `{$SITE_ADDRESS:…}`; domain di `deploy/.env` (non-rahasia, di-ignore git/docker). Compose meneruskannya ke Caddy |
| `deploy/Caddyfile.sebelum-debug` (??) | Berkas cadangan operator, tidak terlacak | Salinan Caddyfile sebelum mode debug | **Jangan di-commit** (tidak ada alasan; ditambahkan pola `deploy/*.sebelum-*` ke `.dockerignore`). **Terkonfirmasi 25 Nov [OP]: identik dengan Caddyfile aktif** → bukan cadangan sebelum-edit (lihat §1.2a). Jangan dihapus sebelum titik pemulihan aman | — |

#### 1.2a Hasil dari operator (dilaporkan 25 Nov 2026 — **KLAIM**, bukti belum terlampir)
Checkout VPS = `9c297d3`. Perubahan lokal = **penghapusan baris `tests` dari `.dockerignore`** + **penggantian domain placeholder di `deploy/Caddyfile`**. `Caddyfile.sebelum-debug` **identik** dengan `Caddyfile` aktif. Image berjalan `sha256:417b30f8…df8af`, **tanpa label revisi**. Aplikasi dan DB *healthy*. Flag `inbox` dan `ai_simulation` **mati**, `whatsapp_connector` aktif. Belum ada reset/pull/penggantian image.
**Kesimpulan pembangun (detail: [`tahap-2/prosedur-uji-m11-m12.md`](../tahap-2/prosedur-uji-m11-m12.md) §2.1):**
1. Dugaan di tabel di atas **terkonfirmasi**: kedua perubahan lokal adalah persis dua hal yang sudah **digantikan di repository** (`tsconfig.build.json`; `{$SITE_ADDRESS}`). Setelah rebuild dari commit bersih, **tidak ada edit lokal yang perlu dipertahankan**.
2. `Caddyfile.sebelum-debug` **bukan** cadangan sebelum-edit (identik dengan yang aktif) → **tidak melindungi apa pun**; berkas asli ada di Git (`git show 9c297d3:deploy/Caddyfile`). Tetap jangan dihapus/di-commit sampai titik pemulihan aman.
3. **Asal-usul image tidak dapat dibuktikan** (tanpa label, dibangun dengan edit lokal; build Docker tidak *bit-reproducible*). Klaim "9c297d3 + dua edit" tetap **KLAIM**; bukti uji 25 Nov **tidak naik** menjadi TERBUKTI karena ini.
4. Image berjalan **belum memuat penjaga** `ai_simulation` terhadap Meta asli → flag mati = aman secara **konfigurasi**, bukan **penegakan**.
5. **Tidak ada migrasi baru** sejak `9c297d3` → rollback image aman terhadap skema DB (terverifikasi di repository).
6. **Jebakan baru (S-06, tinggi bila terjadi):** compose staging tanpa `name:` proyek dan dengan volume bernama biasa → menjalankannya dari direktori lain membuat **volume kosong = database baru**. Semua perintah compose pada rebuild **wajib `-p <nama-proyek-lama>`** (§5.3 prosedur). Usulan R-2 menutupnya secara permanen setelah nama proyek diketahui.
**Status rekonsiliasi:** *diperjelas, belum diselesaikan* — menunggu keputusan **A-1** (rebuild + ganti image) setelah titik pemulihan.

**Data yang saya minta dari operator** (tempel hasilnya, disamarkan; tidak mengubah apa pun):
```bash
git -C <repo> rev-parse HEAD && git -C <repo> status --short
git -C <repo> diff -- .dockerignore deploy/Caddyfile            # perubahan terhadap commit yang berjalan
diff deploy/Caddyfile.sebelum-debug deploy/Caddyfile             # apa yang ditambah mode debug
docker image ls --digests | grep -E "teone-(app|tools)"
docker image inspect teone-app:staging --format '{{.Id}} {{.Created}} {{ index .Config.Labels "org.opencontainers.image.revision" }}'
docker compose -f deploy/docker-compose.staging.yml ps
```
**Prosedur aman yang disarankan (BELUM dilakukan pembangun; tidak ada `git reset`, penghapusan, pembuatan ulang database, atau penggantian image sebelum semuanya ini):**
1. **Amankan titik pemulihan dulu:** simpan keluaran perintah di atas + `git diff > /root/staging-backup-<tgl>/local.diff` (di luar repo); beri tag cadangan pada image berjalan (`docker tag teone-app:staging teone-app:staging-sebelum-25nov`); jalankan `scripts/backup.sh` (DB **dan media**) sesuai `docs/backup-restore.md`.
2. Pemilik/operator meninjau `local.diff`. Hanya bila setuju: pindahkan konfigurasi domain ke `deploy/.env`, lalu `git checkout --detach <SHA final>` (perubahan lokal pada `.dockerignore`/`Caddyfile` bentrok dengan commit baru → simpan diff, lalu `git checkout -- .dockerignore deploy/Caddyfile` **setelah** diff aman).
3. `bash scripts/build-staging-image.sh` → catat blok **PROVENANCE**; `TEONE_TAG=staging-<sha7> docker compose … up -d app worker caddy`. **Jangan** menjalankan `db:migrate` ulang atau seed bila tidak perlu; **database tidak dibuat ulang**.

### 1.3 Image dan cara mereproduksi build
- **Penyebab kegagalan build:** lihat baris `.dockerignore` di atas — **TERBUKTI** (direproduksi, dan kontrol negatif `check-docker-context` menangkap galat yang sama).
- **Perbaikan:** `tsconfig.build.json` + `typescript.tsconfigPath` di `next.config.ts`. `next build` sungguhan di konteks tiruan **berhasil** dan output standalone **tidak memuat** `tests/` maupun `playwright.config.ts` (**TERBUKTI** lokal). `npm run typecheck` (tsconfig penuh, termasuk tests/) tetap berjalan di CI — cakupan pemeriksaan tipe tidak berkurang.
- **Provenance:** `Dockerfile` memberi label `org.opencontainers.image.revision` (kedua target); `scripts/build-staging-image.sh` **menolak pohon kotor**, menandai `staging-<sha7>`, dan mencetak SHA + image id + label. Compose memakai `TEONE_TAG`. Hasil `docker image inspect` di server **harus dicatat operator** (KLAIM sampai ada).
- **Bukti build image sungguhan:** daemon Docker **tidak ada di sandbox pembangun**; pembuktian dilakukan oleh job CI **"Image Docker (build · migrasi · jalan · provenance)"** — hasilnya di §3.1. Image yang **benar-benar berjalan di staging** (yang dibangun operator dengan perubahan lokal) **tidak dapat dikaitkan ke commit** sampai dibangun ulang dengan skrip di atas.
- **Reproduksi (dari checkout bersih commit tertentu):** `git checkout --detach <SHA> && bash scripts/build-staging-image.sh` (butuh Docker). Tanpa Docker: `npm run check:docker-context`.

### 1.4 Kondisi staging (yang diketahui pembangun)
**KLAIM:** berjalan di `staging-chat.trilogikaedutama.id`, HTTPS, commit `9c297d3`, channel Kemitraan Uji, Meta nyata; uji 1–8 lulus (lihat `docs/tahap-2/bukti-uji-staging-2026-11-25.md`). **BELUM DIBUKTIKAN:** isolasi/port/firewall, cookie `__Host-`, header, G1 via HTTPS staging, backup/restore di server, image ↔ commit, daftar `docs/staging.md` §6 (semua butir belum dicentang). Flag `inbox`/`ai_simulation` harus **mati** — **pembangun tidak dapat memeriksanya**.

## 2. Matriks temuan

Status: **Terbuka** · **Diperbaiki — menunggu audit** · **Terverifikasi** (hanya bila auditor independen sudah memverifikasi).

### 2.1 Gate 1
| ID | Temuan | Perbaikan (kode/dokumen) | Bukti | Status |
|---|---|---|---|---|
| G1-A01 | Penjaga CI dapat meloloskan kegagalan suite | `run-test-report.mjs`, pelapor diperketat, 19 test `ci-guard` (ADR-0005) | Auditor ulang 21 Nov: perbaikan **diverifikasi untuk kasus yang diaudit**; run CI #9 menangkap kegagalan sungguhan | **Terverifikasi** (terbatas pada kasus yang diaudit) |
| G1-A02 | Bukti wajib tak dapat dijalankan di lingkungan auditor | Port tak lagi tetap (`TEST_DB_HOST`, diuji port 55432); peluncur `node --import tsx`; pra-pemeriksaan Chromium (E2E ditandai TIDAK DAPAT DIJALANKAN, bukan lulus); `install-gitleaks.sh`; `verify-all.sh` | 246 test dijalankan **independen** oleh auditor (21 Nov); pembangun: `verify-all` 11/11 di port 5432 dan 55432 | **Diperbaiki — menunggu audit.** E2E browser & drill belum independen |
| G1-A03 | CI pada commit tepat yang dinilai | Tautan run + job dicatat per commit | §3.1 | **Diperbaiki — menunggu audit** (run harus diulang pada commit final yang diaudit) |
| G1-A04 | Keputusan/tag/`jalur-0.md`/titik-kembali | `jalur-0.md` (draf jujur, diperbarui 25 Nov), `daftar-tindakan-pemilik.md` | — | **Terbuka** (hanya pemilik: keputusan, tag, backup titik-kembali) |
| G1-A05 | Staging/HTTPS/backup di server; D-12/D-18 | Backup + restore **media** + verifikasi baris↔berkas + **mode aman** (kill switch global) + drill dengan kontrol negatif; build/deploy reproduksibel | Drill lulus di CI & lokal (§5) | **Terbuka** untuk server/HTTPS/jadwal/lokasi salinan/PIC/D-12/D-18; kode: **diperbaiki — menunggu audit** |

### 2.2 Gate 2
Seluruh perbaikan A01–A06 dibuat sebelum 25 Nov dan **diperiksa ulang pada commit ini**; jumlah test = berkas `tests/integration/tahap2-gate2.test.ts` (35 test; 31 di blok A01–A06, sisanya relasi lintas-temuan).

| ID | Perubahan kode/migrasi | Test yang membuktikan & mencegah regresi (simulasi) | Bukti independen / nyata | Keterbatasan & temuan terbuka | Status |
|---|---|---|---|---|---|
| **A01** identitas & pemisahan kontak | `normalize.ts` (hanya entri `contacts[]` yang terbukti cocok dengan pengirim; tanpa fallback `contacts[0]`), `contacts` (`IdentityConflictError`), ingest memvalidasi ulang, karantina `identitas_bentrok`, `detachIdentity` + `contacts:repair` | **7 test** `G2-A01` (normalizer, kasus audit end-to-end, multi-kontak, bentrok, lintas channel, event lama di antrean, pemulihan) + 15 mutan untuk A01–A06 (ADR-0006) | Test ini ikut dalam **246 test yang dijalankan auditor** (21 Nov, hijau) — **auditor sendiri menyatakan hijau ≠ temuan tertutup**; **nyata:** pesan …4062 tersimpan (KLAIM) | Percakapan yang sudah tercampur **tidak dapat dipisah otomatis**; **belum ada merge kontak**; perilaku `user_id`/BSUID nyata belum teruji | **Diperbaiki — menunggu audit** |
| **A02** dasar jendela hanya dari waktu terbukti | `window.ts` `provenCustomerTime` (cap provider sah, ≤ +5 mnt), jendela diperiksa ulang tepat sebelum kirim (`executeSend`) | **3 test** `G2-A02` + test unit jendela | Ikut 246 test auditor (hijau ≠ tertutup); **nyata:** satu kirim nyata saat jendela terbuka (KLAIM) | Perilaku **di luar jendela 24 jam nyata belum diuji** (M-08) | **Diperbaiki — menunggu audit** |
| **A03** history/live & kelayakan otomatisasi | `automationEligible` (waktu terbukti + umur ≤ 10 mnt **ASUMSI**), kelayakan Tahap 3 (`eligibility.ts`, batas aktivasi), history/echo tidak pernah memicu event | **7 test** `G2-A03` + 13 kasus unit kelayakan + test Tahap 3 (duplikat/terlambat/history tidak layak) | Ikut 246 test auditor (hanya bagian Tahap 2); bagian Tahap 3 **belum diaudit** | Ambang 10 menit & aturan "langsung bercap ≤ 24 jam membuka jendela" **menunggu keputusan pemilik**; T3-F04 (pesan terlambat tak ditandai) | **Diperbaiki — menunggu audit** |
| **A04** race pemetaan | Migrasi **`0003_tahap2_gate2_mapping_version`** (`mapping_version`, `mapping_changed_at`); hasil verifikasi ditulis `WHERE mapping_version = …` → 409 `MAPPING_CHANGED` | **3 test** `G2-A04` + migrasi diuji pada snapshot Tahap 1 (`tahap2-migration-retention`) | **Auditor menjalankan test migrasi snapshot** (21 Nov; gagal koneksi pada port nonstandar sebelum perbaikan, lulus pada 5432) | Balapan nyata antar-proses tidak diuji nyata | **Diperbaiki — menunggu audit** |
| **A05** status koneksi (tiga bukti) | `computeReadiness`: "siap" hanya bila pemetaan **nyata** + langganan terkonfirmasi (`META_APP_ID`) + event diterima | **4 test** `G2-A05` + Golden E2E G2 (UI jujur) | **Nyata (KLAIM):** pemetaan terverifikasi + langganan terkonfirmasi + event diterima (butir 1–3, 25 Nov) | Bentuk `subscribed_apps` **belum diverifikasi ke dokumentasi Meta** (T2-F02) | **Diperbaiki — menunggu audit** |
| **A06** keluar `diproses` tertahan | `expireStaleProcessing` → `belum_pasti` (`proses_terhenti`), tanpa retry; settle menerima `belum_pasti`; worker menyapu | **7 test** `G2-A06` (crash sebelum/sesudah Meta, dua pekerja, pengirim lambat) | Ikut 246 test auditor (hijau ≠ tertutup) | Crash nyata tidak diuji nyata (tidak dapat dipicu aman) | **Diperbaiki — menunggu audit** |
| **A07** bukti nyata & prasyarat Gate 1 | Catatan bukti `bukti-uji-staging-2026-11-25.md`; matriks `matriks-uji-coexistence.md`; `jalur-0.md` diperbarui | — | **KLAIM** butir 1–8; **BELUM DIUJI:** Dibaca, echo, history, media, coexistence menyeluruh | CCP 2.8 & 2.10 **tidak terpenuhi**; staging belum terverifikasi; Gate 1 belum diterima | **Terbuka** (sebagian: klaim belum berbukti) |

### 2.3 T2-F15 / outbox — diperiksa pada commit final (jangan berasumsi)
Dokumen lama (`gate-2-tindak-lanjut.md`, `tahap-2.md`, `arsitektur-konektor.md`, ADR-0006) menyebut hook "dalam memori"; itu **benar untuk commit saat itu** dan **sudah usang**. Pada commit final: event pesan pelanggan ditulis ke **`domain_outbox` dalam transaksi yang sama** dengan pesannya (`ingest.ts` → `enqueueCustomerMessage`; dijaga test statis), dikirim ke subscriber setelah commit (**at-least-once**, `FOR UPDATE SKIP LOCKED`, lease 60 dtk, backoff, 5 percobaan → `failed` terlihat), subscriber **idempoten** (`UNIQUE(kind, trigger_message_id)`, kunci `job-<id>`). **Tes durabilitas (simulasi):** event tidak hilang bila proses mati setelah commit (lease kedaluwarsa dipulihkan pemeliharaan), subscriber gagal → backoff & alasan tercatat, `failed` setelah batas, subscriber melempar sekali tidak menggandakan balasan, duplikat/history/echo tidak menulis event; mutasi M14 (event tidak ditulis) terdeteksi.
**Apakah aman sebelum subscriber otomatisasi dihubungkan?** *Secara desain dan simulasi: ya, dengan syarat.* (1) Subscriber terdaftar (`@/modules/automation`) tetapi **tidak berbuat apa-apa** bila `ai_simulation` mati — **teruji: 0 job dan 0 panggilan Graph** pada alur default. (2) **Baru:** `ai_simulation` **ditolak server** bila endpoint Graph = Meta asli (staging kini begitu) — teruji, mutasi terdeteksi. (3) Kill switch 4 tingkat diperiksa di titik komit **dan** tepat sebelum kirim. **Belum:** durabilitas **tidak diuji dengan Meta nyata**; tak ada retensi outbox (T3-F07); AI sungguhan (Tahap 4) memakai pipeline yang sama dan **harus diaudit ulang** saat itu. **Kesimpulan:** T2-F15 **diperbaiki — menunggu audit** (bukan "terverifikasi").

## 3. Hasil CI dan pengujian

### 3.1 CI pada commit final kode
**Commit kode final:** `3928772689722d1e78c2425ab87bd3d0b00878f5` (branch `claude/lucid-carson-blf4x0`). **Run:** CI #20 — <https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/45629132836> — kesimpulan **success** (25 Nov 2026, 13:59–14:02 UTC), percobaan ke-1, tanpa re-run.

| Job | Hasil | Catatan terukur (dari langkah job) |
|---|---|---|
| Lint · Typecheck · Guard · Secret scan ([job](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/45629132836/job/139257334607)) | **success** | lint, typecheck, **Konteks Docker** (tipe `next build` tanpa `tests/`), guard nomor operasional, secret scan lokal, **gitleaks seluruh riwayat git**, audit dependensi produksi — semua langkah success |
| Build · Test regresi · E2E ([job](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/45629132836/job/139257334582)) | **success** | Build; **Test regresi** (migrasi diuji pada DB kosong, ≈ 89 dtk); Chromium; **Golden E2E**; ringkasan per tag + **penjaga baseline** (jumlah test tidak boleh turun); unggah laporan |
| Drill backup & restore nyata ([job](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/45629132836/job/139257333898)) | **success** | `bash scripts/backup-restore-drill.sh` ≈ 35 dtk (DB + media, kontrol negatif, mode aman) |
| Image Docker — build · migrasi · jalan · provenance ([job](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/45629132836/job/139257334696)) | **success** | build image `runtime` + `tools` ≈ 36 dtk dengan `GIT_SHA` = commit; label revisi = commit; tanpa `/app/tests`; uid 10001; `caddy validate`; `docker compose config`; **migrasi dijalankan dari dalam image tools**; image app dijalankan, `/api/health` = `{"status":"ok"}`, `x-frame-options: DENY`, tanpa `x-powered-by` |

**Hitungan test (CI, dari penjaga baseline):** `@tahap-1` 159 Vitest + 3 E2E · `@tahap-2` 138 + 3 · `@tahap-3` 86 + 3 — **total 383 Vitest, 0 gagal, 0 dilewati**. Golden E2E: 16 spesifikasi → **9 lulus, 7 dilewati** (placeholder **BELUM TERSEDIA**; bukan bukti, bukan kegagalan). Angka ini sama dengan hasil lokal (§3.2); rincian per tag tersimpan di artefak CI "laporan test".
**Batas pembuktian CI:** (1) CI membuktikan **kode pada commit itu** lulus di lingkungan GitHub (data sintetis, Meta **simulasi**); **tidak** membuktikan staging, Meta nyata, atau coexistence. (2) Job *Image Docker* membuktikan bahwa **image dapat dibangun dari konteks bersih dan berjalan**; **tidak** membuktikan bahwa image di server staging dibangun dari commit ini — itu hanya dapat dibuktikan dengan `docker image inspect` di server (item G1 dan G4 di `daftar-tindakan-pemilik.md` §G). (3) Commit yang menambahkan laporan ini hanya mengubah dokumen; CI-nya berjalan sendiri dan **dicatat terpisah** di ringkasan akhir, bukan diklaim di sini. (4) Run lama: #17 (`71bce46`) dan #18 (`9c297d3`, commit staging) success; #19 (`2148cc2`) dibatalkan karena tersusul; commit `2148cc2` **gagal pada penjaga statis di verifikasi lokal** (literal host Graph di luar berkas yang diizinkan) dan diperbaiki di `3928772` — kegagalan ditemukan sebelum ada klaim hijau.

### 3.2 Pengujian lokal pembangun (`bash scripts/verify-all.sh`)
Dijalankan **oleh pembangun** pada pohon kerja bersih commit `3928772` (run bersih ke-5; run ke-4 gagal di langkah drill karena **kesalahan prosedur pembangun** — vitest dijalankan bersamaan di klaster DB yang sama; bukan cacat produk). Pustaka: gitleaks 8.24.3 (terpasang dari `scripts/install-gitleaks.sh`), Chromium via `PW_CHROMIUM_PATH`, PostgreSQL 16 pada **`localhost:5432`**.

| # | Langkah | Hasil | Waktu |
|---|---|---|---|
| 1 | lint | LULUS | 3 dtk |
| 2 | typecheck | LULUS | 2 dtk |
| 3 | guard nomor operasional | LULUS | — |
| 4 | secret scan lokal | LULUS | — |
| 5 | gitleaks seluruh riwayat | LULUS | — |
| 6 | npm audit (produksi) | LULUS — **0 kerentanan** | — |
| 7 | build | LULUS | 9 dtk |
| 8 | Vitest regresi + penjaga | LULUS — **383 test, 0 gagal, 0 dilewati** | 102 dtk |
| 9 | E2E Playwright | LULUS — 9 lulus; 7 placeholder dilewati | 59 dtk |
| 10 | penjaga akhir (dengan E2E) | LULUS | — |
| 11 | drill backup/restore | LULUS | 36 dtk |

**Drill (data sintetis):** 33 tabel; **48 baris** setelah restore (+1 kill switch global, +1 audit mode aman); media: 3 baris ↔ 3 berkas, ukuran + SHA-256 konsisten, pohon berkas identik; mode aman diverifikasi dengan `checkAutomation` nyata; kontrol negatif (arsip rusak, direktori tidak kosong, kebijakan media tak ditetapkan, berkas hilang/rusak) **ditolak sesuai harapan**; backup ≈ 1,55 dtk, restore ≈ 0,66 dtk (**volume sangat kecil, tidak representatif untuk RTO**).
**Port tetap `localhost:5432` (G1-A02):** (a) **Penjaga statis** di suite (`architecture.test.ts`) melarang port tetap di `tests/` dan `scripts/` — ikut lulus dalam 383 test pada commit final (CI dan lokal). (b) Klaster **non-standar** dikonfigurasi lewat **satu** variabel, `TEST_ADMIN_DATABASE_URL` (lihat `docs/pengembangan.md`). Bukti jalan nyata di port **55432** (suite penuh dan `verify-all` 11/11) berasal dari **putaran perbaikan sebelumnya**, memakai klaster sandbox yang **sudah ada sebelumnya** (bukan dibuat pembangun); **tidak diulang pada commit final** — run final di atas memakai 5432. **Bukan bukti independen.**
**Batas:** hasil di atas adalah **klaim pembangun yang dapat direproduksi** (perintah + hasil aktual di atas), **bukan** audit independen; CI harus diulang pada commit yang benar-benar diaudit.

### 3.3 Pengujian independen
Satu-satunya yang **independen**: audit ulang Gate 1 (21 Nov) — 246 test Vitest lulus pada Node 22/PostgreSQL 16 di lingkungan auditor; lint/typecheck/build/guard lulus. **E2E browser dan drill backup/restore tidak dapat dijalankan** di lingkungan auditor (Chromium `socket() EPERM`; `psql`/`pg_dump` tidak ada). Setelah itu bertambah banyak kode (Tahap 3, perbaikan); **belum ada audit independen atas commit final**.
**Test yang dilewati:** 7 placeholder Golden E2E bertanda **BELUM TERSEDIA** (G2-nyata, G3-nyata, G4, G5-AI-nyata, G6, G7, G8-nyata) — **bukan bukti**, bukan kegagalan.

## 4. Bukti uji Meta nyata (terpisah dari simulasi)
Lihat **`docs/tahap-2/bukti-uji-staging-2026-11-25.md`**. Ringkas: 8 butir **KLAIM** lulus (pemetaan, langganan, pesan masuk, karantina, teks keluar, status Diterima, error 10 teratasi, perbaikan App Secret); butir 9 (Dibaca, echo, history, media, coexistence) **BELUM DIUJI**. Naik menjadi **TERBUKTI** hanya setelah bukti disamarkan dilampirkan. Matriks uji berikutnya: `docs/tahap-2/matriks-uji-coexistence.md` (**disiapkan, belum dijalankan**; langkah berdampak ke akun memerlukan persetujuan tertulis pemilik).

## 5. Backup & restore, dan keputusan yang dibutuhkan pemilik
**TERBUKTI (CI + lokal, data sintetis):** drill menguji DB dan media — 33 tabel, 6 migrasi; pohon berkas media identik; baris media ↔ berkas (ukuran + SHA-256); kontrol negatif (arsip rusak, direktori tidak kosong, kebijakan media tak ditetapkan, berkas hilang/rusak); **mode aman** (kill switch global menyala setelah restore; `checkAutomation` memblokir); waktu backup ≈ 1,55 dtk, restore ≈ 0,66 dtk pada run lokal commit final (**data sangat kecil; tidak representatif untuk RPO/RTO**). **BELUM:** backup/restore **di server staging**, jadwal, **lokasi salinan terpisah**, **PIC pembuat dan pemeriksa**, kunci di brankas terpisah, uji volume nyata — **tidak boleh diklaim**. Checksum/ukuran/versi migrasi per run tercatat di `.test-results/backup-restore-drill.md` (artefak CI).
**Keputusan yang masih dibutuhkan (hanya pemilik):** D-12 (RPO/RTO — usulan RPO ≤ 1 jam / RTO ≤ 4 jam kerja = **target untuk dinilai, belum tercapai**; backup harian ≠ RPO 1 jam), D-18 (retensi/PDP — angka masih **usulan**), PIC backup, lokasi salinan, persetujuan langkah coexistence (M-11, M-12), D-02/D-03, D-05/D-16/D-22 (Tahap 3, **ASUMSI**), penanganan pesan terlambat (T3-F04).

## 6. Wajib selesai sebelum Tahap 3 dihubungkan ke Meta — dan pekerjaan terbatas yang boleh
**Catatan penting:** kode Tahap 3 (simulasi) **sudah ada di repository dan di commit staging `9c297d3`**, di balik flag default mati (dibuat atas instruksi pemilik sebelumnya, saat Gate 2 belum diputuskan). Yang dilarang instruksi — **menghubungkan otomatisasi ke Meta** — **tidak terjadi**: flag mati, dan kini **dikunci server** terhadap Meta asli.

**WAJIB sebelum otomatisasi apa pun dihubungkan ke Meta:**
1. Lampirkan bukti disamarkan uji 25 Nov; rekonsiliasi staging selesai (diff lokal ditinjau; image dibangun ulang dari commit bersih dengan provenance tercatat).
2. Verifikasi di server: HTTPS, cookie `__Host-`, header, port, flag `inbox`/`ai_simulation` **mati**, G1 via staging, backup/restore di server, PIC.
3. Uji nyata terkontrol yang dibutuhkan Gate 2: **M-11 (echo)** dan, bila memungkinkan dan disetujui, **M-12 (history)** — atau tahap tetap "belum lulus penuh".
4. Verifikasi dokumentasi Meta resmi (A7): nama field webhook, bentuk `subscribed_apps`, tabel kode galat.
5. **Audit ulang independen** Gate 1 dan 2 pada commit final, lalu keputusan pemilik tercatat; D-12/D-18, D-05/D-16/D-22 diputuskan.

**Boleh dikerjakan secara terbatas (tanpa menghubungkan otomatisasi):** pengembangan **simulasi terisolasi** (mock) dan dokumentasi; perbaikan diagnostik kecil (S-01 penghitung penolakan tanda tangan) bila lingkupnya disetujui; uji nyata **hanya** sesuai matriks dan gerbang persetujuan; persiapan Tahap 4 sebatas desain.

## 7. Rekomendasi pembangun (bukan keputusan gate)
- **Gate 1: TAHAN** penerimaan penuh. Dasar: staging/HTTPS/isolasi/backup di server **belum terbukti**; D-12/D-18 belum diputuskan; CI/E2E independen pada commit final belum ada. Perbaikan kode yang dapat dilakukan **sudah dikerjakan** (menunggu audit).
- **Gate 2: TAHAN** penerimaan penuh; **LANJUT TERBATAS** untuk menyelesaikan bukti nyata (matriks coexistence) dan audit ulang. Dasar: G2-A01–A06 diperbaiki dengan test, tetapi **A07 terbuka** (CCP 2.8 & 2.10 tidak terpenuhi; bukti 25 Nov belum terlampir; coexistence belum diuji).
- **Tahap 3: LANJUT TERBATAS = simulasi terisolasi saja.** Tidak boleh dihubungkan ke Meta atau dinyalakan di staging (`inbox`, `ai_simulation` mati) sebelum butir §6 selesai dan keputusan pemilik tercatat.
Hanya pemilik yang memutuskan; auditor independen menilai ulang.
