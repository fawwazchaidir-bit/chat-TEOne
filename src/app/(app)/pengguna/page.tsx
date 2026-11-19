import Link from "next/link";
import { CreateUserForm } from "@/components/admin-forms";
import { Badge, Denied, PageHeader } from "@/components/ui";
import { requireFull } from "@/lib/page-auth";
import { listRoles } from "@/modules/roles-permissions/service";
import { listUsers } from "@/modules/users/service";

export default async function UsersPage() {
  const ctx = await requireFull();
  if (!ctx.perms.can("user.manage")) return <Denied what="manajemen pengguna" />;
  const items = await listUsers(ctx);
  const roles = await listRoles(ctx);
  const canAssign = ctx.perms.can("role.manage");
  return (
    <>
      <PageHeader title="Pengguna" sub="Akun TE One terpisah dari Internal Portal." />
      <CreateUserForm roles={roles.map((r) => ({ id: r.id, name: r.name }))} canAssignRoles={canAssign} isSuperAdmin={ctx.user.isSuperAdmin} />
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Nama</th><th>Peran</th><th>Status</th><th>2FA</th><th /></tr></thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.name} {u.isSuperAdmin && <Badge>Super Admin</Badge>}<div className="small muted">{u.email}</div></td>
                <td>{u.roles.length ? u.roles.map((r) => r.name).join(", ") : <span className="muted">—</span>}</td>
                <td>{u.status === "active" ? <Badge kind="ok">Aktif</Badge> : <Badge kind="bad">Nonaktif</Badge>}{u.mustChangePassword && <> <Badge kind="warn">Wajib ganti sandi</Badge></>}</td>
                <td>{u.totpEnabled ? <Badge kind="ok">Aktif</Badge> : u.isSuperAdmin || u.totpRequired ? <Badge kind="warn">Wajib, belum didaftarkan</Badge> : <span className="muted">Opsional</span>}</td>
                <td><Link href={`/pengguna/${u.id}`}>Kelola</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
