# Tim, antrian, dan routing

## Model
- **Tim** (Tahap 1) terhubung ke satu/lebih **channel**. **Antrian default channel** = tim awal percakapan baru; diatur per channel di halaman **Channel** (izin `channel.manage`), teraudit. Bukan konstanta kode.
- **Penugasan** = **tim** + **PIC chat** (opsional). PIC chat **berbeda** dari PIC pipeline (Tahap 5).
- Tim yang dipilih untuk *penugasan* harus **terhubung ke channel percakapan**. Tim lain dijangkau lewat **Alihkan**.

## Penugasan
`POST /api/v1/conversations/:id/assign` dengan `expectedVersion`. Aturan: PIC wajib pengguna aktif dan anggota tim terpilih (tanpa tim: wajib berizin membalas di channel); tim wajib aktif.
**Benturan:** bila dua admin mengubah bersamaan, tepat satu menang; yang lain mendapat **409 `ASSIGN_CONFLICT`** ("sudah diubah pengguna lain, muat ulang") dan benturan tercatat di audit (`conversation.assign_conflict`). Tidak ada penimpaan diam-diam.

## Pengalihan ke tim lain di percakapan yang sama (D-22, ASUMSI)
Contoh: lead nyasar di **Hotline** dialihkan ke **Tim Admisi**; pelanggan **tidak diminta pindah nomor**; balasan tetap keluar lewat nomor channel asal.
`POST /api/v1/conversations/:id/transfer` (izin `chat.transfer`): mencabut akses tim sebelumnya, memberi akses ke tim tujuan, melepas PIC bila bukan anggota tim tujuan, opsional menandai *Lead Nyasar* + catatan; satu transaksi + audit `conversation.transferred`.

### Aturan akses percakapan yang dialihkan (inti)
1. Anggota tim tujuan memperoleh akses **hanya ke percakapan yang dialihkan** — **bukan** ke seluruh channel dan **bukan** ke percakapan lain di channel yang sama.
2. Akses itu **tidak menciptakan izin**: anggota harus sudah memegang izin aksi (mis. `chat.reply`) di sedikitnya satu channel. Anggota tim tanpa izin apa pun tetap 404. Anggota yang hanya berizin *lihat* dapat membuka tetapi tidak dapat membalas (403).
3. **Penolakan eksplisit untuk pengguna itu mengalahkan** akses pengalihan (diuji).
4. Pengalihan berikutnya mencabut akses tim sebelumnya; menonaktifkan tim mencabut aksesnya **pada permintaan berikutnya**.
5. Semua perubahan akses tercatat (`conversation_team_access` memuat siapa memberi/mencabut dan kapan; audit log memuat dari-tim → ke-tim).
6. Daftar, jumlah, pencarian, riwayat lintas channel, media, dan umpan pembaruan memakai **fragmen akses yang sama**, sehingga tidak ada jalur yang membocorkan percakapan lain.
Respons: di luar akses → **404**; terlihat tetapi tanpa izin aksi → **403**.

## Lead Nyasar
Penanda **manual** (`POST …/stray-lead`, izin `chat.assign`), teraudit; tampil di daftar dan dapat difilter. Deteksi otomatis = Tahap 4 (di luar lingkup).

## Izin yang terlibat
| Aksi | Izin (cakupan channel) |
|---|---|
| Lihat inbox/percakapan | `chat.view` |
| Balas | `chat.reply` |
| Catatan internal | `chat.note` |
| Ambil alih / matikan / aktifkan AI | `ai.toggle` |
| Ubah tim/PIC, penanda lead nyasar | `chat.assign` |
| Alihkan ke tim lain | `chat.transfer` |
| Kelola balasan cepat | `quickreply.manage` |
| Jeda otomatisasi channel | `killswitch.channel` |
