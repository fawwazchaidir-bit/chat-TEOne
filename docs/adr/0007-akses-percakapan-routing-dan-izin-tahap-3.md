# ADR-0007 — Akses percakapan, routing antar tim, dan izin baru (Tahap 3)

- **Status:** Diusulkan · menunggu persetujuan pemilik (Tahap 3 belum diterima; kontrak inti #1 belum dibekukan untuk perluasan ini)
- **Tahap:** 3 · menyentuh kontrak inti #1 (pemeriksaan izin) **tanpa mengubah artinya**: default menolak, penolakan spesifik pengguna mengalahkan peran, akses percakapan yang dialihkan hanya untuk percakapan itu
- **Asumsi dipakai:** **D-22** (lead nyasar dialihkan di percakapan yang sama), **D-16** (belum dibaca per pengguna) — keduanya masih *Terbuka*; usulan default dipakai dan ditandai ASUMSI

## Konteks
Inbox Tahap 3 menampilkan percakapan lintas channel untuk ±10 admin. Sampai Tahap 2 izin hanya bercakupan **channel**. Tahap 3 membutuhkan dua hal baru: (1) percakapan yang **dialihkan** ke tim lain (D-22) harus dapat dikerjakan tim tujuan **tanpa** membuka seluruh channel milik tim lain, dan (2) daftar, jumlah, pencarian, riwayat lintas channel, media, dan pembaruan tampilan tidak boleh bocor.

## Keputusan

### 1. Satu sumber kebenaran akses: `conversationAccessSql` / `getConversationForAction`
Satu fragmen SQL (`src/modules/conversations-messages/access.ts`) dipakai oleh **semua** jalur baca/tulis: daftar, total, pencarian, filter, navigasi, riwayat lintas channel, media, umpan perubahan, dan aksi. Tidak ada jalur lain yang memutuskan akses percakapan (dijaga test statis).

Aturan (default **menolak**):
1. Pengguna memegang izin aksi pada **channel** percakapan (cakupan channel) → boleh.
2. Percakapan **dialihkan ke tim X** (`conversation_team_access` aktif, tim aktif): anggota tim X boleh bertindak **pada percakapan itu saja**, bila ia memegang izin aksi itu di sedikitnya satu channel (`canAny`) **dan tidak ditolak eksplisit** pada channel percakapan itu. Akses ini **tidak meluas** ke percakapan lain di channel yang sama.
3. Penolakan spesifik pengguna selalu menang. Akses dihitung ulang pada **setiap** permintaan (izin yang dicabut berlaku pada permintaan berikutnya; tidak ada cache izin; daftar id channel di-cache ≤ 2 detik, bukan izin).
4. Respons: percakapan di luar akses → **404** (keberadaan tidak dibocorkan); terlihat tetapi tanpa izin aksi → **403**.

### 2. Izin baru (terdaftar di registri, `available: true`)
`chat.view`, `chat.reply`, `ai.toggle` (sudah ada, kini aktif), **`chat.assign`**, **`chat.transfer`**, **`chat.note`**, `quickreply.manage`, **`killswitch.channel`**. Seluruhnya bercakupan channel. Peran bawaan "Admin fungsi" memperoleh `chat.note`, `chat.assign`, `killswitch.channel`; peran lain tidak berubah (default menolak). `PermissionSet.deniesChannel()` ditambahkan agar penolakan eksplisit dapat mengalahkan akses pengalihan.

### 3. Penugasan dan pengalihan
- **Antrian default channel** (`channels.default_team_id`) menjadi tim awal percakapan baru; dapat diatur per channel (izin `channel.manage`), teraudit, bukan konstanta kode.
- **Penugasan** = tim (harus terhubung ke channel itu) + PIC chat opsional (anggota tim, aktif). **Optimistic concurrency**: kolom `assign_version`; permintaan dengan versi basi → **409 `ASSIGN_CONFLICT`** dan benturan **teraudit lewat koneksi terpisah** (agar tidak ikut ter-rollback). Dua admin bersamaan: tepat satu menang.
- **Pengalihan** (`transfer`): mencabut akses tim sebelumnya, memberi akses ke tim tujuan **untuk percakapan itu**, melepas PIC bila bukan anggota tim tujuan, menaikkan versi, opsional menandai *Lead Nyasar*; seluruhnya dalam satu transaksi + audit (`conversation.transferred`).
- **PIC chat ≠ PIC pipeline**: kolom `assignee_id` milik percakapan; PIC pipeline baru ada di Tahap 5 (kolom terpisah).
- **Lead Nyasar**: penanda manual (`stray_lead`), teraudit; deteksi otomatis = Tahap 4.

### 4. Belum dibaca per pengguna (D-16, ASUMSI)
`messages.unread_eligible` (true hanya untuk pesan pelanggan **langsung** yang baru) + `conversation_reads(user_id, conversation_id, last_read_at)`. Jumlah = pesan eligible dengan `received_at > last_read_at` pengguna itu. **Webhook duplikat, history, dan echo tidak menambah** (duplikat tidak menyisipkan baris; history/echo `unread_eligible = false`). Dibaca satu admin tidak mengubah admin lain. Jika D-16 diputuskan *bersama*, ubah satu tempat (`unreadExpr`) dan satu tabel.

### 5. Perubahan pada penjaga statis lama (AGENTS.md §10.2 — transparansi)
Tiga test lama disesuaikan **secara sempit**, bukan dilonggarkan:
- `architecture.test.ts` dan `tahap2-units.test.ts` melarang modul `inbox` sampai Tahap 3 → kini hanya `inbox` (dan `automation`) yang diizinkan; larangan `ai-agents`, `pipelines`, `follow-up`, `program-cards`, `knowledge`, `labels`, `templates` **tetap penuh**.
- `tahap2-units.test.ts` "hook hanya dari cabang `message`" → jaminan **sama** (`echo`/`history`/`status` tidak pernah memancarkan event) kini diuji pada mekanisme baru (`enqueueCustomerMessage` di outbox, ADR-0008), dan ditambah: jalur langsung `emitCustomerMessage` tidak dipakai produksi.

## Konsekuensi
- Migrasi `0004` (skema) dan `0005` (trigger/integritas) bersifat **maju-saja**, diuji pada DB kosong dan snapshot data Tahap 1/2.
- Akses berbasis tim hanya berlaku bila pengguna sudah memegang izin aksi **di suatu channel**: tim tujuan tidak dapat "menciptakan" izin baru. Pengguna tanpa izin apa pun tidak memperoleh apa pun dari pengalihan (diuji).
- Biaya: satu `EXISTS` tambahan per kueri daftar; indeks pada `conversation_team_access(conversation_id)` dan `team_members(user_id)`.
- Keterbatasan jujur: pengguna yang **hanya** punya akses karena pengalihan tidak melihat percakapan lain milik kontak yang sama di channel lain kecuali ia berizin di sana (sengaja).
