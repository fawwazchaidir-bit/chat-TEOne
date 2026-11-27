# Rencana uji nyata Gate 3 — Inbox, routing, pengambilalihan (staging, nomor …186319)

Disusun auditor 26 Nov 2026 setelah Gate 2 **LANJUT TERBATAS** dan tag `tahap-1-diterima` / `tahap-2-diterima-terbatas` (`7f4577b`). **Belum dijalankan.** Pelaksana: pemilik/operator lewat UI staging + kueri baca-saja di VPS. Bukti = **teks/angka**, tanpa isi chat pelanggan; nomor hanya 4–6 digit terakhir.

## 0. Batas jujur (baca dulu)
- Pengiriman **otomatis** nyata belum ada: `ai_simulation` **ditolak server** bila Graph = Meta asli; AI sungguhan = Tahap 4. Karena itu **CCP 3.3 (ambil alih), 3.4 (aktivasi ulang AI), dan 3.6/G8 (kill switch menghentikan kirim otomatis)** tetap **terbukti simulasi** (E2E G3/G5/G8 + test) — uji nyata di sini hanya bagian yang dapat diamati tanpa pengiriman otomatis.
- Yang **dapat diuji nyata**: 3.1 visibilitas per channel, 3.2 akses percakapan yang dialihkan, 3.5 kirim manual tanpa duplikat, 3.7 echo dari HP (D-05 AI Off) + urutan status, D-22 lead nyasar, kill switch tidak menyala/lepas sendiri, dan Golden E2E **G2 nyata yang tertunda** (webhook kirim-ulang tidak menggandakan).

## 1. Prasyarat
| # | Prasyarat | Cara cek |
|---|---|---|
| P1 | Gate 2 LANJUT TERBATAS tercatat; tag ada | ✅ (26 Nov) |
| P2 | Flag **`inbox` = menyala**, **`ai_simulation` = mati**, `whatsapp_connector` = menyala | Halaman Kill switch & flag; kueri `feature_flag_overrides` |
| P3 | Channel …186319 `test_mode = true` | kueri §6 |
| P4 | Daftar penerima uji: …4062 **+ satu nomor tim lain yang BUKAN nomor bisnis** (mis. HP pribadi staf) sebagai "pelanggan B". **DILARANG memakai …196319 atau …246319** — nomor **Admisi** dan **Hotline** (dikonfirmasi pemilik 26 Nov) | Halaman Integrasi → penerima uji |
| P5 | Channel kedua **"Uji B"** dibuat **tanpa koneksi** Meta (hanya untuk uji visibilitas) | Halaman Channel |
| P6 | Pengguna uji: **Admin Kemitraan** (cakupan channel Kemitraan, Tim Kemitraan), **Admin Admisi** (cakupan channel Uji B saja, Tim Admisi), Super Admin (Anda) — semua dengan 2FA | Halaman Pengguna / Peran / Tim |
| P7 | Backup sebelum uji: `backup-rotate.sh` kode 0, `offsite=ok` | VPS |
| P8 | Ponsel …186319 **satu operator**, tanpa chat pelanggan selama uji | Pemilik |

## 2. Skenario
| ID | CCP | Langkah | Lulus bila |
|---|---|---|---|
| **S1** | 3.1 | Dari …4062 kirim "Halo S1". Login **Admin Kemitraan** → percakapan tampil di inbox (Semua, channel Kemitraan, belum dibaca 1). Login **Admin Admisi** → percakapan **tidak tampil** di daftar, pencarian (4 digit terakhir), filter, dan jumlah; buka URL percakapan langsung → **ditolak** | Tampil hanya untuk yang berizin; URL langsung 403/halaman ditolak |
| **S2** | 3.5 | Admin Kemitraan membalas S1 dengan **klik ganda cepat** pada tombol kirim | Di WhatsApp …4062 hanya **1** pesan; di TE One 1 pesan keluar; status naik ke Diterima/Dibaca dari webhook |
| **S3** | 3.2 + D-22 | Admin Kemitraan menandai **Lead nyasar** / **alihkan** percakapan ke **Tim Admisi** | Admin Admisi kini **melihat percakapan itu saja** (bukan seluruh channel Kemitraan); percakapan lain di channel Kemitraan tetap tidak terlihat olehnya |
| **S4** | 3.1 (lintas channel) | Dari "pelanggan B" (HP pribadi staf, bukan nomor bisnis) kirim "Halo S4" | Admin Admisi tidak melihat percakapan B; panel riwayat kontak hanya menampilkan channel berizin |
| **S5** | 3.7 + D-05 | Aktifkan sementara `smb_message_echoes`; dari ponsel …186319 kirim 1 pesan ke …4062 di percakapan S1 | Pesan tampil bersumber **WhatsApp Business App**; **AI Off** pada percakapan itu dengan alasan echo; unread tidak bertambah. Matikan lagi `smb_message_echoes` |
| **S6** | 3.6 (bagian nyata) | Nyalakan kill switch **channel** Kemitraan, lalu **global**; tunggu 10 menit; kirim balasan manual | Spanduk merah tampil < 60 dtk; **tidak lepas sendiri**; balasan manual **tetap** terkirim (sesuai rancangan); lepaskan manual → tercatat di audit |
| **S7** | G2 nyata (tertunda) | Di Meta App Dashboard → Webhooks, gunakan **Test** untuk field `messages` (contoh Meta) dua kali **atau** minta operator mengulang pengiriman event yang sama | Event contoh dikarantina `channel_tidak_dikenal` dua kali tanpa pesan baru; untuk pesan …4062, kirim ulang id yang sama tidak menambah pesan (diamati di hitungan) — bila tidak dapat dipicu nyata, catat "belum dapat diuji" |
| **S8** | 3.4 (bagian nyata) | Di panel AI percakapan S1: nyalakan AI → status berubah dengan batas aktivasi; matikan lagi | Perubahan status tercatat & teraudit; **tidak ada** pesan AI terkirim (ai_simulation mati) |

## 3. Kondisi berhenti
- Pesan terkirim ke nomor di luar daftar uji → **kill switch global + STOP**, catat insiden.
- Pesan terduplikasi di ponsel tester → STOP, laporkan (S2 gagal).
- Pengguna tanpa izin melihat data channel lain → STOP, **temuan kritis** (3.1).
- App/worker tidak sehat atau antrean `pending` > 10 menit → STOP; rollback image bila perlu.

## 4. Setelah uji
- `smb_message_echoes` **mati**; kill switch dilepas; flag `inbox` boleh tetap menyala di staging (untuk UAT), `ai_simulation` tetap mati.
- Kirim ke auditor: tabel S1–S8 (lulus/gagal/belum dapat diuji + catatan) dan keluaran kueri §6 sebelum/sesudah.

## 5. Penilaian yang akan dipakai auditor
3.1, 3.2, 3.5, 3.7 → **nyata** bila S1–S5 lulus. 3.3, 3.4, 3.6 → **simulasi** (bagian nyata S6/S8 dicatat). Rekomendasi Gate 3 kemungkinan **LANJUT TERBATAS** (otomatisasi nyata = Tahap 4).

## 6. Kueri bukti (baca-saja, angka saja) — jalankan sebelum dan sesudah
```bash
cat > /tmp/q3.sql <<'EOF'
select 'jam', now()::text;
select 'flag '||key, enabled::text from feature_flag_overrides order by key;
select 'test_mode', bool_and(test_mode)::text from channel_connections;
select 'penerima_uji_aktif', count(*)::text from test_recipients where active;
select 'percakapan', count(*)::text from conversations;
select 'pesan '||direction||' '||source, count(*)::text from messages group by 1 order by 1;
select 'unread_eligible', count(*)::text from messages where unread_eligible;
select 'akses_alih', count(*)::text from conversation_team_access;
select 'ai_event', count(*)::text from conversation_ai_events;
select 'automation_jobs', count(*)::text from automation_jobs;
select 'kill_switch_menyala '||scope_type, count(*)::text from kill_switches where engaged group by 1;
select 'audit '||action||' '||result, count(*)::text from audit_log where occurred_at > now() - interval '3 hours' group by 1 order by 1;
EOF
sudo docker exec -i deploy-db-1 psql -U postgres -d teone_staging -At -F '|' < /tmp/q3.sql
```
