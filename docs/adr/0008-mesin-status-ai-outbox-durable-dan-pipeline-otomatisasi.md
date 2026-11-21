# ADR-0008 — Mesin status AI, outbox durable, dan pipeline otomatisasi ber-guard (Tahap 3)

- **Status:** Diusulkan · menunggu persetujuan pemilik
- **Tahap:** 3 · mengimplementasikan kontrak inti **#4** (status AI per percakapan), **#6** (pemeriksaan ulang sebelum kirim otomatis), **#7** (kill switch); menutup temuan **T2-F15** (hook dalam memori)
- **Asumsi dipakai:** **D-05** (pesan keluar baru dari HP → AI Off), `AUTOMATION_MAX_AGE_MS` = 10 menit (ASUMSI teknis sejak ADR-0006)

## Konteks
Tahap 3 harus membuktikan bahwa admin dapat mengambil alih dari AI **tanpa benturan**, dan bahwa otomatisasi dapat dihentikan pada empat tingkat — **sebelum** ada AI nyata (Tahap 4). Seluruh pengujian memakai job **AI simulasi** (`ai_sim`) dan mock Meta; tidak ada AI sungguhan dan tidak ada pengiriman nyata.

## Keputusan

### 1. Mesin status AI (`ai-state.ts`)
`conversations`: `ai_status` (`aktif`|`off`), `ai_off_reason` (`admin_mengambil_alih` | `admin_membalas` | `eskalasi` | `balasan_dari_hp` | `kill_switch` | `manual`), `ai_version`, `ai_boundary_at`, `ai_changed_at/by`, `review_flag`. Satu-satunya fungsi pengubah: **`setAiState`** (dijaga test statis).
- **Atomik**: baris percakapan dikunci `FOR UPDATE`; versi naik satu per perubahan nyata; perubahan yang tidak mengubah apa pun **idempoten** (versi dan alasan pertama tidak berubah).
- **Teraudit**: baris `conversation_ai_events` (append-only; trigger menolak UPDATE/DELETE) + `audit_log`. Mencatat versi, aktor, alasan, waktu.
- **Optimistic concurrency** (`expectedVersion`) untuk aksi UI: basi → **409 `AI_VERSION_CONFLICT`** + audit benturan (koneksi terpisah).
- **Aktivasi ulang** hanya manual, satu per satu; mencatat **batas** (`ai_boundary_at = sekarang`). AI **tidak pernah** menyala sendiri (tidak ada kode yang menulis `aktif` selain aksi manusia; diuji).
- Job tertunda milik versi lama **dibatalkan di transaksi yang sama**; pemeriksaan ulang versi tepat sebelum kirim adalah lapis kedua.

### 2. Kelayakan pesan (`eligibility.ts`, fungsi murni)
Layak hanya bila: pesan pelanggan **langsung** (bukan history/echo/keluar), AI Aktif, waktu provider **terbukti** (ada, terbaca, ≤ +5 menit dari jam server), dan waktunya **setelah** batas aktivasi (batas eksklusif). Waktu tak terbukti saat AI Aktif ⇒ **`review_flag = urutan_tidak_pasti`** — tidak diproses, ditandai untuk ditinjau (AGENTS.md §8: ragu → jangan kirim). Duplikat, history, dan event terlambat sebelum batas tidak layak.

### 3. Outbox durable (menutup T2-F15)
Event pesan pelanggan ditulis ke `domain_outbox` **dalam transaksi yang sama** dengan pesannya, lalu dikirim ke subscriber setelah commit (`dispatchOutbox`): **minimal-sekali**, `FOR UPDATE SKIP LOCKED`, lease 60 dtk (proses mati → diambil lagi oleh pemeliharaan), backoff eksponensial (maks. 300 dtk), batas 5 percobaan → `failed` (terlihat). Subscriber **wajib idempoten**: job memakai `UNIQUE(kind, trigger_message_id)`; pesan AI memakai kunci idempotensi `job-<id>`. Event `history`, `echo`, `status`, duplikat **tidak** menulis outbox (kontrak inti #3).

### 4. Pipeline kirim otomatis ber-guard (`automation/jobs.ts`)
**Titik komit** (satu transaksi, percakapan dikunci): kill switch (global · channel · fitur · chat) → AI Aktif → versi sama → kelayakan pesan pemicu → jendela layanan → penerima diizinkan (daftar uji di non-production) → sisipkan pesan keluar `source = 'ai'` status `diproses`. Pengambilalihan admin memakai kunci yang **sama**, sehingga hanya satu yang menang:
- admin lebih dulu → versi berubah → job **dibatalkan**, 0 pesan AI;
- job lebih dulu → pesan tercatat → UI menampilkan **"sedang dikirim / belum pasti"**, tidak dijanjikan dapat dibatalkan.
Lalu `executeSend` memanggil Meta **tepat satu kali** dengan pemeriksaan kill switch **sekali lagi tepat sebelum panggilan** (`preSend`; kategori `kill_switch` ⇒ `gagal` pasti, 0 panggilan Meta). Tidak ada retry buta pada hasil apa pun.

### 5. Kill switch (empat tingkat)
Registri `kill_switches` (Tahap 1) kini dipakai pipeline: **global**, **fitur** (`ai_reply`, `follow_up`, …), **channel** ("Jeda otomatisasi channel", izin `killswitch.channel` bercakupan channel) dan **chat** (= AI Off, atau baris cakupan `chat`). Diperiksa tanpa cache (berlaku pada pemeriksaan berikutnya, jauh < 1 menit), **fail-closed** bila status tak terbaca, **tidak pernah menyala kembali sendiri**: satu-satunya jalur melepas adalah `applyKillSwitch` oleh pengguna berizin (dijaga test statis: tidak ada timer/penjadwal/`engaged: false` di tempat lain). Tampil jelas di UI inbox.

### 6. Echo dari HP (D-05, ASUMSI)
Echo **baru** (bukan duplikat) dengan waktu terbukti dan **setelah batas aktivasi** → AI Off `balasan_dari_hp` (aktor sistem). Echo lama / sebelum batas / tanpa waktu → **tidak** membalik status (teraudit `conversation.echo_ai_ignored`). Echo tidak membuka atau memperpanjang jendela layanan dan tidak menambah belum dibaca.

### 7. Flag `ai_simulation`
Feature flag baru, default **mati**, dan **tidak pernah menyala di production** — ditegakkan di server (`NEVER_IN_PRODUCTION`: `isFeatureEnabled` mengabaikan baris DB; `setFlag` menolak; job dibatalkan `fitur_mati`). `AI_SIM_DELAY_MS` (env, default 0) hanya untuk menguji job tertunda.

## Konsekuensi
- Latensi: otomatisasi jalan inline setelah commit (WORKER_INLINE) atau oleh worker; tidak ada broker eksternal (ADR-0002 tetap).
- Satu kunci baris percakapan per keputusan kirim otomatis/balasan admin — throughput per percakapan terserialisasi (diinginkan).
- Tahap 4 memakai pipeline yang sama (mengganti `payload`/pembuat job), bukan jalur baru.
- Batasan jujur: pesan AI yang sudah dikirim ke Meta tidak dapat ditarik; hasil "belum pasti" tidak pernah dikirim ulang otomatis.
