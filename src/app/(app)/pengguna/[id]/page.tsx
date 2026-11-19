import Link from "next/link";
import { notFound } from "next/navigation";
import { GrantEditor, UserProfileForm, UserRolesForm, UserSecurityActions } from "@/components/admin-forms";
import { Badge, Denied, PageHeader } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { requireFull } from "@/lib/page-auth";
import { PERMISSIONS } from "@/modules/roles-permissions/registry";
import { listRoles } from "@/modules/roles-permissions/service";
import { listChannels } from "@/modules/channels/service";
import { getUser } from "@/modules/users/service";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireFull();
  if (!ctx.perms.can("user.manage")) return <Denied what="manajemen pengguna" />;
  const { id } = await params;
  const user = await getUser(ctx, id).catch((e) => { if (e instanceof AppError && (e.status === 404 || e.status === 400)) notFound(); throw e; });
  const roles = await listRoles(ctx);
  const channels = ctx.perms.canAny("channel.view") ? await listChannels(ctx) : [];
  const self = user.id === ctx.user.id;
  const protectedTarget = self || (user.isSuperAdmin && !ctx.user.isSuperAdmin);
  const canRole = ctx.perms.can("role.manage") && !protectedTarget;
  return (
    <>
      <PageHeader title={user.name} sub={<>{user.email} {user.isSuperAdmin && <Badge>Super Admin</Badge>} {user.status === "active" ? <Badge kind="ok">Aktif</Badge> : <Badge kind="bad">Nonaktif</Badge>}</>} actions={<Link className="btn secondary" href="/pengguna">← Semua pengguna</Link>} />
      <UserProfileForm user={user} isSuperAdmin={ctx.user.isSuperAdmin} />
      <UserSecurityActions user={user} self={self} actorIsSuperAdmin={ctx.user.isSuperAdmin} />
      {ctx.perms.can("role.manage") && (
        <>
          <UserRolesForm userId={user.id} roles={roles.map((r) => ({ id: r.id, name: r.name }))} current={user.roles.map((r) => r.id)} disabled={!canRole} />
          <div className="card">
            <h3>Izin khusus pengguna</h3>
            <p className="small muted">“Tolak” mengalahkan izin dari peran. Anda hanya dapat memberikan izin yang Anda miliki sendiri (anti-eskalasi); menolak selalu diperbolehkan. Super Admin tidak dibatasi izin.</p>
            {user.isSuperAdmin && <p className="small muted">Akun Super Admin memiliki akses penuh; penolakan tidak berlaku padanya.</p>}
            <GrantEditor mode="user" permissions={[...PERMISSIONS]} channels={channels.map((c) => ({ id: c.id, name: c.name }))} initial={user.grants} saveUrl={`/api/v1/users/${user.id}/grants`} canGrantSuperAdminOnly={ctx.user.isSuperAdmin} disabled={!canRole} />
          </div>
        </>
      )}
    </>
  );
}
