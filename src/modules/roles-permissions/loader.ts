import { eq } from "drizzle-orm";
import { roleGrants, userGrants, userRoles } from "@/db/schema";
import type { Executor } from "@/db/client";
import { PermissionSet, type GrantInput } from "./engine";

/** Membaca izin efektif dari database pada SETIAP permintaan, sehingga perubahan izin langsung berlaku. */
export async function loadPermissionSet(ex: Executor, userId: string, isSuperAdmin: boolean): Promise<PermissionSet> {
  if (isSuperAdmin) return new PermissionSet(true);
  const fromRoles = await ex
    .select({ permission: roleGrants.permission, scopeAll: roleGrants.scopeAll, channelIds: roleGrants.channelIds })
    .from(userRoles)
    .innerJoin(roleGrants, eq(roleGrants.roleId, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const direct = await ex.select().from(userGrants).where(eq(userGrants.userId, userId));
  const allows: GrantInput[] = [...fromRoles, ...direct.filter((g) => g.effect === "allow")];
  const denies: GrantInput[] = direct.filter((g) => g.effect === "deny");
  return new PermissionSet(false, allows, denies);
}
