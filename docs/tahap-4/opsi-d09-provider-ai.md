# Opsi keputusan D-09 — provider & model AI, batas biaya, data yang dikirim

> Disusun auditor 26 Nov 2026 untuk keputusan pemilik. **Bukan keputusan.** Harga = tarif API resmi Anthropic per 1 juta token (cache data 3 Nov 2026); provider lain **tidak dihitung** di sini karena harganya tidak diverifikasi sesi ini — bila ingin dibandingkan, minta penawaran resmi. Arsitektur TE One wajib menaruh logika provider di **adapter** (AGENTS.md §5), sehingga provider/model dapat diganti tanpa mengubah modul lain.

## 1. Pilihan model (Anthropic Claude)
| Model | ID | Input / Output per 1 jt token | Cache read | Cocok untuk |
|---|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 | $0,20 | Kualitas tertinggi; set uji, kasus sulit |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 | $0,10 | Seimbang kualitas–biaya untuk balasan pelanggan |
| Claude Haiku 5.5 | `claude-haiku-5-5` | $0,10 / $0,50 (≤100K token) | — | Klasifikasi niat, deteksi minta-manusia/komplain, routing |

## 2. Perkiraan biaya (ASUMSI — wajib diganti dengan angka nyata)
Asumsi per **satu balasan AI**: konteks tetap (instruksi + Kartu Program relevan) ±6.000 token **di-cache**, percakapan ±1.000 token, keluaran termasuk penalaran ±550 token. Volume contoh: **36.000 balasan/bulan** (≈300 percakapan/hari × 4 balasan). Kurs ilustrasi Rp16.500/USD.

| Skema | Per 1.000 balasan | Per bulan (36rb balasan) | ≈ Rupiah/bulan |
|---|---|---|---|
| Opus 5.5 untuk semua | ±$16 | ±$585 | ±Rp9,6 jt |
| **Sonnet 5.5 menjawab + Haiku 5.5 klasifikasi** | ±$9 | ±$325 | ±Rp5,4 jt |
| Haiku 5.5 untuk semua | ±$1–2 | ±$50 | ±Rp0,8 jt |

Catatan: penulisan cache pertama tiap 5 menit sedikit lebih mahal; biaya naik bila percakapan panjang. Mode B (hanya pertanyaan Kartu Program) menurunkan volume balasan AI karena sisanya dieskalasi.

## 3. Usulan auditor
1. **Pilih berdasarkan bukti, bukan harga:** jalankan **set uji D-21 yang sama** pada Sonnet 5.5 dan Opus 5.5; pakai model **termurah yang lulus** (0 fabrikasi harga/jadwal/tautan, ≥95% eskalasi benar, ≥90% jawaban benar). Haiku 5.5 hanya untuk klasifikasi/routing, bukan menjawab pelanggan, kecuali lulus set uji yang sama.
2. **Usulan awal yang dicatat sebagai ASUMSI sampai set uji selesai:** Sonnet 5.5 (menjawab) + Haiku 5.5 (klasifikasi).
3. **Batas biaya (ditegakkan kode, CCP 4.6):** batas **harian** dan **bulanan** (usulan: bulanan USD 400, harian USD 20); saat tercapai → AI berhenti otomatis, percakapan dieskalasi ke admin, notifikasi ke pemilik; tidak menyala sendiri.

## 4. Data yang boleh dikirim ke provider (usulan)
| Dikirim | Tidak dikirim |
|---|---|
| Teks pesan percakapan **yang sedang berjalan** (maks. N giliran terakhir) | Nomor telepon, nomor identitas, alamat, email |
| Field Kartu Program yang relevan + versi | Nama lengkap (diganti sapaan umum / nama panggilan bila disetujui) |
| Kategori/label percakapan | Media (foto/dokumen) — tahap awal tidak dikirim |
| — | Catatan internal staf, rahasia, token |
Catat setiap panggilan: provider, model, versi konfigurasi, versi Kartu Program, jumlah token, biaya (AGENTS.md §8). Perbarui Kebijakan Privasi bagian 3–4 **sebelum** AI aktif. Periksa ketentuan retensi data provider dan cantumkan di dokumen D-18.

## 5. Yang perlu pemilik isi
```
D-09 provider      : [ ] Anthropic Claude   [ ] lainnya: ______
D-09 model jawab   : [ ] Sonnet 5.5 (usulan, diuji)  [ ] Opus 5.5  [ ] lainnya
D-09 model klasifikasi: [ ] Haiku 5.5 (usulan)  [ ] sama dengan model jawab
Batas biaya        : bulanan USD ____  harian USD ____
Data dikirim       : [ ] sesuai tabel §4   [ ] dengan perubahan: ______
Pemegang akun/billing API: ______
```
