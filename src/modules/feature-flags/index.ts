import { eq } from "drizzle-orm";
import { featureFlagOverrides } from "@/db/schema";
import { getDb } from "@/db/client";
import { AppError, badRequest, forbidden } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import type { Ctx } from "@/modules/shared/context";

/**
 * Registri feature flag. SEMUA default MATI (AGENTS.md §10.4) sampai tahapnya diterima.
 * Nilai disimpan per database, sehingga otomatis terpisah per lingkungan (development/staging/production).
 */
export const FEATURE_FLAGS = [
  { key: "whatsapp_connector", label: "Konektor WhatsApp", stage: 2 },
  { key: "inbox", label: "Inbox & routing", stage: 3 },
  { key: "ai_agents", label: "AI agent", stage: 4 },
  { key: "labels_pipelines", label: "Label, pipeline & laporan", stage: 5 },
  { key: "follow_up", label: "Template & follow-up", stage: 6 },
  { key: "sample_feature", label: "Contoh fitur (khusus uji mekanisme flag)", stage: 1 },
] as const;
export type FeatureKey = (typeof FEATURE_FLAGS)[number]["key"];
const KEYS = new Set<string>(FEATURE_FLAGS.map((f) => f.key));

/** Fail-closed: kunci tak dikenal, atau error membaca database → dianggap MATI. */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  if (!KEYS.has(key)) return false;
  try {
    const [r] = await getDb().select({ enabled: featureFlagOverrides.enabled }).from(featureFlagOverrides).where(eq(featureFlagOverrides.key, key));
    return r?.enabled ?? false;
  } catch {
    return false;
  }
}

/** Dipakai di awal endpoint/worker fitur baru. Flag mati → fitur seolah tidak ada. */
export async function requireFeature(key: FeatureKey): Promise<void> {
  if (!(await isFeatureEnabled(key))) throw new AppError(404, "FEATURE_DISABLED", "Fitur ini belum tersedia.");
}

export async function listFlags(ctx: Ctx) {
  if (!ctx.user.isSuperAdmin) throw forbidden();
  const rows = await getDb().select().from(featureFlagOverrides);
  return FEATURE_FLAGS.map((f) => ({ ...f, enabled: rows.find((r) => r.key === f.key)?.enabled ?? false }));
}

export async function setFlag(ctx: Ctx, key: string, enabled: boolean) {
  if (!ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat mengubah feature flag.");
  if (!KEYS.has(key)) throw badRequest("Feature flag tidak dikenal.", undefined, "UNKNOWN_FLAG");
  await getDb().transaction(async (tx) => {
    await tx.insert(featureFlagOverrides).values({ key, enabled, updatedBy: ctx.user.id }).onConflictDoUpdate({ target: featureFlagOverrides.key, set: { enabled, updatedBy: ctx.user.id, updatedAt: new Date() } });
    await writeAudit(tx, { ...auditFor(ctx), action: "feature_flag.changed", objectType: "feature_flag", objectId: key, metadata: { enabled } });
  });
}
