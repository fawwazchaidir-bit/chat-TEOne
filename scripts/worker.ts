/**
 * Worker antrean event masuk (ADR-0002) — proses TERPISAH yang diperlukan di staging/production (A-4; set WORKER_INLINE=false pada web
 * bila diinginkan). Hanya proses ini yang menjalankan pemeliharaan berkala (retensi payload D-18, penyapu/rekonsiliasi, ulang media, fallback outbox).
 * Aman dijalankan >1 replika (FOR UPDATE SKIP LOCKED) dan tahan restart (lease). Shutdown halus pada SIGTERM/SIGINT.
 * `npm run worker -- --once` = satu siklus (kuras antrean + pemeliharaan sekali) lalu keluar; kode keluar ≠ 0 bila ada galat.
 */
import { closeDb } from "../src/db/client";
import { safeErrorLabel } from "../src/lib/safe-error";
import { runWorkerLoop } from "../src/modules/conversations-messages/worker-loop";

let stop = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { console.log(`[worker] ${sig} diterima, berhenti setelah batch ini`); stop = true; });
const once = process.argv.includes("--once");

async function main() {
  console.log(once ? "[worker] mulai (satu siklus)" : "[worker] mulai");
  const r = await runWorkerLoop({ once, shouldStop: () => stop, log: (m) => console.log(m), logError: (m) => console.error(m) });
  await closeDb();
  console.log(`[worker] berhenti (batch=${r.batches} diklaim=${r.claimed} pemeliharaan=${r.maintenanceRuns} galat=${r.errors})`);
  if (once && r.errors > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(`[worker] fatal: ${safeErrorLabel(e)}`); process.exit(1); });
