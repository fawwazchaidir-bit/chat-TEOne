# Laporan Akhir — Tahap 1: Fondasi Produksi

> Disusun oleh **pembangun**. Ini **bukan audit**: AGENTS.md §2.6 melarang pembangun mengaudit pekerjaannya sendiri. Kolom "evaluasi pembangun"
> di bagian 5 hanya memetakan bukti agar auditor independen dapat memverifikasi dengan cepat. Gate 1 memerlukan `docs/gates/gate-1.md` dari **sesi auditor baru**
> (prompt: `docs/gates/GATE-CHECKLIST.md` bagian G).

## 1. Ringkasan hasil
Fondasi TE One dibangun sebagai **kode yang berjalan dan teruji**: akun & sesi aman, 2FA TOTP wajib Super Admin, izin = aksi + cakupan channel, tim, channel (batas aman
konkurensi), audit log append-only, feature flag default mati, registri kill switch fail-closed, backup terenkripsi dengan drill restore nyata, serta fondasi regresi (CI, tag `@tahap-N`,
baseline jumlah test, guard nomor operasional, secret scan). UI Bahasa Indonesia dengan penanda lingkungan, **CONTOH**, dan **Belum tersedia**.

**Hasil uji lokal (PostgreSQL 16 & Chromium sungguhan):** 124 test Vitest + 3 E2E lulus (127 test `@tahap-1`), 0 gagal, 0 dilewati (selain 7 placeholder G2–G8 yang sengaja ditandai BELUM TERSEDIA). **CI di GitHub (§4.4):** run #1 menemukan 2 kegagalan pada *perkakas CI* (bukan aplikasi); setelah diperbaiki, **run #2 (commit `08bb3a8`) hijau penuh** — lint, typecheck, guard, secret scan + gitleaks atas seluruh riwayat, `npm audit`, build, 124 test Vitest, E2E G1 dengan Chromium sungguhan, dan drill backup/restore.
**Belum terbukti:** staging/HTTPS/cookie `Secure`, build image Docker, salinan backup di lokasi terpisah, D-12 (RPO/RTO). Lihat bagian 4 dan 9.
Tidak ada koneksi Meta/WhatsApp, inbox, AI, label, pipeline, follow-up. **Nomor Admisi/Hotline dan Halo AI tidak disentuh** (bagian 11).

## 2. Repository, branch, commit, tag
- Repository: `https://github.com/fawwazchaidir-bit/chat-TEOne` — kondisi awal: **kosong** (tanpa commit); tidak ada pekerjaan yang ditimpa; tanpa force push.
- Branch kerja: `claude/lucid-carson-blf4x0` (ketentuan sesi). AGENTS.md §2 menyebut `tahap-1-fondasi`; `main` **belum ada** di remote dan **tidak dibuat/di-push** pembangun (T1-F05). Pemilik memutuskan cara landing lewat PR.
- Commit: kode `9deafef` ("Tahap 1: fondasi produksi TE One …") lalu commit dokumentasi & laporan; **commit yang diaudit = HEAD cabang saat audit** (`git log`).
- Tag diusulkan: `tahap-1-diterima` — **belum dibuat**; hanya setelah keputusan gate. Backup database titik-kembali: dibuat saat tag dibuat.
- **Berkas dari paket v2 yang ditambahkan:** `AGENTS.md`, `docs/decisions.md`, `docs/gates/GATE-CHECKLIST.md`, `docs/prompts/tahap-1.md`.
  **Tidak diterima & tidak dikarang:** `docs/jalur-0.md`, `docs/prompts/tahap-2…9.md` (T1-F04).

## 3. Status fitur (istilah AGENTS.md §4)
"Terbukti nyata" di Tahap 1 berarti: diuji dengan PostgreSQL dan browser sungguhan di lingkungan **lokal/CI-ekuivalen** (Meta/AI di luar lingkup tahap ini). **Staging belum terverifikasi** untuk semuanya.

| Fitur | Status |
|---|---|
| Login/logout, Argon2id, sesi server ter-hash, pencabutan sesi, CSRF+Origin, pembatasan login | **Terbukti nyata (lokal)** |
| 2FA TOTP (wajib Super Admin), anti-replay, kode pemulihan sekali pakai, prosedur pemulihan (UI admin + CLI) | **Terbukti nyata (lokal)** — E2E di browser |
| Pengguna (buat/aktif/nonaktif/identitas/reset sandi & 2FA), wajib ganti sandi sementara | **Terbukti nyata (lokal)** |
| Peran & izin + cakupan channel; deny per pengguna; anti-eskalasi; Super Admin terakhir (API + trigger) | **Terbukti nyata (lokal)** |
| Tim (CRUD, anggota, channel) | **Terbukti nyata (lokal)**; routing/antrean = Di luar lingkup (Tahap 3) |
| Channel: data, batas dari pengaturan organisasi, konkurensi, arsip/slot, status jujur, penanda operasional | **Terbukti nyata (lokal)** |
| Audit log append-only (hak + trigger), tanpa rahasia | **Terbukti nyata (lokal)** |
| Feature flag default mati, fail-closed | **Terbukti nyata (lokal)** |
| Registri kill switch (chat/channel/fitur/global), fail-closed, tidak melepas sendiri | **Terbukti simulasi** (fungsi contoh; belum ada otomatisasi nyata) |
| Backup terenkripsi + restore ke DB terpisah | **Terbukti nyata (lokal, data kecil)**; salinan terpisah/jadwal = Belum dibuat |
| CI (lint, typecheck, build, test, secret scan, guard) | **Terbukti nyata** — GitHub Actions run #2 hijau penuh pada `08bb3a8` (harus diulang pada commit yang diaudit) |
| Docker `runtime`/`tools`, Compose & Caddy staging | **Dibuat, belum diuji** (paket standalone terverifikasi lokal; build image gagal karena jaringan sandbox) |
| Golden E2E **G1** | **Terbukti nyata (lokal)** |
| Golden E2E **G2–G8** | **Belum dibuat** — placeholder bertanda BELUM TERSEDIA (bukan bukti) |
| Konektor WhatsApp/Meta, inbox, AI, label, pipeline, follow-up, laporan, integrasi Internal Portal | **Di luar lingkup** (Tahap 2–6; ditandai "Belum tersedia" di UI) |
| Pembersih retensi terjadwal | **Belum dibuat** (T1-F06) |

## 4. Hasil pengujian (perintah → hasil aktual)

### 4.1 NYATA (PostgreSQL 16.15, Node 22, Chromium; lokal)
| Perintah | Hasil aktual |
|---|---|
| `npm run lint` | 0 error |
| `npm run typecheck` (TS strict) | 0 error |
| `node scripts/guard-operational.mjs` | lulus (159 berkas) |
| `node scripts/secret-scan.mjs` | lulus (159 berkas) |
| `npm audit --omit=dev` | 0 temuan (dev: 4 *moderate* — T1-F07) |
| `npm run build` | sukses; 15 halaman + 33 route API |
| `npx vitest run` (DB uji dibuat ulang **dari kosong** tiap eksekusi → migrasi teruji) | **9 berkas, 124 test, 0 gagal, 0 dilewati/todo** (eksekusi akhir). Stabilitas: suite (saat 117 test) dijalankan 3× berturut-turut, semuanya lulus; test ditambah sesudahnya (per-IP, penjaga baseline, gitleaks) |
| `npx playwright test` (server produksi hasil build) | **3 lulus**, 7 dilewati = placeholder G2–G8 |
| Rincian per berkas Vitest | audit 8 · auth 24 · authorization 22 · channels 14 · controls 14 · health 1 · architecture 12 · guards 18 · permission-engine 11 (= 124) |
| `node scripts/test-tag-report.mjs` | `@tahap-1`: 124 + 3 = **127** (baseline per jenis: Vitest 124 / E2E 3), tidak ada masalah |
| `bash scripts/backup-restore-drill.sh` | semua verifikasi lulus; backup 0,15 dtk, restore 0,28 dtk, 9,6 KB (data kecil) — `docs/backup-restore.md` |
| Standalone `node server.js` (layout stage runtime Dockerfile) | `/login` 200, `/api/health` `{"status":"ok"}`, aset CSS 200 |

**Uji mutasi** (merusak pengaman dengan sengaja → test harus gagal): filter cakupan channel (3 test gagal) · proteksi replay TOTP (1) · deny-mengalahkan-allow (1) · anti-eskalasi (3) · advisory lock batas channel (2) ·
lockout global saat IP tak diketahui (1) · pencabutan sesi saat nonaktif (**awalnya lolos tak terdeteksi** → test diperkuat dengan pemeriksaan eager → kini 1 gagal) · pencabutan sesi saat reset sandi (1).
Guard juga diuji terhadap pelanggaran sintetis; pengujian itu **menemukan celah nyata** (nomor `+62 812 …` berspasi lolos) yang lalu diperbaiki.

### 4.2 SIMULASI
Jam `Date` palsu (kode TOTP dipakai berulang tanpa melanggar proteksi replay); kill switch diuji pada **fungsi contoh** `guardedAutomation`; kegagalan baca database disimulasikan dengan `REVOKE SELECT` sementara (uji fail-closed flag & kill switch); pelanggaran guard/secret-scan sintetis dibangun saat runtime.

### 4.3 BELUM DAPAT DIUJI
Staging (HTTPS, cookie `__Host-`/`Secure`, firewall, port DB tertutup) · build image Docker · salinan backup di lokasi terpisah/jadwal · restore drill di server · kill switch pada otomatisasi nyata (<1 menit, G8) · beban/performa (D-13) · Golden E2E G2–G8.

### 4.4 Run CI pertama di GitHub (run #1, commit `42b911c`) — temuan perkakas
| Job | Hasil | Catatan |
|---|---|---|
| Drill backup & restore | **Lulus** | pertama kali di runner (PostgreSQL 16, Ubuntu 24.04) |
| Lint · Typecheck · Guard · Secret scan (lokal) | Lulus | |
| Build · Test regresi | **Vitest 119/119 lulus** di runner (PostgreSQL 16.16 Debian, berbeda dari sandbox) | migrasi dari DB kosong, trigger, dan konkurensi teruji di luar mesin pembangun |
| Langkah gitleaks | **Gagal — bukan karena rahasia** | `gitleaks-action` pada event push menghitung rentang `<commit-pertama>^..HEAD`; commit pertama repo adalah *root commit* (tanpa induk) → git "unknown revision" → ~0 byte dipindai. **Perbaikan:** biner gitleaks 8.24.3 ber-pin checksum resmi memindai seluruh riwayat |
| Penjaga baseline (setelah Vitest, sebelum E2E) | **Gagal — kesalahan desain** | baseline gabungan (122) dibandingkan dengan hitungan tanpa E2E (119). **Perbaikan:** baseline dipisah per jenis; E2E diwajibkan hanya di langkah akhir lewat `--require-e2e`; ada test regresi untuk skenario ini |
| E2E / `playwright install` | **Dilewati** (langkah sebelumnya gagal) | belum terbukti di runner |

**Efek samping yang berharga:** setelah gitleaks benar-benar memindai riwayat, ia menemukan 6 kecocokan aturan `generic-api-key` — semuanya **kata sandi sintetis akun uji di `tests/`** (diperiksa satu per satu; tidak ada token/kunci nyata). Ditangani dengan allowlist **sempit** (`.gitleaks.toml`: hanya aturan itu, hanya `tests/`); kontrol memastikan token spesifik di `tests/` dan rahasia generik di `src/`/`docs/` **tetap tertangkap**. Percobaan pertama allowlist (`[[allowlists]]`+`targetRules`) ternyata **tidak didukung** pada versi 8.24.3 dan baru ketahuan karena kontrol dijalankan.

**Run #2 (commit `08bb3a8`, setelah perbaikan) — hijau penuh, dibaca dari log runner:**
| Job / langkah | Bukti dari log |
|---|---|
| Lint, typecheck, guard (160 berkas), secret scan lokal (160 berkas) | lulus |
| gitleaks | `gitleaks.tgz: OK` (checksum resmi lolos) · **3 commit dipindai (~896 KB) · no leaks found** |
| `npm audit --omit=dev --audit-level=high` | `found 0 vulnerabilities` |
| Build · Vitest | **124 test, 0 gagal, 0 dilewati**; langkah setelah Vitest (sebelum E2E) kini keluar "Tidak ada masalah" (baseline 124 / 3) |
| `playwright install --with-deps chromium` | Chromium v1255 terpasang (sesuai Playwright 1.65.1; tanpa `PW_CHROMIUM_PATH`) |
| Golden E2E | **G1: 3 lulus**, 7 dilewati (placeholder G2–G8), 8,1 dtk |
| Tag-report akhir `--require-e2e` | `@tahap-1 \| 124 \| 3 \| 127 \| 124 / 3` — tanpa masalah |
| Drill backup & restore | lulus |

Catatan operasional: `playwright install --with-deps` memakan ~6 menit (CI total ≈ 7,5 menit) dan GitHub memperingatkan bahwa `actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4` memakai Node 20 yang akan usang (T1-F21).

## 5. CCP Tahap 1 (GATE-CHECKLIST bagian C — Gate 1) — pemetaan bukti
Kolom hasil adalah **evaluasi pembangun**, bukan keputusan; verifikasi ulang oleh auditor.

| CCP | Batas kritis | Bukti | Evaluasi pembangun |
|---|---|---|---|
| 1.1 Izin di server termasuk cakupan channel | 0 uji akses negatif lolos (UI & API) | `tests/integration/authorization.test.ts` (22), `tests/unit/permission-engine.test.ts` (11), E2E G1 (UI + API langsung: daftar tersaring, detail Admisi → 404, mutasi tanpa CSRF → 403, halaman admin → "Akses ditolak"); mutasi menghapus filter → 3 test gagal | Terpenuhi (lokal) |
| 1.2 Super Admin terakhir terlindungi; tak bisa naikkan hak sendiri | 0 lolos | `authorization.test.ts` §anti-eskalasi & §Super Admin terakhir: API, **trigger DB langsung**, dua Super Admin saling menurunkan **bersamaan** → tepat 1 berhasil | Terpenuhi (lokal) |
| 1.3 2FA wajib sebelum akses administratif Super Admin | 0 bypass | `auth.test.ts` (5 endpoint → 403 `TOTP_SETUP_REQUIRED`/`TOTP_REQUIRED`), E2E G1 (UI diarahkan; API 403 dengan cookie sesi yang sama) | Terpenuhi (lokal) |
| 1.4 Audit log append-only | UPDATE/DELETE dari aplikasi ditolak | `audit.test.ts`: aplikasi → 42501 (UPDATE/DELETE/TRUNCATE/ALTER/DROP); **pemilik pun** ditolak trigger; mekanisme & batas (superuser DB) di `keamanan-dan-izin.md` §6; drill: tetap berlaku setelah restore | Terpenuhi (lokal); batas superuser DB = T1-F14 |
| 1.5 Tidak ada rahasia di repository | 0 temuan secret scan; `.env` tak ter-commit | `scan:secrets` lulus (159 berkas), `.gitignore`, test arsitektur (`.env` tak ter-track), 5 test pemindai; pengecualian `secret-scan:allow` hanya pada **5 baris** kredensial DB uji sekali-pakai (2 di `ci.yml`, 2 di `backup-restore-drill.sh`, 1 di `docs/pengembangan.md`) — terlihat & ditinjau di PR | Terpenuhi (lokal **dan CI**): gitleaks atas seluruh riwayat = *no leaks* (run #2) |
| 1.6 Batas channel aman terhadap permintaan bersamaan | 0 kelebihan pada ≥ 20 paralel | `channels.test.ts`: **24** permintaan API paralel → tepat 5; **30** INSERT langsung ke DB → tepat sisa slot; unarchive paralel → 1 | Terpenuhi (lokal) |
| 1.7 Backup & restore nyata | Restore berhasil; data terbaca; waktu tercatat | `docs/backup-restore.md` §2 (8 verifikasi lulus; 0,15/0,28 dtk) | **Sebagian**: lokal, data kecil; server/salinan terpisah belum (T1-F01, T1-F09) |
| 1.8 Status channel jujur | Tidak ada status "terhubung" | CHECK DB (4 nilai ditolak), API mengabaikan `status`, test arsitektur (UI tanpa "Hubungkan WhatsApp"/"Terhubung"), E2E, `docs/reports/bukti/tahap-1-channel-status-jujur.png` (data CONTOH) | Terpenuhi (lokal) |
| 1.9 Fondasi regresi aktif | CI menjalankan semua test, secret scan, guard; feature flag & registri kill switch berfungsi | `ci.yml`; `guards.test.ts` (18 test membuktikan guard/pemindai/penjaga baseline **menangkap** pelanggaran) + `architecture.test.ts` (lebar allowlist gitleaks, pin checksum); `controls.test.ts` (flag & kill switch) | Terpenuhi (lokal **dan CI**): run #2 hijau penuh pada `08bb3a8`, termasuk E2E dan penjaga baseline; **harus diulang pada commit yang diaudit** |

Pemeriksaan lain Tahap 1 §14: tersedia & lulus — login benar/salah, pengguna nonaktif + sesi lama, logout, pembatasan login, TOTP wajib, kode pemulihan sekali pakai, cakupan channel, penolakan menang atas peran, perubahan izin langsung berlaku, non-Super Admin tak bisa menjadi Super Admin, data contoh, batas (batas+1 ditolak), arsip & penggunaan ulang slot, migrasi DB kosong, audit dihasilkan, pengguna tanpa izin tak melihat audit, backup–restore, feature flag mati = fitur tidak aktif, kill switch contoh. "Aplikasi dapat dijalankan ulang mengikuti README": README + `docs/pengembangan.md` diikuti saat menyiapkan DB E2E/drill dari nol lewat skrip yang sama.

## 6. Regresi tahap-tahap sebelumnya
Tidak ada tahap sebelumnya. **Jumlah test sebelum: 0 → sesudah: 127** (`@tahap-1`: 124 Vitest + 3 E2E). Ini menjadi **baseline per jenis** (`tests/baseline-counts.json` = `{"@tahap-1":{"vitest":124,"playwright":3}}`, hanya boleh naik). Tag `@tahap-1` dipasang pada setiap `describe`.

## 7. Perubahan database dan migrasi
Migrasi maju-saja, diuji pada database kosong (setiap eksekusi test) dan lewat restore:
- `0000_initial_schema` — 16 tabel: `org_settings, users, roles, user_roles, role_grants, user_grants, sessions, recovery_codes, login_attempts, teams, team_members, channels, team_channels, audit_log, feature_flag_overrides, kill_switches` (+ CHECK: status channel, penanda operasional, cakupan grant, jenis integrasi, lingkungan).
- `0001_constraints_and_triggers` — baris `org_settings`; trigger: `audit_log` tolak UPDATE/DELETE & TRUNCATE; `channels` batas aktif (advisory lock `727001`); `org_settings` batas tak boleh < jumlah aktif; `users` Super Admin terakhir (advisory lock `727002`). Kode SQLSTATE kustom `TE001–TE003`.
- `db/init-roles.sql` (role `teone_owner`/`teone_app`), `db/grants.sql` (dijalankan tiap migrasi; mencabut UPDATE/DELETE/TRUNCATE pada `audit_log`, semua hak pada skema `drizzle`).
Tidak ada tabel/worker untuk fitur tahap berikutnya (ADR-0002/0003 hanya rancangan).

## 8. Kondisi environment
| Lingkungan | Kondisi |
|---|---|
| Development | Sandbox Linux (Ubuntu 24.04), Node 22.23, PostgreSQL 16.15 lokal; DB `teone_test`/`teone_e2e` sekali pakai. **Berfungsi.** |
| Staging | **Belum tersedia** (J0-03). Berkas `deploy/` & `docs/staging.md` dibuat; **belum terverifikasi**. |
| Production | Belum ada. Seed contoh ditolak di production (diuji). |

## 9. Temuan
Rincian lengkap: [`docs/temuan-dan-risiko.md`](../temuan-dan-risiko.md). **Kritis: 0 · Tinggi: 0 · Sedang: 6 terbuka (+1 teratasi: T1-F02) · Rendah: 14** — total 21 temuan (menurut pembangun; auditor menilai ulang).

| ID | Prio | Ringkas | Status |
|---|---|---|---|
| T1-F01 | sedang | Staging belum tersedia → bukti HTTPS/cookie/jaringan/backup di server tertunda | Terbuka (Pemilik) |
| T1-F02 | sedang | CI GitHub: run #1 menemukan 2 kegagalan perkakas (gitleaks pada root commit; baseline sebelum E2E) → diperbaiki; **run #2 hijau penuh** | **Teratasi** (verifikasi ulang pada commit yang diaudit) |
| T1-F03 | sedang | Image Docker belum terbukti ter-build (jaringan sandbox) | Terbuka |
| T1-F04 | sedang | `jalur-0.md` & prompt tahap 2–9 tidak ada di paket | Terbuka (Pemilik) |
| T1-F06 | sedang | Pembersih retensi belum ada; D-18 masih usulan | Terbuka |
| T1-F08 | sedang | Rotasi `APP_ENCRYPTION_KEY` belum dirancang | Terbuka |
| T1-F09 | sedang | Backup: data kecil, tanpa salinan terpisah/jadwal/media; D-12 belum dinilai | Terbuka |
| T1-F21 | rendah | `playwright install --with-deps` ~6 menit; actions memakai Node 20 (akan usang) | Terbuka |
| T1-F05,07,10–20 | rendah | Penamaan branch; audit dev-only; trade-off lockout; TRUST_PROXY; CSP inline; pemulihan tanpa email; superuser DB; kill switch & G2–G8 belum nyata; dll. | Lihat dokumen |

**Perbaikan yang dibuat selama pengerjaan (bukan temuan terbuka):** lockout global saat IP tak diketahui; editor izin yang bisa menghilangkan entri allow+deny; celah regex guard nomor berspasi; pencabutan sesi yang awalnya tak teruji; Dockerfile tanpa jalur migrasi.

## 10. Asumsi yang dipakai (ID `docs/decisions.md`)
Semua keputusan di `decisions.md` masih **Terbuka**; tidak ada yang dilaporkan sebagai final.
- **ASUMSI (D-18)** — retensi & klasifikasi data memakai angka usulan (webhook ≤30 hari, log ≤90 hari, chat 2 tahun, hapus ≤14 hari kerja) **hanya sebagai rancangan dokumen**; belum ada kode retensi.
- **ASUMSI (D-12)** — RPO ≤ 1 jam / RTO ≤ 4 jam kerja dicatat sebagai **belum dinilai**; tidak ada klaim pencapaian.
- **ASUMSI (D-19)** — VPS tersendiri; lokasi dicatat saat server dibuat (belum ada).
- D-01, D-02, D-03 **tidak dipakai/diputuskan**; hanya dicantumkan pada rencana Meta (`rencana-integrasi-meta-tahap-2.md`). Tidak ada kode yang bergantung pada D-xx.
Parameter keamanan (umur sesi 12 jam/idle 4 jam, ambang login 5/30 per 15 menit, dsb.) adalah **pilihan teknis pembangun**, bukan keputusan bisnis; dapat disetel.

## 11. Bukti nomor operasional dan Halo AI tidak diubah
- Tahap 1 **tidak memiliki** kode/kredensial/konfigurasi Meta, WAHA, Baileys, atau konektor WhatsApp apa pun; `grep` atas `src/` & `scripts/` untuk `graph.facebook`, `api.openai`, `api.anthropic` = kosong; test arsitektur memeriksa dependensi & kode terhadap `baileys|whatsapp-web|waha|wppconnect`.
- Channel tidak memiliki kolom nomor telepon; penanda `operasional` hanya sah di production & bukan data contoh (CHECK DB); seed contoh ditolak di production; seed hanya 3 channel "— contoh" tanpa identitas.
- `guard:operational` lulus: tidak ada penanda operasional di seed/fixture/config/test (pengecualian `guard-operational:allow` hanya pada **4 baris** di `tests/integration/channels.test.ts` yang sengaja menguji penolakan), tidak ada nomor berakhiran 1119/0124, **tidak ada nomor telepon lengkap apa pun** di repository; 15 test membuktikan guard menangkap pelanggaran (termasuk format `+62 812 …`).
- Tidak ada akses ke akun Meta, aplikasi Halo AI, atau server lain; tidak ada panggilan jaringan keluar dari aplikasi.

## 12. Prasyarat tahap berikutnya (Tahap 2 — ±2–22 Des 2026)
1. **Gate 1**: audit independen (`gate-1.md`) + keputusan pemilik; lalu tag `tahap-1-diterima` + backup titik-kembali. CI hijau pada commit yang diaudit (T1-F02).
2. **Keputusan:** D-02 & D-03 (±1 Des 2026), D-01 (sebelum Tahap 3, ±22 Des). Tanpa keputusan, Tahap 2 memakai asumsi default dan menandainya.
3. **Akses Meta:** Meta Business/WABA/aplikasi Meta milik TE One, jalur Tech Provider/BSP, nomor uji (Kemitraan) — `rencana-integrasi-meta-tahap-2.md`.
4. **Server staging** dengan HTTPS publik + domain (Jalur 0 J0-03; berkas `docs/jalur-0.md` perlu ditambahkan) — webhook Meta butuh URL publik.
5. Tambahan teknis yang harus masuk Tahap 2: daftar penerima uji server-side (CCP 2.5), tabel kontak/percakapan/pesan (ADR-0003) & antrean (ADR-0002) di balik flag `whatsapp_connector`, daftar penerima uji, penambahan test `@tahap-2` dan baseline.
6. Keputusan D-12/D-18 + pembersih retensi sebelum data pelanggan masuk (T1-F06, T1-F09).
