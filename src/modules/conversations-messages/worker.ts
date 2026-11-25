/**
 * Pemroses antrean event (ADR-0002). Aman dijalankan oleh >1 proses sekaligus (SKIP LOCKED) dan tahan restart (lease).
 * `kickProcessing()` = pemicu opsional di proses web (WORKER_INLINE=true): HANYA memproses antrean event, berbasis kejadian (tanpa timer).
 * Pemeliharaan berkala (`runMaintenance`: retensi payload D-18, penyapu/rekonsiliasi, ulang media, fallback outbox) HANYA berjalan di
 * `scripts/worker.ts` — proses terpisah yang diperlukan di staging/production (S-10, A-4).
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

/** Satu putaran kick memproses paling banyak segini batch berurutan (20 event/batch ⇒ 200 event). Bila tercapai, putaran berikutnya dijalankan. */
export const KICK_BATCHES_PER_ROUND = 10;
const KICK_RETRY_DELAY_MS = 5_000;
const KICK_MAX_ERROR_RETRIES = 5;

export type KickDeps = {
  enabled: () => boolean;
  processBatch: () => Promise<{ claimed: number }>;
  /** Menyerahkan giliran ke event loop di antara putaran penuh agar permintaan web lain tidak terblokir. */
  yieldNow?: () => Promise<void>;
  log?: (msg: string) => void;
  retryDelayMs?: number;
  maxErrorRetries?: number;
};

/**
 * Pemicu pemrosesan inline (G2-B03). Prinsip: kick yang datang saat putaran berjalan TIDAK boleh hilang — ia menandai `dirty`
 * ("ada kerja baru") dan putaran yang sedang berjalan mengulang sebelum selesai. Pemeriksaan `dirty`, keluar loop, dan `running = null`
 * terjadi tanpa `await` di antaranya, sehingga tidak ada celah di mana kick terbaru terlewat. Bila batas putaran tercapai dan masih
 * mungkin ada event (batch terakhir tidak kosong), putaran berikutnya dijadwalkan setelah menyerahkan giliran ke event loop.
 * Galat sementara (mis. DB terputus) dicoba ulang tertunda maksimal `maxErrorRetries` kali berturut-turut, lalu menunggu kick berikutnya.
 */
export function createKicker(deps: KickDeps) {
  const yieldNow = deps.yieldNow ?? (() => new Promise<void>((r) => setImmediate(r)));
  const retryDelayMs = deps.retryDelayMs ?? KICK_RETRY_DELAY_MS;
  const maxErrorRetries = deps.maxErrorRetries ?? KICK_MAX_ERROR_RETRIES;
  let running: Promise<void> | null = null;
  let dirty = false;
  let errorRetries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function loop(): Promise<void> {
    try {
      while (dirty) {
        dirty = false;
        let drained = false;
        for (let i = 0; i < KICK_BATCHES_PER_ROUND; i++) {
          if ((await deps.processBatch()).claimed === 0) { drained = true; break; }
        }
        if (!drained) { dirty = true; await yieldNow(); }
      }
      errorRetries = 0;
    } catch (e) {
      deps.log?.(`[worker] kick gagal: ${safeErrorLabel(e)}`);
      dirty = false;
      if (errorRetries < maxErrorRetries && !retryTimer) {
        errorRetries++;
        retryTimer = setTimeout(() => { retryTimer = null; kick(); }, retryDelayMs);
        retryTimer.unref?.();
      } else if (errorRetries >= maxErrorRetries) {
        errorRetries = 0; // menyerah sampai kick berikutnya
      }
    } finally {
      running = null;
    }
  }

  function kick(): void {
    if (!deps.enabled()) return;
    dirty = true;
    if (running) return; // putaran yang berjalan akan melihat `dirty`
    running = loop();
  }

  return {
    kick,
    /** Hanya untuk uji: selesai bila tidak ada putaran berjalan (percobaan ulang tertunda tidak ditunggu). */
    idle: (): Promise<void> => running ?? Promise.resolve(),
    /** Hanya untuk uji. */
    state: () => ({ running: running !== null, dirty, retryScheduled: retryTimer !== null }),
  };
}

const inlineKicker = createKicker({
  enabled: () => getEnv().WORKER_INLINE === "true",
  processBatch: () => processInboundBatch(),
  log: (m) => console.error(m),
});
export const kickProcessing = (): void => inlineKicker.kick();
/** Hanya untuk uji. */
export const waitForKickIdle = (): Promise<void> => inlineKicker.idle();

/** Pemeliharaan berkala: retensi payload (D-18 Diputuskan), rekonsiliasi hasil belum pasti, ulangi unduhan media tertunda. Hanya dipanggil oleh worker-loop (scripts/worker.ts). */
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
