import { sql, isNull } from "drizzle-orm";
import Link from "next/link";
import { ChannelActions, CreateChannelForm } from "@/components/admin-forms";
import { Badge, Denied, PageHeader, SampleBadge, fmtDate } from "@/components/ui";
import { getDb } from "@/db/client";
import { channels as channelsTable } from "@/db/schema";
import { requireFull } from "@/lib/page-auth";
import { CHANNEL_STATUS_LABEL, INTEGRATION_KINDS, listChannels } from "@/modules/channels/service";
import { getOrgSettings } from "@/modules/org-settings/service";

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ arsip?: string }> }) {
  const ctx = await requireFull();
  if (!ctx.perms.canAny("channel.view")) return <Denied what="daftar channel" />;
  const showArchived = (await searchParams).arsip === "1";
  const [items, org] = await Promise.all([listChannels(ctx, { includeArchived: showArchived }), getOrgSettings()]);
  const [{ n: active } = { n: 0 }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(channelsTable).where(isNull(channelsTable.archivedAt));
  const canCreate = ctx.perms.can("channel.manage");
  return (
    <>
      <PageHeader title="Channel" sub={<>Slot aktif organisasi: <strong>{active} / {org.maxChannels}</strong>. Semua channel berstatus <em>Belum dikonfigurasi</em> — Tahap 1 tidak membuat koneksi WhatsApp.</>}
        actions={<Link className="btn secondary" href={showArchived ? "/channel" : "/channel?arsip=1"}>{showArchived ? "Sembunyikan arsip" : "Tampilkan arsip"}</Link>} />
      {canCreate && <CreateChannelForm slotsFull={active >= org.maxChannels} />}
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Channel</th><th>Fungsi</th><th>Integrasi rencana</th><th>Lingkungan</th><th>Status TE One</th><th>Dibuat</th><th /></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={7} className="muted">Tidak ada channel yang dapat Anda lihat.</td></tr>}
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.name} {c.isSample && <SampleBadge />} {c.isOperational && <Badge kind="warn">Operasional</Badge>} {c.archivedAt && <Badge kind="na">Diarsipkan</Badge>}{c.description && <div className="small muted">{c.description}</div>}</td>
                <td>{c.functionLabel}</td>
                <td>{INTEGRATION_KINDS[c.integrationKind as keyof typeof INTEGRATION_KINDS]}</td>
                <td>{c.environment}</td>
                <td><Badge kind="warn">{CHANNEL_STATUS_LABEL[c.status as keyof typeof CHANNEL_STATUS_LABEL] ?? c.status}</Badge></td>
                <td className="small">{fmtDate(c.createdAt, org.timezone)}</td>
                <td><ChannelActions channel={{ id: c.id, name: c.name, functionLabel: c.functionLabel, description: c.description, integrationKind: c.integrationKind, archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null }} canManage={ctx.perms.can("channel.manage", c.id)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Aturan slot: mengarsipkan membebaskan slot segera; memulihkan memerlukan slot kosong dan nama aktif yang belum dipakai. Jejak audit tetap ada.</p>
    </>
  );
}
