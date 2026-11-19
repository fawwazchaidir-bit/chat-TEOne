/**
 * Diagnostik koneksi Meta — jalankan di staging SEBELUM uji nyata pertama (dan setiap kali ada yang aneh):
 *   npm run meta:check
 * Memeriksa kelengkapan variabel, lalu setiap koneksi channel ke Graph API (token valid? phone_number_id milik WABA? aplikasi
 * berlangganan WABA?). Keluaran TIDAK memuat rahasia. Kode keluar ≠ 0 bila ada masalah.
 * Hasil berstatus "nyata" HANYA bila META_GRAPH_BASE_URL = graph.facebook.com.
 */
import { closeDb, getDb } from "../src/db/client";
import { channelConnections } from "../src/db/schema";
import { getEnv } from "../src/lib/env";
import { getMetaConfig, isRealMetaEndpoint, runVerification } from "../src/modules/whatsapp-adapter";

const FIELDS = ["messages", "smb_message_echoes", "history", "smb_app_state_sync"];

async function main() {
  const env = getEnv();
  const cfg = getMetaConfig();
  let problems = 0;
  const flag = (ok: boolean, label: string, hint = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${!ok && hint ? ` — ${hint}` : ""}`); if (!ok) problems++; };
  console.log(`Lingkungan: ${env.APP_ENV} · Graph ${cfg.apiVersion} · endpoint ${isRealMetaEndpoint(cfg) ? "META ASLI" : "MOCK/BUKAN META (hasil = SIMULASI)"}`);
  flag(!!cfg.appSecret, "META_APP_SECRET terisi", "tanpa ini webhook menolak semua permintaan");
  flag(!!cfg.verifyToken, "META_VERIFY_TOKEN terisi", "dipakai Meta saat memverifikasi URL webhook");
  flag(!!cfg.accessToken, "META_ACCESS_TOKEN terisi", "dipakai untuk kirim pesan, unduh media, dan pemeriksaan ini");
  flag(env.APP_BASE_URL.startsWith("https://") || env.APP_ENV === "development", "APP_BASE_URL https", "Meta mewajibkan URL webhook HTTPS publik");
  console.log(`\nURL callback webhook yang didaftarkan di dashboard aplikasi Meta (milik TE One):\n  ${env.APP_BASE_URL}/api/webhooks/whatsapp`);
  console.log(`Field webhook yang perlu di-subscribe: ${FIELDS.join(", ")}  (nama field coexistence: verifikasi ke dokumentasi Meta terbaru)\n`);

  const conns = await getDb().select().from(channelConnections);
  if (conns.length === 0) console.log("Belum ada koneksi channel (isi lewat halaman Channel → Koneksi WhatsApp).");
  for (const c of conns) {
    const r = await runVerification(c);
    console.log(`Channel ${c.channelId.slice(0, 8)}… [${r.mode.toUpperCase()}] ${r.verified ? "✔ terverifikasi" : "✘ gagal"}  · nomor ${r.detail.phone.display ?? "-"} · webhook berlangganan: ${r.detail.webhookSubscribed === null ? "tidak diketahui" : r.detail.webhookSubscribed ? "ya" : "TIDAK"}`);
    for (const p of r.detail.problems) { console.log(`   - ${p}`); problems++; }
    if (!r.verified && r.detail.problems.length === 0) problems++;
  }
  console.log(problems ? `\n${problems} masalah ditemukan.` : "\nTidak ada masalah pada pemeriksaan ini (belum membuktikan penerimaan pesan nyata — jalankan uji dengan nomor uji).");
  process.exitCode = problems ? 1 : 0;
}
main().catch((e) => { console.error("Gagal menjalankan pemeriksaan:", (e as Error).name); process.exit(1); }).finally(closeDb);
