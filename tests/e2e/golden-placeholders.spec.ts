import { test } from "@playwright/test";

/**
 * Golden E2E yang BELUM dapat dijalankan (GATE-CHECKLIST bagian B): placeholder bertanda BELUM TERSEDIA. Versi SIMULASI/mock G2 ada di g2.spec.ts; G3, G5 (aktivasi), dan G8 ada di g3.spec.ts; versi NYATA menunggu akses Meta + nomor uji + staging (dan AI sungguhan Tahap 4).
 * Placeholder ini BUKAN test regresi dan tidak boleh dihitung sebagai bukti. Setiap tahap yang memiliki
 * skenarionya WAJIB mengganti `test.fixme` di sini dengan test sungguhan (tag @tahap-N) pada tahap tersebut.
 */
const PLACEHOLDERS = [
  { id: "G2 (NYATA — Meta asli, nomor uji, staging HTTPS)", stage: 2, title: "Pesan masuk peserta uji tercatat di channel yang benar; webhook yang sama dikirim ulang tidak menggandakan pesan; coexistence: echo dari HP dikenali" },
  { id: "G3 (NYATA — Meta asli, nomor uji, staging HTTPS)", stage: 3, title: "Admin membalas dari inbox lewat nomor uji; status pesan sesuai bukti provider nyata; AI Off pada chat itu (versi SIMULASI/mock kini nyata di g3.spec.ts)" },
  { id: "G4", stage: 4, title: "AI menjawab dari Kartu Program; peserta minta manusia → eskalasi ke tim yang benar; AI Off" },
  { id: "G5 (bagian jawaban AI NYATA)", stage: 4, title: "Admin mengaktifkan AI kembali; pesan lama tidak dijawab; pesan baru dijawab OLEH AI SUNGGUHAN (bagian aktivasi versi SIMULASI kini nyata di g3.spec.ts)" },
  { id: "G6", stage: 5, title: "Label kata kunci diterapkan tanpa mengirim pesan; data pipeline dibuat dari chat dan terhubung benar" },
  { id: "G7", stage: 6, title: "FU-1 terjadwal; peserta membalas → jadwal lama dibatalkan; AI Off → tidak ada follow-up terkirim" },
  { id: "G8 (NYATA — pengiriman otomatis nyata)", stage: 3, title: "Kill switch global menghentikan pengiriman otomatis NYATA dalam < 1 menit dan tidak menyala sendiri (versi SIMULASI/mock kini nyata di g3.spec.ts)" },
];
for (const g of PLACEHOLDERS) {
  test.fixme(`${g.id} — ${g.title} [BELUM TERSEDIA — Tahap ${g.stage}]`, async () => {
    /* sengaja kosong sampai Tahap ${g.stage} */
  });
}
