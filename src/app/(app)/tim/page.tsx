import { CreateTeamForm, TeamEditor } from "@/components/admin-forms";
import { Badge, Denied, PageHeader } from "@/components/ui";
import { requireFull } from "@/lib/page-auth";
import { listChannels } from "@/modules/channels/service";
import { listTeams } from "@/modules/teams/service";
import { listUserDirectory } from "@/modules/users/service";

export default async function TeamsPage() {
  const ctx = await requireFull();
  if (!ctx.perms.can("team.manage")) return <Denied what="manajemen tim" />;
  const [teams, users] = await Promise.all([listTeams(ctx), listUserDirectory(ctx)]);
  const channels = ctx.perms.canAny("channel.view") ? await listChannels(ctx) : [];
  return (
    <>
      <PageHeader title="Tim" sub="Tim dipakai untuk antrean dan routing di Tahap 3. Saat ini hanya pengelolaan data." />
      <CreateTeamForm />
      {teams.length === 0 && <div className="card muted">Belum ada tim.</div>}
      {teams.map((t) => (
        <details key={t.id} className="card">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>{t.name} {!t.isActive && <Badge kind="bad">Nonaktif</Badge>} <span className="muted small">· {t.members.length} anggota · {t.channels.length} channel</span></summary>
          {t.description && <p className="muted small">{t.description}</p>}
          <TeamEditor team={{ id: t.id, name: t.name, description: t.description, isActive: t.isActive, memberIds: t.members.map((m) => m.id), channelIds: t.channels.map((c) => c.id) }} users={users} channels={channels.map((c) => ({ id: c.id, name: c.name }))} />
        </details>
      ))}
    </>
  );
}
