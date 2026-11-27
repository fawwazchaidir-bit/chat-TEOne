import { sql, isNull } from "drizzle-orm";
import Link from "next/link";
import { ChannelActions, CreateChannelForm } from "@/components/admin-forms";
import { Badge, Denied, PageHeader, SampleBadge, fmtDate } from "@/components/ui";
import { getDb } from "@/db/client";
import { channels as channelsTable } from "@/db/schema";
import { ChannelConnectionPanel, type ConnView } from "@/components/channel-connection";
import { HistorySyncPanel, type HistorySyncView } from "@/components/history-sync-panel";
import { requireFull } from "@/lib/page-auth";
import { isFeatureEnabled } from "@/modules/feature-flags";
import { getConnectionView, getHistorySyncView } from "@/modules/whatsapp-adapter";
import { CHANNEL_STATUS_LABEL, INTEGRATION_KINDS, getChannelAutomation, listChannels } from "@/modules/channels/service";
import { ChannelAutomationControls } from "@/components/channel-automation";
import { getOrgSettings } from "@/modules/org-settings/service";

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ arsip?: string }> }) {
  const ctx = await requireFull();
  if (!ctx.perms.canAny("channel.view")) return <Denied what="daftar channel" />;
  const showArchived = (await searchParams).arsip === "1";
  const [items, org] = await Promise.all([listChannels(ctx, { includeArchived: showArchived }), getOrgSettings()]);
  const [{ n: active } = { n: 0 }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(channelsTable).where(isNull(channelsTable.archivedAt));
  const canCreate = ctx.perms.can("channel.manage");
  const connectorOn = await isFeatureEnabled("whatsapp_connector");
  const inboxOn = await isFeatureEnabled("inbox");
  const automation = inboxOn ? await getChannelAutomation(ctx, items.filter((x) => !x.archivedAt).map((x) => x.id)) : {};
  const conns = new Map<string, ConnView>();
  if (connectorOn) for (const c of items.filter((x) => !x.archivedAt)) conns.set(c.id, JSON.parse(JSON.stringify(await getConnectionView(ctx, c.id))) as ConnView);
  // S-12: sinkronisasi kontak & riwayat hanya untuk channel coexistence; flag `history_sync` mati → panel menampilkan "Belum tersedia".
  const syncViews = new Map<string, HistorySyncView>();
  if (connectorOn) for (const c of items.filter((x) => !x.archivedAt && x.integrationKind === "cloud_api_coexistence")) syncViews.set(c.id, JSON.parse(JSON.stringify(await getHistorySyncView(ctx, c.id))) as HistorySyncView);
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
      {inboxOn && items.filter((c) => !c.archivedAt && automation[c.id]).map((c) => (
        <details key={`auto-${c.id}`} className="card"><summary style={{ cursor: "pointer", fontWeight: 700 }}>Antrian &amp; otomatisasi — {c.name}{automation[c.id]?.paused ? " (DIJEDA)" : ""}</summary>
          <ChannelAutomationControls channelId={c.id} defaultTeamId={c.defaultTeamId ?? null} view={automation[c.id]!} /></details>
      ))}
      {connectorOn ? items.filter((c) => !c.archivedAt).map((c) => (
        <details key={c.id} className="card"><summary style={{ cursor: "pointer", fontWeight: 700 }}>Koneksi WhatsApp — {c.name}</summary>
          <ChannelConnectionPanel channelId={c.id} view={conns.get(c.id) ?? { configured: false }} canManage={ctx.perms.can("channel.manage", c.id)} />
          {syncViews.has(c.id) && <HistorySyncPanel channelId={c.id} channelName={c.name} view={syncViews.get(c.id) as HistorySyncView} />}</details>
      )) : <div className="card small muted">Koneksi WhatsApp (Meta Cloud API): <span className="badge na">Belum tersedia · Tahap 2</span> — feature flag <code className="mono">whatsapp_connector</code> masih mati.</div>}
      <p className="small muted">Aturan slot: mengarsipkan membebaskan slot segera; memulihkan memerlukan slot kosong dan nama aktif yang belum dipakai. Jejak audit tetap ada.</p>
    </>
  );
}
