# Tahap 3 — Inbox tim, routing, pengambilalihan, dan kill switch

> **Status jujur:** dibuat dan diuji dengan **mock Meta (SIMULASI)**. **Belum lulus untuk integrasi langsung** — belum ada uji nyata dengan nomor uji (Gate 2 belum diterima; A07 terbuka). Tahap ini dikerjakan atas instruksi eksplisit pemilik sementara Gate 2 belum diputuskan (prompt Tahap 3 §1: "LANJUT TERBATAS dengan mock").
> **AI sungguhan belum ada** (Tahap 4). Yang ada hanya job **AI simulasi** untuk menguji pengambilalihan dan kill switch, di balik flag `ai_simulation` yang **tidak pernah menyala di production**.

| Dokumen | Isi |
|---|---|
| [`panduan-inbox.md`](panduan-inbox.md) | Cara memakai inbox: navigasi, daftar, percakapan, panel info, balasan, catatan internal, balasan cepat |
| [`tim-antrian-routing.md`](tim-antrian-routing.md) | Tim, antrian default channel, penugasan, pengalihan (D-22), **aturan akses percakapan yang dialihkan** |
| [`alur-ai-admin.md`](alur-ai-admin.md) | Status AI, pengambilalihan, aktivasi ulang & batas, benturan AI–admin, echo HP (D-05) |
| [`kill-switch.md`](kill-switch.md) | Empat tingkat kill switch, siapa yang boleh, bagaimana diperiksa, apa yang tidak boleh terjadi |
| [`belum-dibaca-dan-penugasan.md`](belum-dibaca-dan-penugasan.md) | Aturan belum dibaca (D-16) dan penugasan/benturan |
| [`../adr/0007-akses-percakapan-routing-dan-izin-tahap-3.md`](../adr/0007-akses-percakapan-routing-dan-izin-tahap-3.md) | ADR akses & izin |
| [`../adr/0008-mesin-status-ai-outbox-durable-dan-pipeline-otomatisasi.md`](../adr/0008-mesin-status-ai-outbox-durable-dan-pipeline-otomatisasi.md) | ADR status AI, outbox, pipeline |
| [`../adr/0009-pembaruan-tampilan-inbox-polling.md`](../adr/0009-pembaruan-tampilan-inbox-polling.md) | **ADR pembaruan tampilan (polling)** |
| [`../reports/tahap-3.md`](../reports/tahap-3.md) | Laporan akhir (format AGENTS.md §12) |

## Menyalakan di lingkungan uji
1. Super Admin → **Kill switch & flag**: nyalakan `whatsapp_connector` (Tahap 2) dan `inbox`. `ai_simulation` hanya bila ingin menguji pengambilalihan/kill switch dengan job simulasi (otomatis ditolak di production).
2. Pastikan channel sudah dipetakan (Tahap 2), mode uji aktif, dan penerima uji terdaftar. Di non-production balasan **hanya** terkirim ke daftar penerima uji (ditegakkan server).
3. Beri peran yang memuat izin inbox (`chat.view`, `chat.reply`, `chat.note`, `ai.toggle`, `chat.assign`, `chat.transfer`, `quickreply.manage`, `killswitch.channel`) pada channel yang sesuai.
