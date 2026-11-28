# Laporan Perbaikan G3-T01 — observabilitas penolakan webhook WhatsApp

> Perbaikan temuan uji nyata Gate 3, bukan tahap baru. Bukan keputusan gate; **tidak ada tag**; tidak ada klaim "terbukti nyata" untuk perbaikan ini. Format AGENTS.md §12.
> Rujukan temuan: `docs/reports/bukti/gate-3-uji-nyata-2026-11-28.md` §5a (G3-T01, prioritas **sedang**) dan baris S7 — berkas bukti berada di branch bukti Gate 3 (`claude/wizardly-brahmagupta-8huu48`), belum di `main`.

## 1. Ringkasan hasil
Sebelumnya `POST /api/webhooks/whatsapp` mengembalikan 401/404/413/400/503 **tanpa jejak apa pun**; hanya 500 yang dicatat. Kini **setiap** respons endpoint (POST dan GET) menghasilkan **tepat satu** baris log terstruktur `[webhook] {json}` berisi metode, kode status, alasan (enum tetap), ukuran body dalam byte, dan — untuk sukses — hitungan `received/stored/duplicates/quarantined`. Payload, header tanda tangan, verify token, challenge, nomor telepon, ID pesan, dan isi pesan **tidak pernah** dicatat (AGENTS §3.4, §3.5, §9). Perilaku respons (status & body) **tidak berubah**; urutan simpan-dulu-baru-200 (kontrak inti §6.3) tetap.

Tambahan: kartu **"Respons endpoint webhook — 24 jam terakhir"** di halaman Integrasi, **khusus Super Admin**, juga tampil saat flag `whatsapp_connector` mati.

Kasus S7 sekarang dapat dibaca langsung dari log: Test Meta berulang dengan ID tetap → `{"status":200,"reason":"ok","counts":{"received":1,"stored":0,"duplicates":1,...}}`. App Secret yang berubah → `{"status":401,"reason":"signature_invalid"}` per request, dan kartu Integrasi menunjukkan jumlah penolakan.

## 2. Repository, branch, commit
`fawwazchaidir-bit/chat-TEOne` · branch `tahap-3-g3-t01-log-webhook` dari `main` `1d63982`. Commit akhir: lihat deskripsi PR. **Tag yang diusulkan: tidak ada.**

## 3. Status fitur (istilah §4)
| Item | Status |
|---|---|
| Log satu baris per cabang respons webhook (POST: `ok`, `flag_off`, `secret_missing`, `too_large`, `signature_missing`, `signature_invalid`, `not_json`, `store_failed`; GET: `flag_off`, `challenge_ok`, `challenge_rejected`) | **Terbukti simulasi** (test integrasi memanggil handler route sebenarnya) |
| Log tidak memuat payload/tanda tangan/nomor/ID/isi (uji string penanda) | **Terbukti simulasi** |
| Penghitung 24 jam per alasan (memori proses) | **Terbukti simulasi** (test integrasi + fungsi murni) |
| Kartu penghitung di halaman Integrasi (Super Admin) | **Dibuat, belum diuji** di UI (tidak ada E2E; build lulus) |
| Panduan pemeriksaan log akses Caddy `docs/staging.md` §5c | **Dibuat, belum diuji** di server |
| Log per request di staging nyata | **Belum dapat diuji** di sesi ini — diverifikasi dengan mengulang S7 setelah deploy |

Batas jujur penghitung: milik proses `app`, kembali ke nol saat restart, tidak dijumlahkan antar-replika, dan tidak melihat request yang tidak sampai ke aplikasi (mis. diblokir di Caddy). Sengaja **tidak** disimpan di DB: endpoint tanpa autentikasi yang menulis DB untuk setiap 401 membuka peluang amplifikasi beban.

Feature flag: tidak ditambahkan. Log adalah perbaikan observabilitas pada endpoint Tahap 2 yang sudah diterima (bukan fitur bisnis baru); kartu hanya baca, khusus Super Admin, dan tidak mengubah alur apa pun.

## 4. Hasil pengujian
**Simulasi (lokal, PostgreSQL 16 lokal, 28 Nov 2026):**
| Perintah | Hasil aktual |
|---|---|
| `npm run lint` | lulus (0 masalah) |
| `npm run typecheck` | lulus |
| `npm run guard:operational` | lulus (380 berkas; G4/G5 tidak aktif lokal karena hash dari secret repository — sama seperti sebelumnya) |
| `npm run scan:secrets` | lulus (380 berkas) |
| `npm run test:report` | **566 test, 0 gagal, 0 dilewati**; "Tidak ada masalah" |
| `npm run build` | lulus |
| `npm run e2e` (dengan `PW_CHROMIUM_PATH` ke Chromium lokal) | 10 lulus, 7 dilewati (placeholder golden NYATA, sama seperti sebelumnya) |

Test baru `tests/integration/tahap3-webhook-log.test.ts` (15 test, tag `@tahap-3`):
- setiap cabang penolakan → tepat 1 baris `[webhook]` dengan status & alasan yang benar, **dan** status/body respons sama persis dengan nilai yang dibekukan test `@tahap-2`;
- payload memuat string penanda (`PENANDA-ISI-PESAN-…`, `wamid.PENANDA-ID-…`, challenge penanda) → **seluruh** keluaran console/stdout selama request tidak memuat penanda, nomor pelanggan sintetis, `phone_number_id`, App Secret, Verify Token, `sha256=`, maupun hex tanda tangan;
- kirim ulang ID sama → `duplicates:1` tercatat (skenario S7); `phone_number_id` tak dikenal → `quarantined:1` tanpa ID tercatat;
- `store_failed` hanya membawa label `pg:<SQLSTATE>`; label tak aman diganti `label_tidak_aman`; pencatatan tidak pernah melempar error walau console gagal;
- penghitung 24 jam: penjumlahan per alasan, pemisahan diterima/ditolak, slot lama keluar jendela.

**Nyata:** belum ada (lihat §12).

## 5. Hasil CCP
Tidak ada CCP baru. CCP 2.1/2.2 (tanda tangan raw body, simpan sebelum 200) tetap lulus; test arsitektur statis route (urutan `arrayBuffer → verifySignature → JSON.parse → storeEvents → status: 200`, tanpa `console.log/info/debug` di `POST`) tetap lulus tanpa diubah.

## 6. Regresi
| Tag | Sebelum (baseline) | Sesudah |
|---|---|---|
| @tahap-1 | 182 | 182 |
| @tahap-2 | 258 | 258 |
| @tahap-3 | 86 | **101** (+15; baseline dinaikkan) |
| @tahap-4 | 25 | 25 |
Tidak ada test yang dihapus, di-skip, atau dilemahkan.

## 7. Perubahan database dan migrasi
Tidak ada.

## 8. Kondisi environment
- Development: diuji lokal (§4).
- Staging: **belum di-deploy**. Setelah merge & deploy, log terbaca dengan `docker compose ... logs app | grep '\[webhook\]'` (`docs/staging.md` §5c).
- Production: belum ada.

## 9. Temuan
| ID | Prioritas | Dampak | Bukti | Tindakan | Penanggung jawab | Status |
|---|---|---|---|---|---|---|
| G3-T01 | Sedang | Penolakan webhook tidak teramati | bukti Gate 3 §5a | Log per respons + kartu penghitung + panduan Caddy (PR ini) | Sesi pembangun → operator (ulang S7) | **Siap diverifikasi ulang** dengan mengulang S7 |
| G3-T01a | Rendah | Log akses Caddy staging hanya memuat 308; HTTPS tidak tercatat walau Caddyfile repository mendefinisikan log akses situs | bukti Gate 3 §5a | Langkah pemeriksaan di `docs/staging.md` §5c (validasi, `diff` Caddyfile di container vs repository, recreate/reload). **Penyebab belum diverifikasi** | Operator staging | Terbuka |

## 10. Asumsi
- Retensi log teknis ≤ 30 hari tanpa isi chat/rahasia mengikuti **D-18** (sudah diputuskan untuk staging); baris `[webhook]` hanya metadata teknis sehingga sesuai.
- Tidak ada asumsi D-xx baru.

## 11. Bukti nomor operasional dan Halo AI tidak diubah
PR ini hanya mengubah kode aplikasi, test dengan identitas sintetis (`155500…`, `phone_number_id` fiktif), dan dokumen. Tidak ada koneksi, webhook, atau aplikasi Meta yang disentuh; nomor Admisi (…196319) dan Hotline (…246319) tidak disentuh; guard nomor operasional lulus.

## 12. Prasyarat verifikasi ulang G3-T01 (mengulang S7)
1. Merge PR (persetujuan pemilik) → build & deploy image `app` ke staging (`docs/staging.md` §5).
2. Meta App Dashboard aplikasi **TE-One** → Webhook fields → `messages` → **Test** → "Send to My Server" (1–3×).
3. Harapan: tiap kirim menghasilkan satu baris `[webhook] … "status":200,"reason":"ok" … "duplicates":1` (ID contoh Meta tetap) di log `app`; kartu Integrasi (Super Admin) menambah hitungan "Diterima".
4. Opsional (negatif, aman): `curl -X POST https://<domain-staging>/api/webhooks/whatsapp -d '{}'` → 401 dan baris `"reason":"signature_missing"`; kartu menambah "ditolak".
5. Jalankan langkah pemeriksaan Caddy §5c dan catat hasilnya (G3-T01a).
6. Catat hasil di berkas bukti Gate 3; penilaian akhir oleh **auditor di sesi terpisah**.
