/**
 * Pembatas kecepatan kirim per `phone_number_id` (token bucket, dalam-proses). Batas = pengaturan per koneksi.
 * Keterbatasan: per-proses (satu instans aplikasi). Untuk >1 instans pembatasan harus dipindah ke database/Redis.
 */
type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

export async function acquireSendSlot(key: string, perSec: number, opts: { maxWaitMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}): Promise<boolean> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + (opts.maxWaitMs ?? 2000);
  const cap = Math.max(1, perSec);
  for (;;) {
    const t = now();
    const b = buckets.get(key) ?? { tokens: cap, last: t };
    b.tokens = Math.min(cap, b.tokens + ((t - b.last) / 1000) * cap);
    b.last = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      buckets.set(key, b);
      return true;
    }
    buckets.set(key, b);
    if (t >= deadline) return false;
    await sleep(Math.min(100, Math.ceil(((1 - b.tokens) / cap) * 1000)));
  }
}

export const resetRateLimiterForTests = () => buckets.clear();
