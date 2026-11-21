/**
 * Pemroses antrean event (ADR-0002). Aman dijalankan oleh >1 proses sekaligus (SKIP LOCKED) dan tahan restart (lease).
 * `kickProcessing()` = pemicu opsional di proses web (WORKER_INLINE=true) agar penyebaran satu-kontainer tetap berjalan;
 * `scripts/worker.ts` = proses terpisah yang disarankan di staging/production.
 */
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { safeErrorLabel } from "@/lib/safe-error";
import { claimBatch, failEvent, markProcessed, markQuarantined, purgeRawPayloads } from "@/modules/whatsapp-adapter";
import { ingestEvent } from "./ingest";
import { dispatchOutbox } from "./outbox";
import { retryPendingMedia } from "./media";
import { reconcileUncertain } from "./reconcile";

export type BatchResult = { claimed: number; processed: number; quarantined: number; failed: number };

export async function processInboundBatch(opts: { limit?: number; leaseMs?: number; now?: Date } = {}): Promise<BatchResult> {
  const events = await claimBatch(opts.limit ?? 20, opts.leaseMs ?? 60_000, opts.now); // tanpa `now` eksplisit → jam database
  const r: BatchResult = { claimed: events.length, processed: 0, quarantined: 0, failed: 0 };
  for (const ev of events) {
    try {
      // Pemrosesan + penandaan `processed` dalam SATU transaksi: gagal di tengah ⇒ rollback, event tetap 'processing' sampai lease habis.
      const outcome = await getDb().transaction(async (tx) => {
        const o = await ingestEvent(tx, ev);
        if (o.kind === "quarantined") await markQuarantined(tx, ev.id, o.reason, { dropPayload: !o.keepPayload }); // data minimal: payload dibuang (kecuali konflik identitas: dipertahankan untuk ditinjau; dibatasi retensi)
        else await markProcessed(tx, ev.id, { dropPayload: o.dropPayload });
        return o;
      });
      if (outcome.kind === "quarantined") r.quarantined++;
      else {
        r.processed++;
        for (const job of outcome.after) {
          try { await job(); } catch { console.error(`[worker] tugas pasca-commit gagal untuk event ${ev.id}`); } // tidak menggagalkan event
        }
      }
    } catch (e) {
      r.failed++;
      await failEvent(ev.id, e);
      console.error(`[worker] event ${ev.id} gagal: ${safeErrorLabel(e)}`); // tanpa pesan/payload
    }
  }
  return r;
}

let kicking = false;
export function kickProcessing(): void {
  if (getEnv().WORKER_INLINE !== "true" || kicking) return;
  kicking = true;
  void (async () => {
    try {
      for (let i = 0; i < 10; i++) if ((await processInboundBatch()).claimed === 0) break;
    } catch (e) {
      console.error(`[worker] kick gagal: ${safeErrorLabel(e)}`);
    } finally {
      kicking = false;
    }
  })();
}

/** Pemeliharaan berkala: retensi payload (D-18, ASUMSI), rekonsiliasi hasil belum pasti, ulangi unduhan media tertunda. */
export async function runMaintenance(): Promise<{ purged: number; reconciled: number; expired: number; mediaRetried: number; outbox: number; jobs: number }> {
  const purged = await purgeRawPayloads();
  const rec = await reconcileUncertain(); // juga menandai `diproses` yang tertahan sebagai `belum_pasti` (G2-A06)
  const mediaRetried = await retryPendingMedia();
  // Tahap 3: kirim ulang event outbox yang tertinggal (proses mati setelah commit) dan jalankan job otomatisasi yang jatuh tempo.
  const outbox = (await dispatchOutbox()).delivered;
  const { runDueAutomationJobs } = await import("@/modules/automation");
  const jobs = (await runDueAutomationJobs()).ran;
  return { purged, reconciled: rec.resolved, expired: rec.expired, mediaRetried, outbox, jobs };
}
