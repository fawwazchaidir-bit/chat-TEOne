# Pemrosesan inline vs worker: apa yang dijadwalkan dan apa yang tidak (analisis kode, 26 Nov 2026)

> **Hanya analisis kode dan dokumen.** Pembangun **tidak** menyalakan worker, mengubah subscription, menghapus payload, atau mengganti image, dan **tidak mengubah kode**. Semua langkah di §6–§7 menunggu **peninjauan dan keputusan tertulis pemilik** (formulir kosong di [`prosedur-uji-m11-m12.md`](prosedur-uji-m11-m12.md) §10, baris **A-4**).
> Label sumber: **[OP]** laporan operator (belum dapat diperiksa pembangun) · **[KODE]** dibaca langsung di repository (`berkas:baris`) · **[TES]** nama tes, terbukti **simulasi** (bukan Meta) · **[BELUM DIUJI]**.

## 1. Laporan operator yang dijawab dokumen ini **[OP]**
- Di proyek Compose `deploy` **tidak ada container worker terpisah**, termasuk yang berhenti. `deploy-app-1` ber-`WORKER_INLINE=true`.
- Database saat dikueri: **5** event `message` *processed*, **6** event `status` *processed*, **2** event `message` *quarantined*; **tidak ada** `pending`/`processing`/`failed`.
- Satu karantina = `pengirim_di_luar_daftar_uji` **dengan payload kosong**. Kelima event pesan dan keenam event status yang diproses (kueri sebelumnya) **masih memiliki payload**; isinya **tidak dibuka**.
- **Belum dilaporkan:** alasan karantina **kedua** dan apakah payload-nya kosong (lihat kueri A §5).

## 2. Revisi S-08 (menggantikan butir S-08 sebelumnya)
| | Isi |
|---|---|
| **S-08 lama** | "Worker tidak ikut dibuat ulang → kemungkinan membawa token lama." |
| **Status baru** | **Tidak terbukti dan tidak berlaku sebagai ditulis.** Tidak ada container worker di proyek `deploy` **[OP]**; tidak ada proses yang dapat membawa token lama. Dugaan dicabut. |
| **Kesalahan saya yang dikoreksi** | Saya menulis bahwa worker memakai token Meta "untuk unduh media **dan rekonsiliasi**". **Rekonsiliasi tidak memanggil Meta**: `reconcileUncertain` hanya membaca `messages` dan `message_status_events` di database dan menautkan lewat kunci `opaque` (`reconcile.ts:34–51`) **[KODE]**. Token dipakai worker hanya oleh `retryPendingMedia` (info + unduh media lewat Graph, `media.ts:113`) dan `runDueAutomationJobs` (kirim simulasi bila `ai_simulation` menyala, `jobs.ts:104`). |
| **Pengganti** | **S-10** (di bawah): masalah sebenarnya bukan "worker lama", melainkan **tidak adanya penjadwal pemeliharaan sama sekali** pada penyebaran inline-saja. |

## 3. Peta penjadwalan: apa berjalan, apa tidak (WORKER_INLINE=true, tanpa worker)

| # | Fungsi | Pemicu di kode | Inline saja | Dengan worker | Bukti tes (simulasi) |
|---|---|---|---|---|---|
| 1 | Memproses event masuk (pesan, status, echo, history) | `processInboundBatch` dipanggil `kickProcessing()` setelah webhook sah disimpan (`route.ts:39`, hingga 10 batch, `worker.ts:46–58`) dan setelah `retryEvent` (`tool.ts:75`). Worker: loop terus-menerus (`scripts/worker.ts:16–19`) | **Berjalan, berbasis kejadian** — tidak ada timer | Kontinu (tidur 1 dtk bila kosong) | `tahap2-channels-worker.test.ts` (klaim paralel/lease/backoff) memanggil fungsi langsung; **E2E G2/G3** menjalankan `next start` **tanpa worker** (`WORKER_INLINE` bawaan `true`) lalu memeriksa pesan tampil di UI → **jalur inline teruji E2E (SIMULASI)**. **Staging [OP]:** 5+6 event *processed* |
| 2 | **Percobaan ulang** event gagal (backoff `30 dtk × 2^(n−1)`, maks 3600 dtk; `MAX_ATTEMPTS=5` → `failed`) dan **pemulihan lease** event `processing` yang kedaluwarsa | Hanya lewat `claimBatch` (`inbound-store.ts:54`) yang hanya dipanggil `processInboundBatch` | **Hanya saat kick berikutnya** (webhook sah berikutnya atau `retryEvent`). Event `pending` ber-`run_after` masa depan **menunggu** sampai ada kick; **tidak ada pemicu waktu** | Dipicu loop ≤ 1 dtk | `tahap2-channels-worker.test.ts:86` (restart: diambil ulang setelah lease), `:101` (dua worker paralel, 80 event, tanpa duplikat), `:111` (backoff → `failed`, error = kode) |
| 3 | Unduh media, **percobaan pertama** | Job pasca-commit di `processInboundBatch` (`ingest.ts:146` → `fetchInboundMedia`) | Berjalan | Berjalan | `tahap2-messages.test.ts` (media) |
| 4 | **Ulang unduh media** `menunggu` (maks 3 = `MAX_MEDIA_ATTEMPTS`) | `retryPendingMedia` ← `runMaintenance` (`worker.ts:64`). **Tidak ada pemanggil lain** | **TIDAK berjalan** | ≈ tiap 60 dtk (`scripts/worker.ts:25–33`) | `tahap2-messages.test.ts:~115` ("gangguan sementara → menunggu lalu diulang maks 3×") memanggil `runMaintenance()` **langsung** |
| 5 | **Retensi payload** (30 hari = **ASUMSI D-18**, `inbound-store.ts:16`) | `purgeRawPayloads` ← `runMaintenance` (`worker.ts:62`). **Tidak ada pemanggil lain** | **TIDAK berjalan** | ≈ tiap 60 dtk | `tahap2-migration-retention.test.ts:~119` (payload > 30 hari di-NULL-kan; `pending` dan yang baru tidak; pesan utuh; idempoten) |
| 5b | Payload **dibuang saat karantina** | `markQuarantined(..., dropPayload: !keepPayload)` (`worker.ts:25`) — bagian pemrosesan event | **Berjalan** (terbukti di staging: payload kosong **[OP]**) | Berjalan | E2E G2 (pengirim asing tidak tampil); `tahap2-webhook`/`tahap2-gate2` |
| 6 | `diproses` tertahan → `belum_pasti` (`proses_terhenti`; ambang `max(120 dtk, 4×timeout)`) | `expireStaleProcessing` ← `reconcileUncertain` ← `runMaintenance` | **TIDAK berjalan** | Ya | `tahap2-gate2.test.ts:449–500` (crash sebelum/sesudah Meta; dua pekerja bersamaan → tepat sekali; teraudit; 0 panggilan Meta) |
| 7 | **Rekonsiliasi `belum_pasti`** (tautkan lewat kunci `opaque`; **DB saja, tanpa Meta, tanpa kirim ulang**) | `reconcileUncertain` ← `runMaintenance` | **Tidak otomatis.** **Penyelesaian manual tetap tersedia** (`resolveUncertainManually`, izin `integration.test`, wajib catatan, teraudit; `reconcile.ts:53–64`) | Ya | `tahap2-send.test.ts:231–238` |
| 8 | **Kirim ulang outbox** (durabilitas T2-F15) | Dua jalur: (a) setelah commit untuk pesan yang layak otomatisasi (`ingest.ts:149–151`); (b) **fallback** `dispatchOutbox` ← `runMaintenance` | Hanya (a). **Fallback (b) tidak ada**: bila proses mati di antara commit dan dispatch, baris `outbox` menunggu sampai ada pesan layak berikutnya | Ya | `tahap3-killswitch-outbox.test.ts:254` (proses mati setelah commit → pemeliharaan memulihkan, tepat satu balasan), `:271` (backoff → `failed` terlihat) |
| 9 | Job otomatisasi jatuh tempo | `runDueAutomationJobs` ← `runMaintenance` | **TIDAK berjalan** | Ya | `tahap3-ai-state.test.ts:~114–171` |

**Status penjadwalnya sendiri:** `scripts/worker.ts` (loop, interval pemeliharaan 60 dtk, shutdown SIGTERM) **tidak dijalankan oleh tes, E2E, maupun CI** — hanya `package.json` dan `docker-compose.staging.yml` yang merujuknya (hasil pencarian repo). Semua tes memanggil `processInboundBatch`/`runMaintenance` **langsung** dan memakai `WORKER_INLINE=false` (`tests/test-env.ts:31`). Jadi: **fungsi pemeliharaan = terbukti simulasi; penjadwal worker = "Dibuat, belum diuji" (AGENTS.md §4)**; mode inline untuk pemrosesan event = terbukti simulasi lewat E2E, **pemeliharaan inline = tidak ada**.

## 4. Temuan **S-10** (baru): pemeliharaan hanya hidup di worker
| Hal | Isi |
|---|---|
| **Temuan** | Pada penyebaran **inline saja**, **retensi payload, penyapu `diproses` tertahan, rekonsiliasi `belum_pasti` otomatis, ulang media, fallback outbox, dan job otomatisasi tidak pernah berjalan**. `kickProcessing()` hanya memproses antrean event dan hanya saat ada kejadian. Tidak ada `setInterval`, cron, atau `instrumentation` di sisi server (pencarian repo) **[KODE]**. |
| **Mengapa tak terlihat** | Dokumen menyiratkan inline cukup: `konfigurasi-staging.md` ("worker terpisah tetap aman"), komentar `worker.ts:3` ("agar penyebaran satu-kontainer tetap berjalan"), `.env.example` (`WORKER_INLINE=true`). **Tidak ada** dokumen yang menyebut bahwa pemeliharaan hanya hidup di worker (gap dokumentasi). `scripts/worker.ts:2` dan komentar menyebut worker "disarankan" di staging/production tanpa konsekuensinya. Compose staging mendefinisikan `worker`, tetapi tidak ada yang memastikan ia dijalankan. |
| **Prioritas** | **Sedang** untuk staging uji saat ini (flag `inbox`/`ai_simulation` mati, volume kecil, semua event < 2 hari); **tinggi sebelum** pesan pelanggan nyata/otomatisasi dihubungkan atau retensi diklaim ditegakkan. |
| **Dampak sekarang (staging, flag mati)** | **Retensi:** payload event *processed* **tidak akan pernah di-NULL-kan** selama tidak ada worker (ambang 30 hari baru jatuh tempo ±25 Des 2026 untuk event 25 Nov; **tidak mendesak, tetapi D-18 tidak ditegakkan**). **Percobaan ulang event:** tidak ada yang `pending/failed` sekarang **[OP]**; satu kegagalan sementara kelak akan **menunggu webhook berikutnya**. **Rekonsiliasi:** dampak tergantung ada/tidaknya pesan keluar `diproses`/`belum_pasti` (kueri B). **Media:** percobaan pertama jalan; ulang tidak (kueri C). **Outbox/job:** tidak berdampak (flag mati; subscriber tidak berbuat apa-apa). |
| **Bukan** | Bukan kebocoran data dan bukan risiko kirim otomatis: guard kirim dan kill switch tidak bergantung pada worker. Ini **penurunan kemampuan pemulihan dan penegakan retensi**, bukan penambahan paparan. |

## 5. Pertanyaan baca-saja ke operator (hasilnya berupa angka/kode, **tanpa isi pesan**)
Jalankan sebagai peran baca di DB staging; catat `SELECT now()` agar jamnya terukur. **Tidak ada perubahan data.**
```sql
SELECT now() AS jam_server_utc;
-- A. Event masuk (termasuk alasan karantina KEDUA dan apakah payload-nya kosong; TANPA membuka payload)
SELECT status, kind, quarantine_reason, count(*) AS n,
       count(*) FILTER (WHERE payload IS NOT NULL) AS dengan_payload, min(received_at) AS tertua
FROM inbound_events GROUP BY 1,2,3 ORDER BY 1,2,3;
-- B. Pesan keluar yang bisa membutuhkan penyapu/rekonsiliasi
SELECT status, count(*) FROM messages WHERE direction = 'keluar' GROUP BY 1 ORDER BY 1;
-- C. Media
SELECT status, count(*) FROM media GROUP BY 1 ORDER BY 1;
-- D. Outbox dan job
SELECT status, count(*) FROM domain_outbox GROUP BY 1 ORDER BY 1;
SELECT status, count(*) FROM automation_jobs GROUP BY 1 ORDER BY 1;
```
Dan (baca-saja, tanpa Env): `sudo docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -E 'teone-(app|tools)'` — apakah image **`teone-tools`** ada (compose `worker` memakainya).

## 6. Opsi (tidak ada yang dijalankan) **[TUNGGU KEPUTUSAN A-4]**
| Opsi | Isi | Perubahan | Catatan |
|---|---|---|---|
| **W0** | Biarkan inline saja untuk uji jangka pendek | Tidak ada | Aman untuk uji terbatas bertanda "pemeliharaan tidak aktif"; **retensi tidak ditegakkan**; **tidak** layak untuk pesan pelanggan nyata |
| **W1** | **Jalankan worker terpisah** (`docker compose … up -d worker`) | Operasional saja, **tanpa kode baru**, tanpa mengganti image `app` | **Direkomendasikan** untuk staging bila A-4 disetujui. Detail dampak §7 |
| **W2** | Ubah kode: penjadwal pemeliharaan di proses web bila `WORKER_INLINE=true` (usulan **R-4**) | Kode baru + tes + audit | Menjadikan satu-kontainer lengkap. Rancangan: pemicu berbatas laju (≥ 60 dtk) yang memanggil `runMaintenance`, timer `unref`, aman multi-proses (fungsi sudah `SKIP LOCKED`/lease/UPDATE bersyarat). **Belum dikerjakan; butuh persetujuan lingkup** |
| **W3** | Tampilkan **"Pemeliharaan terakhir berjalan: …/belum pernah"** di alat uji integrasi dan `meta:check` (usulan **R-5**) | Kode kecil + tes | Kejujuran status (AGENTS.md §3.7): tidak menampilkan "aktif" tanpa bukti. Dapat digabung dengan W1/W2 |
| **R-6** | **Smoke test penjadwal**: job CI menjalankan `scripts/worker.ts` dari image `tools` terhadap Postgres CI selama 1 siklus lalu menghentikannya | Perubahan CI | Menutup "dibuat, belum diuji" untuk penjadwal. Usulan; belum dikerjakan |

## 7. Prosedur dan dampak W1 (jalankan worker) — **hanya setelah A-4 tertulis**
**Prasyarat:** hasil kueri §5 ditinjau; image `teone-tools:<tag>` ada di server (bila tidak, `up -d worker` akan mencoba menarik image yang tidak ada dan **gagal**; membangunnya = bagian A-1, bukan langkah ini); titik pemulihan 5.1 prosedur sudah dibuat (backup DB + media, checksum).
**Langkah:** `sudo docker compose -p deploy $F up -d --no-deps worker` (hanya `worker`; **jangan** `--force-recreate app`). Amati log: `[worker] mulai`; baris `[worker] pemeliharaan: …` hanya tercetak bila ada pekerjaan; tidak boleh ada `[worker] fatal`.
**Apa yang terjadi pada siklus pertama `runMaintenance` pada data sekarang** (urutan `worker.ts:62–68`):
| Tugas | Efek pada keadaan sekarang | Dapat dibalik? |
|---|---|---|
| `purgeRawPayloads` | `UPDATE … WHERE received_at < now() − 30 hari` → **0 baris** (semua event < 2 hari). **Payload tidak dihapus.** | — |
| `expireStaleProcessing` | Pesan keluar `diproses` tanpa ID provider lewat ambang → `belum_pasti` + audit. Jumlah = hasil kueri B (kemungkinan 0) | Tidak (audit append-only), tetapi **benar** dan dapat diselesaikan manual |
| `reconcileUncertain` | `belum_pasti` yang punya status webhook ber-`opaque` ditautkan → `diterima_api` + audit. **Tanpa Meta, tanpa kirim ulang** | Tidak (benar secara data) |
| `retryPendingMedia` | Media `menunggu` > 30 dtk dicoba lagi lewat **Graph nyata** dengan token di env **saat container worker dibuat**. Jumlah = kueri C (kemungkinan 0) | Unduhan tersimpan tidak dibatalkan; berhenti dengan stop worker |
| `dispatchOutbox` | Baris outbox `pending` dikirim ke subscriber; dengan `ai_simulation` **mati** subscriber **tidak berbuat apa-apa** (tes: 0 job, 0 panggilan Graph) | — |
| `runDueAutomationJobs` | Tidak ada job → 0 | — |
**Dampak ke akun Meta:** **tidak ada** (tidak mengubah subscription; hanya panggilan Graph untuk media bila ada). **Dampak data:** hanya penandaan/penautan status di atas; **tidak menghapus apa pun**.
**Cara menghentikan:** `sudo docker compose -p deploy $F stop worker` (event tetap aman di DB; lease mengembalikan klaim). **Pemulihan:** tidak diperlukan untuk data; bila ada tugas yang memberi hasil tak terduga, **hentikan worker**, periksa audit (`sistem:rekonsiliasi`), dan putuskan manual. Koreksi image/volume: lihat prosedur §5.4.
**Bukti yang dicatat (jalur J2, teks):** `docker ps`, 20 baris log pertama worker (tanpa data pribadi), kueri §5 sebelum/sesudah.
**Peringatan:** penjadwal `scripts/worker.ts` **belum teruji sebagai proses** (§3). Siklus pertama di staging adalah **pengujian pertamanya** — jalankan dengan pengamatan, bukan dibiarkan tanpa pengawasan.

## 8. Retensi payload: yang tidak akan terjadi tanpa keputusan
Satu-satunya jalur kode yang meng-NULL-kan payload *processed* adalah `purgeRawPayloads` (≥ 30 hari, jalur worker). **Tidak ada** jalur lain dan **tidak ada** penghapusan dini otomatis. Penghapusan dini sebelum 30 hari **tidak diusulkan** (D-18 belum diputuskan; payload yang masih ada berguna untuk memproses ulang event `failed`). Bila pemilik menginginkannya, itu keputusan D-18 + prosedur terpisah. **11 payload yang ada tetap utuh.**

## 9. Yang tidak dapat diverifikasi pembangun
Kondisi sebenarnya di VPS; mengapa worker tidak pernah dijalankan; ada tidaknya image `teone-tools`; alasan karantina kedua; isi payload; perilaku penjadwal sebagai proses (belum ada tes).
