/**
 * Worker antrean event masuk (ADR-0002) — proses TERPISAH yang disarankan di staging/production (set WORKER_INLINE=false pada web).
 * Aman dijalankan >1 replika (FOR UPDATE SKIP LOCKED) dan tahan restart (lease). Shutdown halus pada SIGTERM/SIGINT.
 */
import { closeDb } from "../src/db/client";
import { safeErrorLabel } from "../src/lib/safe-error";
import { processInboundBatch, runMaintenance } from "../src/modules/conversations-messages";

let stop = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { console.log(`[worker] ${sig} diterima, berhenti setelah batch ini`); stop = true; });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  console.log("[worker] mulai");
  let lastMaintenance = 0;
  while (!stop) {
    let claimed = 0;
    try {
      const r = await processInboundBatch();
      claimed = r.claimed;
      if (r.claimed) console.log(`[worker] batch: diklaim=${r.claimed} diproses=${r.processed} karantina=${r.quarantined} gagal=${r.failed}`);
    } catch (e) {
      console.error(`[worker] batch gagal: ${safeErrorLabel(e)}`);
    }
    if (Date.now() - lastMaintenance > 60_000) {
      lastMaintenance = Date.now();
      try {
        const m = await runMaintenance();
        if (m.purged || m.reconciled || m.mediaRetried) console.log(`[worker] pemeliharaan: payload-dibersihkan=${m.purged} direkonsiliasi=${m.reconciled} media-diulang=${m.mediaRetried}`);
      } catch (e) {
        console.error(`[worker] pemeliharaan gagal: ${safeErrorLabel(e)}`);
      }
    }
    if (claimed === 0) await sleep(1000);
  }
  await closeDb();
  console.log("[worker] berhenti");
}
main().catch((e) => { console.error(`[worker] fatal: ${safeErrorLabel(e)}`); process.exit(1); });
