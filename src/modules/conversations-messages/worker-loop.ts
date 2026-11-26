/**
 * Loop worker terpisah (A-4, S-10): memproses antrean event dan menjalankan PEMELIHARAAN berkala (`runMaintenance`).
 * Dipisahkan dari `scripts/worker.ts` agar dapat dijalankan dan diuji (sebelumnya penjadwal ini tidak pernah dijalankan oleh tes/CI).
 * `once: true` = satu siklus (kuras antrean, pemeliharaan sekali) lalu selesai — untuk uji dan pemeriksaan operator (`npm run worker -- --once`).
 */
import { safeErrorLabel } from "@/lib/safe-error";
import { processInboundBatch, runMaintenance } from "./worker";

export const MAINTENANCE_INTERVAL_MS = 60_000;
export const IDLE_SLEEP_MS = 1_000;
const ONCE_MAX_BATCHES = 10_000; // pengaman agar mode `once` pasti berakhir

export type WorkerLoopOptions = {
  once?: boolean;
  shouldStop?: () => boolean;
  maintenanceEveryMs?: number;
  idleSleepMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (msg: string) => void;
  logError?: (msg: string) => void;
};
export type WorkerLoopResult = { batches: number; claimed: number; maintenanceRuns: number; errors: number };

export async function runWorkerLoop(opts: WorkerLoopOptions = {}): Promise<WorkerLoopResult> {
  const log = opts.log ?? (() => {});
  const logError = opts.logError ?? (() => {});
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const every = opts.maintenanceEveryMs ?? MAINTENANCE_INTERVAL_MS;
  const idleMs = opts.idleSleepMs ?? IDLE_SLEEP_MS;
  const shouldStop = opts.shouldStop ?? (() => false);
  const res: WorkerLoopResult = { batches: 0, claimed: 0, maintenanceRuns: 0, errors: 0 };

  const batch = async (): Promise<number> => {
    try {
      const r = await processInboundBatch();
      res.batches++; res.claimed += r.claimed;
      if (r.claimed) log(`[worker] batch: diklaim=${r.claimed} diproses=${r.processed} karantina=${r.quarantined} gagal=${r.failed}`);
      return r.claimed;
    } catch (e) {
      res.errors++; logError(`[worker] batch gagal: ${safeErrorLabel(e)}`);
      return 0;
    }
  };
  const maintenance = async (): Promise<void> => {
    try {
      const m = await runMaintenance();
      res.maintenanceRuns++;
      if (m.purged || m.reconciled || m.expired || m.mediaRetried || m.outbox || m.jobs) log(`[worker] pemeliharaan: payload-dibersihkan=${m.purged} direkonsiliasi=${m.reconciled} diproses-tertahan->belum-pasti=${m.expired} media-diulang=${m.mediaRetried} outbox=${m.outbox} job=${m.jobs}`);
    } catch (e) {
      res.errors++; logError(`[worker] pemeliharaan gagal: ${safeErrorLabel(e)}`);
    }
  };

  if (opts.once) {
    for (let i = 0; i < ONCE_MAX_BATCHES; i++) if ((await batch()) === 0) break;
    await maintenance();
    return res;
  }
  let lastMaintenance = Number.NEGATIVE_INFINITY;
  while (!shouldStop()) {
    const claimed = await batch();
    if (now() - lastMaintenance > every) { lastMaintenance = now(); await maintenance(); }
    if (claimed === 0) await sleep(idleMs);
  }
  return res;
}
