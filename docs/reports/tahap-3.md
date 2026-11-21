# Laporan Akhir — Tahap 3: Inbox Tim, Routing, Pengambilalihan, dan Kill Switch

> **Status jujur:** Tahap 3 **dibuat dan lulus uji secara SIMULASI** (mock Graph API + job AI simulasi). **Belum lulus untuk integrasi langsung** (prompt Tahap 3 §17): tidak ada uji nyata dengan nomor uji, dan **Gate 2 belum diterima** (G2-A07 terbuka). Tahap ini dikerjakan atas instruksi eksplisit pemilik ("lanjut dulu kerjakan tahap (gate) 3") sementara Gate 2 masih TAHAN — prompt Tahap 3 §1 mengizinkannya dengan syarat semua uji nyata inbox ditandai *belum lulus integrasi langsung*.
> **AI sungguhan belum ada** (Tahap 4). Tidak ada keputusan gate, tag `tahap-3-diterima`, atau merge ke `main` yang dibuat pembangun.

## 1. Ringkasan hasil
- **Inbox tim** untuk ±10 admin lintas channel: navigasi (semua / saya / belum ditugaskan / channel / tim), daftar dengan pencarian, filter, jumlah, belum dibaca per pengguna, isi percakapan dengan sumber pesan jujur, panel informasi, catatan internal, balasan cepat, kontrol tim default dan **Jeda otomatisasi channel**.
- **Akses percakapan** satu sumber kebenaran (kanal + akses tim tujuan pengalihan **terbatas pada percakapan itu**; penolakan pengguna menang). Daftar, jumlah, pencarian, riwayat lintas channel, media, dan umpan pembaruan memakai fragmen akses yang sama.
- **Balasan manual** teks/gambar/PDF: penerima dari percakapan, izin + kebijakan penerima + jendela + idempotensi di server, AI → Off (tetap Off walau gagal), tanpa retry buta.
- **Mesin status AI** atomik berversi, batas aktivasi ulang, **pencegahan benturan AI–admin**, echo HP (D-05 ASUMSI), **outbox durable** (menutup T2-F15), pipeline otomatisasi ber-guard, **kill switch 4 tingkat** (chat/channel/fitur/global) yang diperiksa di titik komit dan tepat sebelum kirim, tidak pernah menyala kembali sendiri.
- **Pembaruan tampilan:** polling terkendali (ADR-0009).
- **Pengujian:** Vitest **368 test, 0 gagal, 0 dilewati** (84 `@tahap-3` baru); E2E **9 lulus** (3 G1 + 3 G2 + 3 G3/G5/G8 simulasi) + 7 placeholder resmi; **20 mutasi invarian kritis semuanya terdeteksi**; drill backup & restore lulus.
- **Pengujian menemukan dan memperbaiki** celah nyata (lihat §9 "ditemukan & diperbaiki"), termasuk bug UI yang hanya terlihat di browser (spanduk kill switch).

## 2. Repository, branch, commit, tag
- Repository: `https://github.com/fawwazchaidir-bit/chat-TEOne` · branch kerja sesi: `claude/lucid-carson-blf4x0` (≠ `tahap-3-inbox` AGENTS §2; ketentuan sesi — lihat T1-F05).
- Commit awal Tahap 3: `c22a48a` (akhir Tahap 2/perbaikan audit Gate 1–2) → commit isi: `ecf3bec` → commit laporan (lihat `git log`). 91 berkas, ±12,6 rb baris ditambah.
- Tag yang **diusulkan** (tidak dibuat): `tahap-3-diterima` — hanya setelah keputusan Gate 3 tercatat.
- CI GitHub: run #14 pada `c3a29b1` **hijau penuh** (lihat §8.1); commit setelahnya hanya mengubah dokumen.

## 3. Status fitur (istilah AGENTS.md §4)
| Fitur | Status |
|---|---|
| Daftar, pencarian, filter, jumlah, navigasi, pagination kursor; nomor disamarkan di daftar | **Terbukti simulasi** (integrasi + E2E) |
| Visibilitas per channel di semua jalur (daftar/jumlah/pencarian/panel lintas channel/media/umpan perubahan) | **Terbukti simulasi** (CCP 3.1; mutasi M08 terdeteksi) |
| Belum dibaca per pengguna (D-16 **ASUMSI**); duplikat/history/echo tidak menambah | **Terbukti simulasi** |
| Antrian default channel; penugasan tim+PIC dengan deteksi benturan (409 + audit) | **Terbukti simulasi** (dua admin serentak: tepat satu menang) |
| Pengalihan antartim di percakapan yang sama (D-22 **ASUMSI**); akses tim tujuan terbatas pada percakapan itu | **Terbukti simulasi** (CCP 3.2; M09/M10 terdeteksi) |
| Lead Nyasar manual | **Terbukti simulasi**; deteksi otomatis **di luar lingkup** (Tahap 4) |
| Balasan manual teks/gambar/PDF; klik ganda 12× → 1 pesan; jendela; penerima di luar daftar uji; gagal/belum pasti | **Terbukti simulasi** (CCP 3.5; E2E G3 klik ganda di browser) |
| Catatan internal tidak pernah terkirim (perilaku + jaminan struktural + append-only DB) | **Terbukti simulasi** (M18 terdeteksi) |
| Balasan cepat per channel/tim, variabel aman `{nama}` `{channel}`, teraudit, tetap melewati jendela | **Terbukti simulasi** |
| Mesin status AI atomik berversi; aksi ambil alih/matikan/aktifkan; batas aktivasi; kelayakan pesan | **Terbukti simulasi** (CCP 3.3/3.4; M02–M04, M12 terdeteksi) |
| Benturan AI–admin (job sudah ke Meta tampil "sedang dikirim / belum pasti"; balapan 6 putaran; `mock.hold`) | **Terbukti simulasi** |
| Echo HP (D-05 **ASUMSI**): baru → AI Off; lama/duplikat/tanpa waktu tidak membalik | **Terbukti simulasi**; **nyata belum diuji** (CCP 3.7) |
| Outbox durable (crash/lease/backoff/failed/idempoten) | **Terbukti simulasi** (menutup T2-F15 untuk simulasi) |
| Kill switch 4 tingkat; < 1 menit; tidak menyala kembali sendiri; fail-closed; tampil di UI | **Terbukti simulasi** (CCP 3.6; E2E G8; M01, M15, M16, M20 terdeteksi) |
| Flag `ai_simulation` tidak pernah menyala di production (server) | **Terbukti simulasi** (M19 terdeteksi) |
| Pembaruan tampilan (polling 4 dtk, jeda tab tersembunyi, backoff, resync) | **Terbukti simulasi** (E2E: admin lain melihat perubahan tanpa refresh) |
| UI inbox/balasan cepat/kontrol channel; tangkapan layar desktop & ponsel | **Dibuat, terbukti simulasi** (Chromium saja) |
| AI sungguhan, Kartu Program, label, pipeline, template & follow-up, grup WhatsApp, broadcast | **Di luar lingkup** (Tahap 4–6; D-01) |
| **Semua uji nyata** (Meta, nomor uji, echo nyata, status provider nyata) | **Belum dapat diuji** (lihat §4.3) |

## 4. Hasil pengujian (perintah → hasil aktual)
Seluruhnya dijalankan di sandbox pembangun dengan `bash scripts/verify-all.sh` (bukti `.verify/`, tidak di-commit) pada pohon kerja identik dengan commit `ecf3bec` ditambah baseline/dokumen.

### 4.1 Otomatis / SIMULASI (mock Graph API lokal + fixture sintetis)
| Perintah | Hasil aktual |
|---|---|
| `npm run lint` · `npm run typecheck` | 0 error, 0 peringatan |
| `npm run guard:operational` · `npm run scan:secrets` | lulus (295 berkas, 0 temuan) |
| `gitleaks detect` v8.24.3 (ber-pin, checksum diverifikasi) seluruh riwayat | **no leaks found** (13 commit) — dijalankan manual setelah `install-gitleaks.sh`; pada run `verify-all` awal langkah ini tercatat *TIDAK DAPAT DIJALANKAN* (biner belum di PATH), **bukan** lulus |
| `npm audit --omit=dev` | found 0 vulnerabilities |
| `npm run build` | sukses; `/inbox`, `/balasan-cepat` terdaftar |
| `npm run test:report` (Vitest 5.1.1, exit code diteruskan) | **23 berkas, 368 test, 0 gagal, 0 dilewati** (109 dtk) |
| `npm run e2e` (server produksi hasil build + mock Graph + browser Chromium) | **16 spesifikasi: 9 lulus, 7 placeholder resmi "BELUM TERSEDIA"** (61 dtk) |
| `node scripts/test-tag-report.mjs --require-e2e` | `@tahap-1` 146+3, `@tahap-2` 138+3, `@tahap-3` 84+3; baseline 146/3, 138/3, 84/3; tidak ada masalah |
| `bash scripts/backup-restore-drill.sh` | lulus: 33 tabel/38 baris identik setelah restore, 6 migrasi, audit tetap append-only (42501), 10 trigger terpulihkan |
| Uji mutasi (20 mutan; `scratchpad/mutate.py`, tidak di-commit) | **20/20 terdeteksi** (≥ 1 test gagal). Tiga hasil awal dikoreksi (lihat §9.B) |
| Pemeriksaan visual (Playwright, tangkapan layar) | Desktop 1440 px & 1920 px; ponsel 390 px: **0 px overflow horizontal** |

**Rincian `@tahap-3` (Vitest 84):** `tahap3-inbox` 11 · `tahap3-routing-reply` 19 · `tahap3-ai-state` 19 · `tahap3-killswitch-outbox` 12 · `tahap3-units` 23. **E2E 3:** G3, G5 (aktivasi), G8 (`tests/e2e/g3.spec.ts`).

### 4.2 NYATA (Meta asli / nomor uji)
**Tidak ada.** Tidak ada satu pun panggilan ke Meta nyata; endpoint Graph selalu mock lokal (`tests/e2e/mock-graph-server.ts`, `tests/helpers/mock-graph.ts`). Karena itu seluruh hasil di laporan ini berstatus **simulasi**.

### 4.3 Belum dapat diuji (dan mengapa)
| Hal | Penghalang |
|---|---|
| Balas dari inbox lewat nomor uji, status provider nyata, echo HP nyata (CCP 3.7), G3/G8 **NYATA** | Akses Meta milik TE One, nomor uji (D-03), staging HTTPS belum ada (A1–A5, A7 pemilik) |
| Perilaku coexistence nyata (urutan/waktu echo) — dasar D-05 | Belum terbukti; asumsi |
| Browser/perangkat selain Chromium, aksesibilitas formal | Hanya Chromium di sandbox |
| Beban nyata ±10 pengguna di server | Belum ada staging |

## 5. Hasil CCP Tahap 3 (GATE-CHECKLIST bagian C — Gate 3)
*Hasil pembangun, bukan keputusan gate. Semua "Terpenuhi (simulasi)" — Gate 3 tidak dapat menerima penuh tanpa uji nyata.*

| CCP | Batas kritis | Hasil | Bukti |
|---|---|---|---|
| 3.1 Visibilitas per channel (daftar, pencarian, filter, jumlah, realtime, media, panel lintas channel) | 0 kebocoran | **Terpenuhi (simulasi)** | `tahap3-inbox` (daftar/total/navigasi; pencarian & LIKE/injeksi; panel lintas channel menghormati izin; media; umpan perubahan; kill switch di umpan hanya cakupan terlihat) · `tahap3-ai-state` (umpan tidak membocorkan akses yang dicabut) · E2E G3 (admin Hotline 404/inbox kosong) · mutasi M08 |
| 3.2 Akses percakapan dialihkan | Hanya percakapan itu, bukan seluruh channel | **Terpenuhi (simulasi)** | `tahap3-routing-reply` "pengalihan antartim" (4 test: 404 untuk percakapan lain, deny menang, pencabutan, tim nonaktif, anggota tanpa izin) · M09, M10 |
| 3.3 Ambil alih atomik | 0 job AI simulasi terkirim setelah ambil alih | **Terpenuhi (simulasi)** | `tahap3-ai-state`: balapan 6 putaran (XOR: pesan AI terkirim **atau** job dibatalkan; tak pernah keduanya), job sudah ke Meta tampil jujur · M02, M03, M12 |
| 3.4 Aktivasi ulang AI | 0 pesan lama/history/duplikat/terlambat layak | **Terpenuhi (simulasi)** | `tahap3-units` (13 kasus kelayakan, batas eksklusif) · `tahap3-ai-state` (duplikat, terlambat, history, pesan baru setelah batas; lapis kedua di titik komit) · E2E G5 · M04 |
| 3.5 Kirim manual | 0 duplikat dari klik ganda | **Terpenuhi (simulasi)** | `tahap3-routing-reply`: 12 permintaan serentak, kunci sama → 1 pesan/1 panggilan Meta/1 transisi AI; E2E G3 `dblclick` → 1 panggilan · M05–M07 |
| 3.6 Kill switch per chat/channel/fitur/global | Berhenti < 1 menit; tidak menyala sendiri | **Terpenuhi (simulasi)** | `tahap3-killswitch-outbox` (4 tingkat; `updated_at` job − waktu aktif < 60 dtk; pemeliharaan tidak melepas; struktural tanpa timer; fail-closed; `preSend`) · E2E G8 · M01, M15, M16, M20 |
| 3.7 Echo dari HP | Sesuai D-05; event lama tidak membalik status terbaru | **Terpenuhi (simulasi)**; **nyata belum** | `tahap3-ai-state` "echo HP" (baru, duplikat, lama, tanpa waktu; tidak membuka jendela/unread) · M13 |

## 6. Regresi tahap-tahap sebelumnya
| | Sebelum Tahap 3 | Sesudah Tahap 3 |
|---|---|---|
| Vitest total | 284 (146 `@tahap-1` + 138 `@tahap-2`) | **368** (146 + 138 + **84** `@tahap-3`) |
| E2E aktif | 6 (3 G1 + 3 G2) | **9** (+3 `@tahap-3`); placeholder 7 → 7 |
| `@tahap-1` | 146 + 3 | **146 + 3 — tidak ada yang hilang/di-skip** |
| `@tahap-2` | 138 + 3 | **138 + 3 — tidak ada yang hilang/di-skip** |

**Perubahan pada test lama (transparansi, AGENTS §10.2 — tidak dihapus/di-skip; ADR-0007 §5):**
1. `architecture.test.ts` "modul tahap berikutnya belum ada": `inbox` tidak lagi dilarang; larangan `ai-agents|pipelines|follow-up|program-cards|knowledge|labels|templates` tetap.
2. `tahap2-units.test.ts` "hook hanya dari cabang `message`": jaminan sama dipindah ke mekanisme outbox (`enqueueCustomerMessage` hanya di cabang `message`; `emitCustomerMessage` tidak dipakai produksi; echo/history tidak pernah menulis event).
3. `tahap2-units.test.ts` "tidak membawa konektor tidak resmi, dan belum membangun…": hanya larangan `/inbox/` dicabut; konektor tidak resmi tetap dilarang.
4. `tahap2-migration-retention.test.ts`: daftar/hitungan migrasi 4 → 6 (0004–0005), audit tetap 3 pada snapshot.
5. `tests/helpers/db.ts` (`resetDb`) kini ikut mengosongkan `domain_outbox`, `quick_replies`, `automation_jobs`.
6. `golden-placeholders.spec.ts`: G3 & G8 kini ada versi simulasi nyata; placeholder berganti nama menjadi versi **NYATA**; G5 dipecah (aktivasi = simulasi nyata; jawaban AI sungguhan = placeholder Tahap 4). Tetap 7 placeholder.
Golden E2E **G1–G3, G5 (aktivasi), G8 berjalan** (G1/G2 tidak diubah; flag Tahap 3 dinyalakan hanya di dalam spec G3 agar G1/G2 tetap memeriksa "fitur mati").

## 7. Perubahan database dan migrasi
- **`0004_tahap3_inbox_schema`** (additive): tabel `conversation_reads`, `conversation_team_access`, `conversation_notes`, `quick_replies`, `conversation_ai_events`, `automation_jobs`, `domain_outbox`; kolom baru `channels.default_team_id`; `conversations` (`team_id`, `assignee_id`, `assign_version`, `ai_status`, `ai_off_reason`, `ai_version`, `ai_boundary_at`, `ai_changed_at/by`, `escalated_at`, `stray_lead`, `review_flag`, `change_at`); `messages.unread_eligible`; sumber pesan `ai`; CHECK status AI/alasan; indeks daftar/tim/PIC/perubahan; indeks unik akses tim aktif dan `(kind, trigger_message_id)`.
- **`0005_tahap3_triggers_integrity`** (kustom): trigger `change_at` (umpan perubahan), trigger append-only `conversation_ai_events` dan `conversation_notes`.
- `db/grants.sql`: REVOKE UPDATE/DELETE/TRUNCATE pada dua tabel append-only (dibungkus `to_regclass` agar tetap berjalan pada snapshot lama).
- Forward-only; diuji pada DB kosong dan snapshot data Tahap 1 (`tahap2-migration-retention`), idempoten saat diulang; drill backup/restore memulihkan 6 migrasi.
- Izin baru: `chat.assign`, `chat.note`, `killswitch.channel`; `chat.view/reply`, `ai.toggle`, `chat.transfer`, `quickreply.manage` kini tersedia. Flag baru: `ai_simulation` (default mati, tak pernah di production). Env baru: `AI_SIM_DELAY_MS` (default 0).

## 8. Kondisi environment
| Lingkungan | Kondisi |
|---|---|
| Development (sandbox) | Semua pengujian §4.1; Meta = mock lokal; flag `inbox`/`ai_simulation` mati secara bawaan |
| CI GitHub Actions | Alur tidak diubah selain E2E kini memulai mock Graph (port 3101/3102) lewat `playwright.config.ts`; tidak butuh rahasia Meta. **Hasil run pada commit final: dicatat di §8.1 setelah selesai** |
| Staging | **Belum ada** (J0-03) |
| Production | Tidak ada; tidak ada konektor Meta nyata terpasang; `ai_simulation` tidak dapat menyala |

### 8.1 CI pada commit final
| Run | Commit | Hasil |
|---|---|---|
| #12 | `ecf3bec` | *cancelled* — digantikan push berikutnya (konkurensi CI); bukan kegagalan |
| #13 | `e4c7245` | **Lint · Typecheck · Guard · Secret scan (gitleaks): sukses** · **Build · Test regresi · E2E: sukses** · **Drill backup & restore: GAGAL** — `GAGAL: berkas rusak tidak ditolak oleh checksum (rc=0)` |
| [#14](https://github.com/fawwazchaidir-bit/chat-TEOne/actions/runs/44903089018) | `c3a29b1` (perbaikan drill; kode aplikasi sama dengan `e4c7245`) | **Hijau penuh — 3 job sukses:** Lint · Typecheck · Guard · Secret scan (termasuk gitleaks seluruh riwayat); Build · Test regresi (migrasi pada DB kosong) · Golden E2E · penjaga baseline; **Drill backup & restore nyata** (lulus setelah perbaikan) |

Kegagalan #13 **bukan** disebabkan kode Tahap 3 (drill lulus di lokal 4×; langkah lain hijau). Penyebabnya kelemahan laten skrip drill sejak Tahap 1 — lihat **T3-F14** (§9.B). Hasil `e4c7245` tidak boleh disebut "CI hijau penuh"; bukti CI hijau penuh untuk Tahap 3 adalah run #14 pada `c3a29b1`. Ini bukti CI untuk **kode simulasi**, bukan bukti Meta nyata. Run harus diulang pada commit yang diaudit.

## 9. Temuan
### A. Temuan terbuka / risiko (juga di `docs/temuan-dan-risiko.md`)
| ID | Prio | Temuan / risiko | Dampak | Bukti | Tindakan | PJ | Status |
|---|---|---|---|---|---|---|---|
| T3-F01 | **tinggi** | **Belum lulus untuk integrasi langsung**: seluruh bukti = simulasi; Gate 2 belum diterima (A07). Dikerjakan atas instruksi eksplisit pemilik | Gate 3 tidak dapat diterima penuh | §4.2–4.3 | Uji nyata dengan nomor uji (daftar tindakan pemilik F5) | Pemilik | Terbuka |
| T3-F02 | sedang | D-05, D-16, D-22 masih Terbuka → **ASUMSI**; perilaku echo nyata belum terbukti | Bila keputusan berbeda, ubah di titik terdokumentasi | ADR-0007/0008 | Putuskan (F1) | Pemilik | Terbuka |
| T3-F03 | sedang | Polling 4 dtk, bukan realtime | Latensi ≤ ~4 dtk; skala > ±100 perlu SSE | ADR-0009 | Pantau | Pembangun | Diterima |
| T3-F04 | sedang | Pesan pelanggan terbukti-waktu tetapi > 10 mnt (ASUMSI) tidak diproses otomatisasi **dan tidak ditandai** | Pelanggan dengan webhook tertunda tidak dijawab AI tanpa tanda | `events.ts` | Putuskan di Tahap 4 (F3) | Pemilik/Pembangun | Terbuka |
| T3-F05 | rendah | Nama tim tujuan pengalihan terlihat oleh pengguna berizin transfer/assign | Struktur organisasi | `tim-antrian-routing.md` | Diterima | — | Diterima |
| T3-F06 | rendah | UI memuat 100 pesan terbaru; belum ada gulir-mundur | Riwayat panjang | `inbox-app.tsx` | Tambah bila diminta UAT | Pembangun | Terbuka |
| T3-F07 | rendah | Tak ada pembersih retensi untuk tabel baru (outbox, job, event AI, catatan, pembaca) | Data menumpuk; PDP | D-18 | Tambah ke job retensi | Pembangun/Pemilik | Terbuka |
| T3-F08 | rendah | Belum dibaca dihitung per baris (subkueri) | Performa skala besar | `list.ts` | Ukur di staging | Pembangun | Terbuka |
| T3-F09 | rendah | Cache id channel ≤ 2 dtk; izin tetap per permintaan | Penundaan kecil | `access.ts` | Diterima | — | Diterima |
| T3-F10 | rendah | Hanya Chromium; tanpa audit aksesibilitas formal | Kompatibilitas belum terbukti | `g3.spec.ts` | UAT multi-perangkat | Pembangun | Terbuka |
| T3-F11 | sedang | Pesan AI yang sudah ke Meta tidak dapat ditarik; "belum pasti" tak pernah dikirim ulang | Pelanggan dapat menerima balasan AI setelah pengambilalihan bila job menang kunci lebih dulu | `alur-ai-admin.md` | Didokumentasikan; UI jujur | — | Diterima |
| T3-F12 | rendah | `ai_simulation` mengirim teks `[SIMULASI]` bila menyala di non-production | Salah nyala di staging | `feature-flags/index.ts` | Matikan di staging berkontak nyata (F4) | Operasi | Dikendalikan |
| T3-F13 | — | **T2-F15 teratasi** (outbox durable; at-least-once + idempoten) | — | ADR-0008 | — | — | **Teratasi (simulasi)** |
| T2-F18 | rendah | Tes flaky di CI (akar masalah belum ditemukan; dimitigasi, dipantau) — **di luar Tahap 3** | CI sesekali merah | riwayat CI | Pantau | Pembangun | Terbuka |

### B. Ditemukan dan diperbaiki selama Tahap 3 (transparansi)
| Temuan | Ditemukan oleh | Perbaikan |
|---|---|---|
| Variabel balasan cepat huruf besar (`{NAMA}`) lolos validasi → terkirim apa adanya ke pelanggan | Tes unit | Semua token `{...}` selain `{nama}`/`{channel}` ditolak |
| **Spanduk kill switch tidak tampil** bila tidak ada percakapan yang berubah (kill switch menyala sendirian) | **E2E G8 di browser** (tidak terlihat oleh tes integrasi) | Umpan perubahan membawa kill switch yang berlaku (hanya cakupan terlihat); tes integrasi ditambah |
| Pemeriksaan kelayakan di titik komit (lapis kedua) tidak teruji | Uji mutasi M04 | Test baru (pesan berubah menjadi history/tanpa waktu/sebelum batas setelah job dibuat) |
| Mutasi M12 awal tidak valid (ReferenceError → deteksi palsu) dan M18 salah sasaran | Penilaian hasil mutasi | Diulang dengan mutasi valid/tes yang benar → terdeteksi |
| Tata letak 4 kolom menyisakan ±240 px untuk percakapan di laptop; `scrollIntoView` dapat menggeser halaman | Tangkapan layar | Navigasi horizontal ≤ 1500 px; gulir kontainer; layar sempit menggulir ke percakapan |
| Halaman `/belum-tersedia/inbox` mengaku "belum dibuat" saat flag menyala; label kill switch masih "Tahap 1" | Tinjauan | Dialihkan ke `/inbox` bila flag menyala; label diperbarui |
| Penjaga struktural lama melarang `inbox`; asumsi "audit_log di-reset" salah | Regresi | Disesuaikan sempit (§6); filter asersi per objek |
| **T3-F14 — Uji "berkas rusak" pada drill backup bisa merah palsu (peluang 1/256 per run)**: langkah menimpa byte ke-100 dengan konstanta `X`; ciphertext gpg acak, jadi bila byte aslinya sudah `X` berkas tidak berubah → restore lolos → `rc=0` | **CI run #13** (log job drill) — mekanisme dibuktikan secara deterministik; bahwa byte itu `X` pada run tersebut tidak dapat dibuktikan dari log, tetapi tidak ada penjelasan lain untuk `rc=0` pada kode yang ada | Perusakan kini membalik semua bit byte itu (XOR 0xFF) **dan** drill gagal bila berkas tidak berubah; diuji pada nilai tepi (0, 88, 255, …) dan 4× run lokal lulus. **Terverifikasi:** drill hijau pada CI run #14 |

## 10. Asumsi yang dipakai (rujuk `docs/decisions.md`)
- **ASUMSI (D-05):** pesan keluar baru dari HP → AI Off pada chat itu; echo lama/duplikat/tanpa waktu tidak membalik.
- **ASUMSI (D-16):** belum dibaca **per pengguna**.
- **ASUMSI (D-22):** lead nyasar dialihkan di percakapan yang sama; akses tim tujuan terbatas pada percakapan itu.
- **ASUMSI (teknis):** `AUTOMATION_MAX_AGE_MS` = 10 menit; toleransi jam +5 menit; polling 4 dtk (+ overlap 2 dtk); lease outbox 60 dtk, 5 percobaan, backoff maks. 300 dtk; lease job 2 menit, 3 percobaan; maks. 100 baris per muat ulang.
- **ASUMSI (D-18):** belum ada retensi untuk tabel baru.
Seluruhnya **bukan keputusan final**; kolom keputusan di `decisions.md` tidak diisi pembangun.

## 11. Bukti nomor operasional dan Halo AI tidak diubah
- `git diff c22a48a..HEAD` pada kode/skrip/DB/CI: **0 baris** memuat `…1119` atau `…0124`; `AGENTS.md` tidak berubah; tidak ada referensi "Halo AI" di `src/`, `tests/`, `scripts/`.
- Guard nomor operasional lulus (295 berkas). Seed dan fixture memakai channel **CONTOH** dan nomor sintetis (`1555000…`, ID telepon `2000000000001xx`).
- Tidak ada panggilan ke Meta nyata; `META_GRAPH_BASE_URL` selalu mock lokal. Aplikasi Meta/webhook Halo AI tidak disentuh. Tidak ada WAHA/Baileys/konektor tidak resmi (dijaga test statis).
- Tidak ada rahasia di repository: `scan:secrets` + gitleaks (13 commit) bersih.

## 12. Prasyarat tahap berikutnya (Tahap 4 — AI agent)
1. Keputusan **Gate 2** dan **Gate 3** tercatat di `docs/gates/` (audit independen di sesi terpisah — pembangun tidak mengaudit pekerjaannya sendiri).
2. Keputusan **D-05, D-16, D-22**, dan penanganan pesan terlambat (**T3-F04**).
3. Uji nyata Tahap 2–3 dengan nomor uji (D-02/D-03, akses Meta, staging) — tanpa itu semua hasil tetap simulasi.
4. Keputusan Tahap 4: **D-21** (ambang set uji AI), D-09 (batas biaya), pilihan provider AI (rahasia lewat secret store, tidak ke repository).
5. Tahap 4 memakai **pipeline otomatisasi yang sama** (ADR-0008); kontrak inti #4, #6, #7 dibekukan hanya setelah Gate 3 diterima.
