import { and, desc, gte, ilike, lt, lte, sql } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import type { Executor } from "@/db/client";
import { getDb } from "@/db/client";
import type { Ctx } from "@/modules/shared/context";
import { forbidden } from "@/lib/errors";

export type AuditEntry = {
  actor?: { id: string; email: string } | null;
  actorLabel?: string;
  action: string;
  objectType?: string;
  objectId?: string;
  result?: "success" | "failure" | "denied";
  correlationId?: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

// Kunci yang tidak boleh masuk audit log. Isi chat lengkap juga tidak dicatat (belum ada di Tahap 1).
const SENSITIVE_KEY = /(passw|secret|token|otp|totp|recovery|hash|cookie|authorization|api[_-]?key|encryption|csrf)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[dipotong]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? value.slice(0, 500) + "…" : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[disamarkan]" : redact(v, depth + 1);
  }
  return out;
}

/** Tulis satu baris audit. Pada perubahan data, panggil dengan transaksi yang sama agar atomik. */
export async function writeAudit(ex: Executor, e: AuditEntry): Promise<void> {
  await ex.insert(auditLog).values({
    actorUserId: e.actor?.id ?? null,
    actorLabel: e.actor?.email ?? e.actorLabel ?? "sistem",
    action: e.action,
    objectType: e.objectType ?? "",
    objectId: e.objectId ?? "",
    result: e.result ?? "success",
    correlationId: e.correlationId ?? "",
    ip: e.ip ?? null,
    metadata: redact(e.metadata ?? {}) as Record<string, unknown>,
  });
}

export const auditFor = (ctx: { user: { id: string; email: string }; correlationId: string; ip: string | null }) => ({
  actor: { id: ctx.user.id, email: ctx.user.email },
  correlationId: ctx.correlationId,
  ip: ctx.ip,
});

export type AuditFilter = { action?: string; actor?: string; from?: Date; to?: Date; beforeId?: number; limit?: number };

export async function listAudit(ctx: Ctx, f: AuditFilter = {}) {
  if (!ctx.perms.can("audit.view")) throw forbidden();
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const conds = [
    f.action ? ilike(auditLog.action, `${f.action.replace(/[%_]/g, "")}%`) : undefined,
    f.actor ? ilike(auditLog.actorLabel, `%${f.actor.replace(/[%_]/g, "")}%`) : undefined,
    f.from ? gte(auditLog.occurredAt, f.from) : undefined,
    f.to ? lte(auditLog.occurredAt, f.to) : undefined,
    f.beforeId ? lt(auditLog.id, f.beforeId) : undefined,
  ].filter(Boolean);
  const rows = await getDb()
    .select()
    .from(auditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit), nextBeforeId: hasMore ? rows[limit - 1]?.id : null };
}

export async function countAudit(): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(auditLog);
  return r?.n ?? 0;
}
