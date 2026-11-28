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
| Penerima uji A / "pelanggan B" | …4062 / …____ (bukan nomor bisnis) |
| Konfirmasi: Admisi …196319 & Hotline …246319 **tidak disentuh** | |
| Konfirmasi: aplikasi/webhook Meta Halo AI **tidak disentuh** | |

## 1. Prasyarat P1–P8
| # | Hasil (ok / tidak + catatan) |
|---|---|
| P1 Gate 2 LANJUT TERBATAS + tag | ok (26 Nov) |
| P2 flag `inbox`=on, `ai_simulation`=off, `whatsapp_connector`=on | |
| P3 `test_mode` = true | |
| P4 penerima uji: …4062 + pelanggan B; tanpa …196319/…246319 | |
| P5 channel "Uji B" tanpa koneksi Meta | |
| P6 pengguna uji Admin Kemitraan / Admin Admisi / Super Admin, semua 2FA | |
| P7 backup `backup-rotate.sh` kode 0, `offsite=ok` | |
| P8 ponsel …186319 satu operator, tanpa chat pelanggan | |

## 2. Kueri bukti — SEBELUM
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
