/**
 * Observabilitas endpoint webhook WhatsApp (temuan G3-T01).
 *
 * Satu baris log terstruktur (JSON) per respons endpoint. Yang BOLEH dicatat hanya data yang ditetapkan di sini:
 * metode, kode status, alasan (enum tetap), ukuran body (byte), hitungan hasil simpan, dan label error aman.
 * TIDAK PERNAH dicatat: payload/body, header tanda tangan, verify token, challenge, nomor telepon, isi pesan,
 * ID pesan, atau pesan error mentah (AGENTS §3.4, §3.5, §9). Fungsi ini tidak menerima objek Request/body sama sekali,
 * sehingga kebocoran tidak mungkin terjadi lewat pemanggil yang lalai.
 *
 * Selain log, disediakan penghitung DALAM MEMORI per jam (24 slot) untuk dibaca Super Admin di halaman Integrasi.
 * Batas jujur: penghitung milik proses web, kembali ke nol saat proses dimulai ulang, dan tidak dijumlahkan antar-replika.
 */

export const WEBHOOK_REASONS = {
  // POST
  ok: 200,
  flag_off: 404,
  secret_missing: 503,
  too_large: 413,
  signature_missing: 401,
  signature_invalid: 401,
  not_json: 400,
  store_failed: 500,
  // GET (verifikasi langganan oleh Meta)
  challenge_ok: 200,
  challenge_rejected: 403,
} as const;
export type WebhookReason = keyof typeof WEBHOOK_REASONS;

export type WebhookCounts = { received: number; stored: number; duplicates: number; quarantined: number };
export type WebhookOutcome = {
  method: "GET" | "POST";
  reason: WebhookReason;
  /** Ukuran body dalam byte (bila sudah dibaca / dinyatakan). Bukan isi body. */
  bytes?: number;
  counts?: WebhookCounts;
  /** Label dari `safeErrorLabel` — tidak pernah pesan error mentah. */
  error?: string;
};

const SAFE_ERROR = /^[\w:.-]{1,80}$/;
const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined);

/** Menyusun baris log. Hanya field dari daftar putih; nilai divalidasi agar string bebas tidak dapat masuk. */
export function formatWebhookLog(o: WebhookOutcome, now = new Date()): string {
  const status = WEBHOOK_REASONS[o.reason];
  const line: Record<string, unknown> = { evt: "webhook.whatsapp", ts: now.toISOString(), method: o.method === "GET" ? "GET" : "POST", status, reason: o.reason };
  const bytes = int(o.bytes);
  if (bytes !== undefined) line.bytes = bytes;
  if (o.counts) line.counts = { received: int(o.counts.received) ?? 0, stored: int(o.counts.stored) ?? 0, duplicates: int(o.counts.duplicates) ?? 0, quarantined: int(o.counts.quarantined) ?? 0 };
  if (o.error) line.error = SAFE_ERROR.test(o.error) ? o.error : "label_tidak_aman";
  return `[webhook] ${JSON.stringify(line)}`;
}

// ── Penghitung 24 jam (memori proses) ──────────────────────────────────────────────────────────────
const HOUR = 3_600_000;
const SLOTS = 24;
type Bucket = { hour: number; byReason: Partial<Record<WebhookReason, number>> };
type Store = { startedAt: number; buckets: Bucket[] };
// Disimpan di globalThis agar route handler dan halaman (bundel berbeda di Next.js) berbagi satu penghitung per proses.
const KEY = Symbol.for("te-one.webhook-whatsapp.counter");
const g = globalThis as unknown as Record<symbol, Store | undefined>;
const store = (): Store => (g[KEY] ??= { startedAt: Date.now(), buckets: [] });

function count(reason: WebhookReason, nowMs: number) {
  const s = store();
  const hour = Math.floor(nowMs / HOUR);
  let b = s.buckets[s.buckets.length - 1];
  if (!b || b.hour !== hour) {
    b = { hour, byReason: {} };
    s.buckets.push(b);
  }
  b.byReason[reason] = (b.byReason[reason] ?? 0) + 1;
  s.buckets = s.buckets.filter((x) => x.hour > hour - SLOTS);
}

export type WebhookCounterSnapshot = {
  /** Sejak kapan proses ini menghitung (penghitung kembali ke nol saat restart). */
  since: Date;
  windowHours: number;
  byReason: Partial<Record<WebhookReason, number>>;
  /** Jumlah respons non-sukses (status ≥ 400) dalam jendela. */
  rejected: number;
  accepted: number;
  /** Waktu (awal jam) penolakan terakhir dalam jendela, atau null. */
  lastRejectedHour: Date | null;
};

export function webhookCounterSnapshot(nowMs = Date.now()): WebhookCounterSnapshot {
  const s = store();
  const hour = Math.floor(nowMs / HOUR);
  const byReason: Partial<Record<WebhookReason, number>> = {};
  let rejected = 0;
  let accepted = 0;
  let lastRejectedHour: Date | null = null;
  for (const b of s.buckets) {
    if (b.hour <= hour - SLOTS) continue;
    for (const [r, n] of Object.entries(b.byReason) as [WebhookReason, number][]) {
      byReason[r] = (byReason[r] ?? 0) + n;
      if (WEBHOOK_REASONS[r] >= 400) {
        rejected += n;
        lastRejectedHour = new Date(b.hour * HOUR);
      } else accepted += n;
    }
  }
  return { since: new Date(s.startedAt), windowHours: SLOTS, byReason, rejected, accepted, lastRejectedHour };
}

/** Hanya untuk test. */
export function resetWebhookCounterForTests() {
  g[KEY] = { startedAt: Date.now(), buckets: [] };
}

/**
 * Mencatat hasil endpoint: satu baris log + penghitung. Non-sukses → `console.warn`, kegagalan simpan → `console.error`,
 * sukses → stdout (level info; aturan lint proyek hanya mengizinkan console.warn/error). Pencatatan tidak pernah melempar error (tidak boleh mengubah respons endpoint).
 */
export function recordWebhookOutcome(o: WebhookOutcome, nowMs = Date.now()): void {
  try {
    count(o.reason, nowMs);
    const line = formatWebhookLog(o, new Date(nowMs));
    const status = WEBHOOK_REASONS[o.reason];
    if (status >= 500) console.error(line);
    else if (status >= 400) console.warn(line);
    else process.stdout.write(`${line}\n`);
  } catch {
    /* observabilitas tidak boleh mengganggu jalur webhook */
  }
}
