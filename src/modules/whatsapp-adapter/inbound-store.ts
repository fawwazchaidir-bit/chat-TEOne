/**
 * Antrean event masuk berbasis PostgreSQL (ADR-0002).
 *  - storeEvents(): satu transaksi per payload; event DISIMPAN sebelum respons sukses (kontrak inti #3). Dedup oleh
 *    UNIQUE(provider, event_key). Channel tak dikenal / WABA tak cocok → KARANTINA (tidak pernah masuk channel lain).
 *  - claimBatch(): FOR UPDATE SKIP LOCKED + lease; pekerjaan dengan lease habis (worker mati) diambil ulang.
 *  - failEvent(): backoff, lalu status `failed` (dapat diproses ulang manual). Tidak ada retry tanpa batas.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { channelConnections, inboundEvents } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { safeErrorLabel } from "@/lib/safe-error";
import type { NormalizedEvent } from "./normalize";

export type StoreResult = { received: number; stored: number; duplicates: number; quarantined: number };
export const MAX_ATTEMPTS = 5;
export const RAW_PAYLOAD_RETENTION_DAYS = 30; // ASUMSI (D-18): usulan, belum diputuskan

export async function storeEvents(events: NormalizedEvent[]): Promise<StoreResult> {
  return getDb().transaction(async (tx) => {
    const phoneIds = [...new Set(events.map((e) => e.meta.phoneNumberId).filter((x): x is string => !!x))];
    const conns = phoneIds.length
      ? await tx.select({ channelId: channelConnections.channelId, wabaId: channelConnections.wabaId, phoneNumberId: channelConnections.phoneNumberId }).from(channelConnections).where(inArray(channelConnections.phoneNumberId, phoneIds))
      : [];
    const byPhone = new Map(conns.map((c) => [c.phoneNumberId, c]));
    const r: StoreResult = { received: events.length, stored: 0, duplicates: 0, quarantined: 0 };
    for (const ev of events) {
      const conn = ev.meta.phoneNumberId ? byPhone.get(ev.meta.phoneNumberId) : undefined;
      let channelId: string | null = null;
      let status: "pending" | "quarantined" = "pending";
      let reason: string | null = null;
      let payload: unknown = ev;
      if (ev.kind === "unknown") { status = "quarantined"; reason = `bentuk_tidak_dikenal:${ev.reason}`; payload = { field: ev.field, reason: ev.reason }; }
      else if (!conn) { status = "quarantined"; reason = "channel_tidak_dikenal"; }
      else if (ev.meta.wabaId && conn.wabaId !== ev.meta.wabaId) { status = "quarantined"; reason = "waba_tidak_cocok"; }
      else channelId = conn.channelId;
      const inserted = await tx
        .insert(inboundEvents)
        .values({
          eventKey: ev.eventKey, kind: ev.kind, channelId, wabaId: ev.meta.wabaId, phoneNumberId: ev.meta.phoneNumberId,
          payload: payload as Record<string, unknown>, status, quarantineReason: reason,
          providerTs: ev.providerTs ? new Date(ev.providerTs) : null, processedAt: status === "quarantined" ? new Date() : null,
        })
        .onConflictDoNothing({ target: [inboundEvents.provider, inboundEvents.eventKey] })
        .returning({ id: inboundEvents.id });
      if (inserted.length === 0) r.duplicates++;
      else { r.stored++; if (status === "quarantined") r.quarantined++; }
    }
    return r;
  });
}

export type ClaimedEvent = { id: number; kind: string; channelId: string | null; payload: NormalizedEvent; attempts: number };

export async function claimBatch(limit = 20, leaseMs = 60_000, now: Date = new Date()): Promise<ClaimedEvent[]> {
  const until = new Date(now.getTime() + leaseMs);
  const res = await getDb().execute(sql`
    UPDATE inbound_events SET status = 'processing', locked_until = ${until}, attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM inbound_events
      WHERE (status = 'pending' AND run_after <= ${now}) OR (status = 'processing' AND locked_until < ${now})
      ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind, channel_id, payload, attempts`);
  return (res.rows as { id: string | number; kind: string; channel_id: string | null; payload: NormalizedEvent; attempts: number }[])
    .map((r) => ({ id: Number(r.id), kind: r.kind, channelId: r.channel_id, payload: r.payload, attempts: r.attempts }))
    .sort((a, b) => a.id - b.id);
}

export const markProcessed = (ex: Executor, id: number, opts: { dropPayload?: boolean } = {}) =>
  ex.update(inboundEvents).set({ status: "processed", processedAt: new Date(), lockedUntil: null, lastError: null, ...(opts.dropPayload ? { payload: null } : {}) }).where(eq(inboundEvents.id, id));

export const markQuarantined = (ex: Executor, id: number, reason: string, opts: { dropPayload?: boolean } = {}) =>
  ex.update(inboundEvents).set({ status: "quarantined", quarantineReason: reason, processedAt: new Date(), lockedUntil: null, ...(opts.dropPayload ? { payload: null } : {}) }).where(eq(inboundEvents.id, id));

/** Gagal diproses: backoff eksponensial; setelah MAX_ATTEMPTS → `failed` (menunggu pemrosesan ulang manual). Hanya label error aman (kode), tanpa pesan/payload. */
export async function failEvent(id: number, error: unknown): Promise<void> {
  const msg = safeErrorLabel(error); // BUKAN error.message: pesan driver memuat parameter query (isi chat)
  await getDb().execute(sql`
    UPDATE inbound_events SET
      status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
      run_after = now() + (least(3600, 30 * power(2, greatest(attempts - 1, 0))) * interval '1 second'),
      locked_until = NULL, last_error = ${msg}
    WHERE id = ${id}`);
}

/** Memproses ulang event gagal/terkarantina. Karantina `channel_*`/`waba_*` hanya bila pemetaan kini sudah ada. */
export async function requeueEvent(id: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb();
  const [ev] = await db.select().from(inboundEvents).where(eq(inboundEvents.id, id));
  if (!ev) return { ok: false, reason: "tidak_ditemukan" };
  if (ev.status !== "failed" && ev.status !== "quarantined") return { ok: false, reason: "status_tidak_dapat_diulang" };
  if (!ev.payload) return { ok: false, reason: "payload_sudah_dihapus_oleh_retensi" };
  let channelId = ev.channelId;
  if (ev.status === "quarantined") {
    if (!/^(channel_tidak_dikenal|waba_tidak_cocok)$/.test(ev.quarantineReason ?? "")) return { ok: false, reason: "karantina_ini_tidak_dapat_diulang" };
    const [conn] = ev.phoneNumberId ? await db.select().from(channelConnections).where(and(eq(channelConnections.phoneNumberId, ev.phoneNumberId))) : [];
    if (!conn || (ev.wabaId && conn.wabaId !== ev.wabaId)) return { ok: false, reason: "channel_belum_dipetakan" };
    channelId = conn.channelId;
  }
  await db.update(inboundEvents).set({ status: "pending", attempts: 0, runAfter: new Date(), lockedUntil: null, lastError: null, quarantineReason: null, processedAt: null, channelId }).where(eq(inboundEvents.id, id));
  return { ok: true };
}

/** Retensi payload mentah (D-18, ASUMSI ≤ 30 hari): payload di-NULL-kan, baris & status tetap untuk jejak. */
export async function purgeRawPayloads(days = RAW_PAYLOAD_RETENTION_DAYS): Promise<number> {
  const res = await getDb().execute(sql`
    UPDATE inbound_events SET payload = NULL
    WHERE payload IS NOT NULL AND status IN ('processed','failed','quarantined') AND received_at < now() - (${days} * interval '1 day')`);
  return res.rowCount ?? 0;
}
