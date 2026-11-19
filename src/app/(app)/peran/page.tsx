import { eq } from "drizzle-orm";
import { CreateRoleForm, GrantEditor, RoleMetaForm } from "@/components/admin-forms";
import { Badge, Denied, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { userRoles } from "@/db/schema";
import { requireFull } from "@/lib/page-auth";
import { listChannels } from "@/modules/channels/service";
import { PERMISSIONS } from "@/modules/roles-permissions/registry";
import { listRoles } from "@/modules/roles-permissions/service";

export default async function RolesPage() {
  const ctx = await requireFull();
  if (!ctx.perms.can("role.manage") && !ctx.perms.can("user.manage")) return <Denied what="peran & izin" />;
  const canManage = ctx.perms.can("role.manage");
  const roles = await listRoles(ctx);
  const channels = ctx.perms.canAny("channel.view") ? await listChannels(ctx) : [];
  const held = new Set((await getDb().select({ r: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, ctx.user.id))).map((x) => x.r));
  return (
    <>
      <PageHeader title="Peran & izin" sub="Izin = aksi + cakupan channel. Default menolak; penolakan per pengguna mengalahkan peran." />
      <div className="card"><strong>Super Admin</strong> <Badge>Penanda khusus</Badge>
        <p className="small muted" style={{ margin: ".3rem 0 0" }}>Akses penuh, 2FA wajib. Hanya Super Admin yang dapat memberi/mencabut hak ini (di halaman pengguna). Super Admin aktif terakhir tidak dapat dinonaktifkan.</p></div>
      {canManage && <CreateRoleForm />}
      {roles.map((r) => {
        const lock = !ctx.user.isSuperAdmin && held.has(r.id);
        return (
          <details key={r.id} className="card" open={roles.length <= 2}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>{r.name} {r.isSystem && <Badge kind="sample">Peran awal (contoh)</Badge>} {r.require2fa && <Badge kind="warn">2FA wajib</Badge>} <span className="muted small">· {r.memberCount} pengguna · {r.grants.length} izin</span></summary>
            <p className="muted small">{r.description}</p>
            {canManage ? (
              <>
                {lock && <p className="notice warn">Anda memegang peran ini, sehingga tidak dapat mengubahnya sendiri.</p>}
                <RoleMetaForm role={r} isSuperAdmin={ctx.user.isSuperAdmin} />
                <GrantEditor mode="role" permissions={[...PERMISSIONS]} channels={channels.map((c) => ({ id: c.id, name: c.name }))} initial={r.grants} saveUrl={`/api/v1/roles/${r.id}/grants`} canGrantSuperAdminOnly={ctx.user.isSuperAdmin} disabled={lock} />
              </>
            ) : <ul>{r.grants.map((g) => <li key={g.permission}>{g.permission} — {g.scopeAll ? "semua channel" : `${g.channelIds.length} channel`}</li>)}</ul>}
          </details>
        );
      })}
    </>
  );
}
