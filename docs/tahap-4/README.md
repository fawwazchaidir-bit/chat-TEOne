# Tahap 4 — AI agent, Kartu Program, knowledge, simulator, eskalasi (STRUKTUR)

> **Status jujur:** hanya **struktur** yang ada (PR "struktur Tahap 4"): skema + migrasi 0007–0008, izin terdaftar, dua ADR, prompt tersimpan. **Belum ada agent, jawaban AI, provider, simulator, set uji, eskalasi, ataupun UI** — semua berstatus **Belum dibuat** (AGENTS.md §4); menu "AI Agent" dan "Kartu Program & Knowledge" tetap **"Belum tersedia · Tahap 4"**. Dikerjakan atas instruksi eksplisit pemilik sementara **Gate 2 belum diputuskan** (preseden Tahap 3); **tidak ada** tag dan **tidak ada** keputusan gate. Flag `ai_agents` **mati** dan tidak boleh dinyalakan untuk tujuan apa pun sebelum fitur ada.

| Dokumen | Isi |
|---|---|
| [`../prompts/tahap-4.md`](../prompts/tahap-4.md) | Prompt Tahap 4 (v2) disimpan **utuh** |
| [`../adr/0010-model-data-agent-kartu-program-knowledge-tahap-4.md`](../adr/0010-model-data-agent-kartu-program-knowledge-tahap-4.md) | Model data, versi, penempatan, akses dua arah, izin |
| [`../adr/0011-batas-modul-ai-retrieval-provider-dan-validasi-tahap-4.md`](../adr/0011-batas-modul-ai-retrieval-provider-dan-validasi-tahap-4.md) | Batas modul, retrieval (PostgreSQL FTS), adapter provider, validasi oleh kode, urutan kerja |

## Yang sudah ada (istilah §4)
| Butir | Status |
|---|---|
| 10 tabel (`ai_agents`, `ai_agent_versions`, `ai_agent_version_sources`, `ai_channel_agents`, `program_cards`, `program_card_versions`, `program_card_agents`, `knowledge_sources`, `knowledge_source_versions`, `knowledge_source_agents`) | **Dibuat; terbukti pada PostgreSQL nyata lewat tes integrasi** (bukan Meta/AI) |
| Penjaga DB: versi terbit beku, satu draft/terbit per entitas, satu agent aktif per channel, agent dipakai tak dapat nonaktif/hapus, `aktif` butuh versi terbit, sumber agent terkunci pada versi terbit, URL `https`, tanggal valid | **Terbukti** (tes, termasuk melalui peran aplikasi) |
| Pencarian teks penuh `indonesian` (GIN) pada versi knowledge | **Dibuat; kualitas stemmer belum diukur** |
| 9 izin baru (`agent.view/publish/place`, `programcard.manage/publish`, `knowledge.publish`, `ai.simulator/testset/audit`) | **Terdaftar, `available: false`** |
| Layanan, API, UI, agent contoh (CONTOH), `ai_runs`/biaya, notifikasi tim, simulator, set uji, provider | **Belum dibuat** |

## Keputusan yang masih Terbuka (dipakai sebagai ASUMSI)
**D-09** (provider/model/biaya; **tanpa default** — blokir provider nyata), D-10, D-15, D-20, D-21, D-22, D-23. Tambahan **tanpa D-id**: definisi "jadwal belum lewat" untuk validasi tautan (usulan: tanggal **mulai** belum lewat) — perlu konfirmasi pemilik (ADR-0010 §5).

## Menyalakan
**Belum ada yang dapat dinyalakan.** Flag `ai_agents` baru berarti setelah langkah (4)–(5) di ADR-0011 §10 selesai dan diaudit.

## Langkah berikutnya (ADR-0011 §10)
(2) Kartu Program + validator tautan → (3) knowledge + ekstraksi → (4) agent CRUD/versi/penempatan → (5) pipeline jawab (`MockProvider`) + sepuluh pemeriksaan + eskalasi → (6) simulator + set uji → (7) provider nyata **setelah D-09** → (8) uji nyata **setelah Gate 3**. Data awal Kartu Program (J0-08) dan set pertanyaan uji (J0-09) **belum diterima** pembangun.
