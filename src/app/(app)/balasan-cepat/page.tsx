import { QuickRepliesManager } from "@/components/quick-replies-manager";
import { Denied, NotAvailable, PageHeader } from "@/components/ui";
import { requireFull } from "@/lib/page-auth";
import { isFeatureEnabled } from "@/modules/feature-flags";
import { listChannels } from "@/modules/channels/service";
import { listQuickReplies, QUICK_REPLY_VARIABLES } from "@/modules/inbox";

export const dynamic = "force-dynamic";

export default async function QuickRepliesPage() {
  const ctx = await requireFull();
  if (!(await isFeatureEnabled("inbox"))) return (<><PageHeader title="Balasan cepat" sub={<NotAvailable stage={3} />} /><div className="card"><p>Fitur ini mati (feature flag <code className="mono">inbox</code>).</p></div></>);
  if (!ctx.perms.canAny("quickreply.manage")) return <Denied what="pengelolaan balasan cepat" />;
  const [items, channels] = await Promise.all([listQuickReplies(ctx), listChannels(ctx, { includeArchived: false })]);
  return (
    <>
      <PageHeader title="Balasan cepat" sub="Pustaka teks per channel dengan variabel aman. Hanya mengisi komposer — pengiriman tetap lewat pemeriksaan izin dan jendela layanan." />
      <QuickRepliesManager
        items={items}
        channels={channels.filter((c) => ctx.perms.can("quickreply.manage", c.id)).map((c) => ({ id: c.id, name: c.name }))}
        canAll={ctx.perms.can("quickreply.manage")}
        variables={[...QUICK_REPLY_VARIABLES]}
      />
    </>
  );
}
