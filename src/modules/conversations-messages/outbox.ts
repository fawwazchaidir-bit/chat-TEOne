/**
 * Outbox DURABLE untuk event domain (menutup T2-F15; ADR-0008). Event ditulis DALAM transaksi yang sama dengan datanya (pesan
 * pelanggan), sehingga tidak hilang walau proses mati setelah commit. Pengiriman ke subscriber bersifat MINIMAL-SEKALI (at-least-once):
 * subscriber WAJIB idempoten (job otomatisasi memakai kunci unik per pesan pemicu). Gagal → backoff; setelah batas → `failed` (terlihat).
 */
import { sql } from "drizzle-orm";
import { domainOutbox } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { safeErrorLabel } from "@/lib/safe-error";
import { deliverCustomerMessage, type CustomerMessageEvent } from "./events";

export const OUTBOX_MAX_ATTEMPTS = 5;

export async function enqueueCustomerMessage(tx: Executor, e: CustomerMessageEvent): Promise<void> {
  await tx.insert(domainOutbox).values({ kind: "customer_message", payload: e });
}

/**
 * Subscriber otomatisasi hidup di modul `automation` (lapisan lebih tinggi). Impor dinamis memutus siklus modul dan memastikan
 * pendaftarannya terjadi di proses mana pun yang mengirimkan outbox (web inline maupun worker terpisah).
 */
async function ensureSubscribers(): Promise<void> {
  await import("@/modules/automation");
}

/** Mengirim event outbox yang tertunda. Aman dijalankan bersamaan (SKIP LOCKED) dan setelah restart (lease). */
export async function dispatchOutbox(opts: { limit?: number } = {}): Promise<{ delivered: number; failed: number }> {
  await ensureSubscribers();
  const db = getDb();
  const res = await db.execute(sql`
    UPDATE domain_outbox SET status = 'processing', locked_until = now() + interval '60 seconds', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM domain_outbox
      WHERE (status = 'pending' AND run_after <= now()) OR (status = 'processing' AND locked_until < now())
      ORDER BY id LIMIT ${opts.limit ?? 50} FOR UPDATE SKIP LOCKED)
    RETURNING id, payload, attempts`);
  const rows = (res.rows as { id: string | number; payload: CustomerMessageEvent; attempts: number }[]).map((r) => ({ id: Number(r.id), payload: r.payload, attempts: r.attempts })).sort((a, b) => a.id - b.id);
  let delivered = 0, failed = 0;
  for (const r of rows) {
    try {
      const out = await deliverCustomerMessage(r.payload);
      if (out.failed > 0) throw new Error(`${out.failed} subscriber gagal`);
      await db.execute(sql`UPDATE domain_outbox SET status = 'delivered', delivered_at = now(), locked_until = NULL, last_error = NULL WHERE id = ${r.id}`);
      delivered++;
    } catch (e) {
      failed++;
      const last = safeErrorLabel(e);
      if (r.attempts >= OUTBOX_MAX_ATTEMPTS) await db.execute(sql`UPDATE domain_outbox SET status = 'failed', locked_until = NULL, last_error = ${last} WHERE id = ${r.id}`);
      else await db.execute(sql`UPDATE domain_outbox SET status = 'pending', locked_until = NULL, last_error = ${last}, run_after = now() + (${Math.min(300, 2 ** r.attempts * 5)} * interval '1 second') WHERE id = ${r.id}`);
    }
  }
  return { delivered, failed };
}
