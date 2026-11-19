import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, forbidden } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import type { Ctx } from "@/modules/shared/context";
import { mapDbError } from "@/modules/shared/db-errors";

export async function getOrgSettings() {
  const [s] = await getDb().select().from(orgSettings).where(eq(orgSettings.id, 1));
  if (!s) throw new Error("Baris org_settings tidak ada (migrasi belum dijalankan?)");
  return s;
}

const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Pengaturan organisasi adalah pengaturan keamanan/bisnis: hanya Super Admin. */
export async function updateOrgSettings(ctx: Ctx, patch: { maxChannels?: number; timezone?: string }) {
  if (!ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat mengubah pengaturan organisasi.");
  if (patch.timezone !== undefined && !validTimezone(patch.timezone)) throw badRequest("Zona waktu tidak dikenal.", undefined, "VALIDATION_ERROR");
  const before = await getOrgSettings();
  try {
    return await getDb().transaction(async (tx) => {
      const [s] = await tx.update(orgSettings).set({ ...patch, updatedAt: new Date(), updatedBy: ctx.user.id }).where(eq(orgSettings.id, 1)).returning();
      await writeAudit(tx, { ...auditFor(ctx), action: "org_settings.updated", objectType: "org_settings", objectId: "1", metadata: { before: { maxChannels: before.maxChannels, timezone: before.timezone }, after: patch } });
      return s!;
    });
  } catch (e) {
    return mapDbError(e);
  }
}
