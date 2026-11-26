# Bukti rebuild staging dari commit bersih + worker — 26 Nov 2026 (±09.37 WIB)

Ditempel operator/pemilik di sesi audit (teks; tanpa rahasia). Runbook: `docs/tahap-2/runbook-fase-2-operator.md` Langkah 5.

## Checkout & build
- Checkout baru `/home/TEAdmin/teone-build`, detached di `origin/main` = **`0463559`**; `git status --short` = 0 berkas (bersih). Checkout lama tidak diubah.
- `scripts/build-staging-image.sh` (menolak pohon kotor):
```
commit     : 046355936dc44b62f2281166fe9ef15c95527138
image      : teone-app:staging-0463559    id=sha256:a92a026cfa82…b493b8c  revision-label=046355936dc44b62f2281166fe9ef15c95527138
image      : teone-tools:staging-0463559  id=sha256:76a6bc4b0069…f16f     revision-label=046355936dc44b62f2281166fe9ef15c95527138
```

## Konfigurasi sebelum pasang
`docker compose config`: `name: deploy`; image `teone-app:staging-0463559`, `teone-tools:staging-0463559`; `SITE_ADDRESS: staging-chat.trilogikaedutama.id`. Volume hanya `deploy_caddy_data`, `deploy_media_data`, `deploy_pg_data` (tidak ada volume baru). Image lama tetap tersedia: `teone-app:rollback-20261126` (`417b30f8d220`).

## Pasang (`up -d --no-deps app worker caddy`; DB tidak dibuat ulang)
```
deploy-app-1      teone-app:staging-0463559     Up (health: starting)
deploy-caddy-1    caddy:2                       Up   80/443
deploy-db-1       postgres:16                   Up 18 hours (healthy)
deploy-worker-1   teone-tools:staging-0463559   Up
app    teone-app:staging-0463559    revisi=046355936dc44b62f2281166fe9ef15c95527138
worker teone-tools:staging-0463559  revisi=046355936dc44b62f2281166fe9ef15c95527138
worker: "[worker] mulai" (tanpa fatal)
caddy : "enabling automatic TLS certificate management" domains=[staging-chat.trilogikaedutama.id]; "serving initial configuration"; tanpa error
GET https://staging-chat.trilogikaedutama.id/api/health → {"status":"ok"}
feature_flag_overrides (02:37:58 UTC): whatsapp_connector|t   (tidak ada baris lain → inbox & ai_simulation = bawaan MATI)
```

## Penilaian auditor
- **G1-B01: tertutup (terbukti nyata).** Image yang berjalan di staging kini berlabel revisi = commit `0463559` yang sama dengan `main` dan dengan commit yang lulus CI #42/#43 serta verify-all auditor (kode identik dengan `6a49fa5`). Tidak ada edit lokal di checkout build.
- **A-4 / S-10: worker berjalan** (terbukti nyata untuk "mulai"; siklus pemeliharaan diamati lewat log berikutnya).
- **Catatan:** pernyataan pemilik 25–26 Nov memuat baris `inbox|f` dan `ai_simulation|f`; tabel `feature_flag_overrides` kini hanya berisi `whatsapp_connector`. Aplikasi tidak pernah menghapus baris override (hanya upsert), jadi kueri sebelumnya kemungkinan berbeda sumber. Efektifnya sama: kedua flag MATI (bawaan registri). Opsional: cek `audit_log` untuk aksi flag.
- **Masih perlu:** satu pesan uji …4062 → …6319 tampil di TE One setelah pergantian Caddy/app (webhook end-to-end).
