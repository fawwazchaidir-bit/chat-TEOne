# Bukti uji nyata Gate 3 (S1–S8) — staging, nomor …186319

> **Status: SEDANG DIJALANKAN — belum lengkap.** Rujukan: `docs/tahap-3/rencana-uji-nyata-gate-3.md`.
> Aturan bukti: hanya teks/angka. **Tanpa** isi chat, nama, nomor lengkap (maks. 4–6 digit terakhir), token, cookie, ID sesi, atau screenshot berisi data pelanggan. Pelaksana mengisi hasil; penilaian lulus/gagal Gate dilakukan **auditor di sesi terpisah** (AGENTS §2.6).

## 0. Identitas uji
| Item | Nilai |
|---|---|
| Tanggal & jam mulai/selesai (WIB) | |
| Pelaksana (peran, bukan nama lengkap) | |
| Revisi image berjalan (`org.opencontainers.image.revision`) | |
| `git rev-parse HEAD` di host | |
| `GET /api/health` | |
| Nomor bisnis yang dipakai | …186319 (Kemitraan) |
| Penerima uji A / "pelanggan B" | …4062 / …722419 (HP pribadi staf, bukan nomor bisnis) |
| Konfirmasi: Admisi …196319 & Hotline …246319 **tidak disentuh** | |
| Konfirmasi: aplikasi/webhook Meta Halo AI **tidak disentuh** | |

## 1. Prasyarat P1–P8
| # | Hasil (ok / tidak + catatan) |
|---|---|
| P1 Gate 2 LANJUT TERBATAS + tag | ok (26 Nov) |
| P2 flag `inbox`=on, `ai_simulation`=off, `whatsapp_connector`=on | **ok** — `inbox` dinyalakan Super Admin 28 Nov (audit `feature_flag.changed` +1); `ai_simulation` tanpa override = mati |
| P3 `test_mode` = true | **ok** (`bool_and(test_mode)=true`) |
| P4 penerima uji: …4062 + pelanggan B; tanpa …196319/…246319 | **ok** — `penerima_uji_aktif=2` (…4062 + pelanggan B …722419) |
| P5 channel "Uji B" tanpa koneksi Meta | **ok** — `Uji B koneksi=false operasional=false`; `Kemitraan Uji koneksi=true operasional=false` |
| P6 pengguna uji | **ok dengan deviasi** — lihat 1a |
| P7 backup `backup-rotate.sh` kode 0, `offsite=ok` | **ok** — kode keluar 0 (dilaporkan pelaksana, 28 Nov; kode 0 mensyaratkan offsite sukses) |
| P8 ponsel …186319 satu operator, tanpa chat pelanggan | **ok** (dikonfirmasi pemilik) |

### 1a. Peta pengguna, tim, dan izin (ID dipotong 8 karakter)
| Akun | Super Admin | 2FA | Tim | Peran | `chat.view` |
|---|---|---|---|---|---|
| `3c4cf057` (Super Admin) | ya | ya | Kemitraan, Admisi | – | (Super Admin) |
| `2770cb9c` (Admin Kemitraan) | tidak | **tidak** | Kemitraan | Admin Kemitraan | Kemitraan Uji |
| `25dcd908` (Admin Admisi) | tidak | **tidak** | Admisi | Admin Admisi | Uji B |

Tim: `Kemitraan → Kemitraan Uji`, `Admisi → Uji B`. Seluruh 7 izin peran (`channel.view, chat.view, chat.reply, chat.note, ai.toggle, chat.transfer, chat.assign`) bercakupan **satu channel**; tidak ada `scope_all`.

**Deviasi P6:** 2FA dua admin uji tidak diaktifkan. Aturan produk (AGENTS §9; `docs/keamanan-dan-izin.md` §2) mewajibkan 2FA hanya untuk Super Admin; admin biasa opsional. Tidak memengaruhi skenario izin channel. Penilaian keberterimaan deviasi = auditor.
**Catatan pelaksanaan:** Admin Kemitraan dan Admin Admisi dioperasikan satu penguji dengan dua akun terpisah di browser terpisah. Selama penyiapan ditemukan & diperbaiki sebelum uji: pemetaan tim–channel sempat tertukar; peran bawaan "Admin Admisi" tanpa cakupan channel (cakupan "fungsi" tidak cocok dengan channel uji); peran "Admin Kemitraan" sempat bercakupan SEMUA.

## 2. Kueri bukti — SEBELUM

### 2a. Baseline awal (sebelum prasyarat dilengkapi) — 2026-11-28 02:03 UTC
Image berjalan `teone-app:staging-1d63982` / `teone-tools:staging-1d63982`, label revision `1d63982a…` = checkout build `~/teone-build-1d63982` (commit `1d63982`, = `main`). `GET https://staging-chat.trilogikaedutama.id/api/health` → `{"status":"ok"}`. Catatan: `~/chat-TEOne` di host adalah clone lama (`9c297d3`), **bukan** sumber deploy.
```
jam|2026-11-28 02:03:00.999552+00
flag whatsapp_connector|true
test_mode|true
penerima_uji_aktif|1
percakapan|1
pesan keluar te_one|4
pesan keluar whatsapp_business_app|1
pesan masuk pelanggan|5
pesan_keluar_status diterima|3
pesan_keluar_status gagal|2
unread_eligible|5
akses_alih|0
ai_event|1
automation_jobs|0
inbound echo processed -|1
inbound echo quarantined pengirim_di_luar_daftar_uji|1
inbound message processed -|5
inbound message quarantined channel_tidak_dikenal|1
inbound message quarantined pengirim_di_luar_daftar_uji|2
inbound status processed -|8
audit auth.login success|1
audit auth.totp_verified success|1
```
Pembacaan: flag `inbox` **tanpa override = mati** (fail-closed) → P2 belum terpenuhi; `ai_simulation` tanpa override = mati (sesuai). `penerima_uji_aktif=1` → pelanggan B belum terdaftar (P4 belum lengkap). Tidak ada kill switch menyala.

### 2b. Baseline final (setelah prasyarat lengkap, tepat sebelum S1)
```
(tempel keluaran q3.sql di sini)
```

## 3. Hasil skenario
| ID | CCP | Hasil (LULUS / GAGAL / BELUM DAPAT DIUJI) | Pengamatan (angka/teks, tersamar) | Jam (WIB) |
|---|---|---|---|---|
| S1 | 3.1 | | | |
| S2 | 3.5 | | | |
| S3 | 3.2 + D-22 | | | |
| S4 | 3.1 lintas channel | | | |
| S5 | 3.7 + D-05 | | | |
| S6 | 3.6 (bagian nyata) | | | |
| S7 | G2 nyata | | | |
| S8 | 3.4 (bagian nyata) | | | |

## 4. Kueri bukti — SESUDAH
```
(tempel keluaran q3.sql di sini)
```

## 5. Kondisi akhir (rencana §4)
| Item | Nilai |
|---|---|
| `smb_message_echoes` dimatikan lagi | |
| Kill switch channel & global dilepas manual (tercatat audit) | |
| `ai_simulation` tetap mati | |
| Kondisi berhenti terpicu? (§3) | |

## 6. Batas jujur
- CCP 3.3, 3.4, 3.6 tetap **terbukti simulasi**; S6/S8 hanya membuktikan bagian yang dapat diamati tanpa kirim otomatis.
- Penilaian akhir Gate 3 = auditor.
