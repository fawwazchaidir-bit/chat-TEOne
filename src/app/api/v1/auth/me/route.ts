import { apiSession } from "@/lib/http";
import { getDb } from "@/db/client";
import { loadPermissionSet } from "@/modules/roles-permissions/loader";
import { PERMISSIONS } from "@/modules/roles-permissions/registry";

export const GET = apiSession(async ({ ctx }) => {
  let permissions: string[] = [];
  if (ctx.stage === "full") {
    const perms = await loadPermissionSet(getDb(), ctx.user.id, ctx.user.isSuperAdmin);
    permissions = PERMISSIONS.filter((p) => perms.canAny(p.key)).map((p) => p.key);
  }
  return { user: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name, isSuperAdmin: ctx.user.isSuperAdmin }, stage: ctx.stage, csrfToken: ctx.csrfToken, permissions };
});
