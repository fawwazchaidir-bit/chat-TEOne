## Ringkasan
<!-- Apa yang berubah dan mengapa. Tahap: N. -->

## Checklist proteksi regresi (AGENTS.md §10) — wajib
- [ ] CI hijau: lint, typecheck, build, seluruh test `@tahap-1`…`@tahap-N`, secret scan, guard nomor operasional
- [ ] Tidak ada test dihapus / di-skip / dilemahkan (jumlah per tag tidak turun; baseline diperbarui hanya naik)
- [ ] Migrasi hanya maju; diuji pada DB kosong dan snapshot data tahap sebelumnya
- [ ] Fitur baru di balik feature flag yang default-nya mati
- [ ] Kontrak inti (AGENTS.md §6) tidak berubah — atau ada ADR + regresi penuh
- [ ] Tidak ada rahasia / data pelanggan / nomor operasional di diff
- [ ] Nomor Admisi/Hotline dan koneksi Halo AI tidak disentuh

## Bukti
<!-- Perintah + hasil aktual. Pisahkan: nyata / simulasi / belum dapat diuji. -->

## Asumsi yang dipakai
<!-- ID D-xx dari docs/decisions.md; jangan dilaporkan sebagai keputusan final. -->
