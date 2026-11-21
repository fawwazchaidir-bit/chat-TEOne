import { InboxApp } from "@/components/inbox-app";
import { Badge, Denied, NotAvailable, PageHeader } from "@/components/ui";
import { requireFull } from "@/lib/page-auth";
import { isFeatureEnabled } from "@/modules/feature-flags";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const ctx = await requireFull();
  if (!(await isFeatureEnabled("inbox"))) {
    return (
      <>
        <PageHeader title="Inbox" sub={<NotAvailable stage={3} />} />
        <div className="card"><p>Inbox <strong>mati</strong> (feature flag <code className="mono">inbox</code>). Super Admin menyalakannya di halaman Kill switch &amp; flag setelah Tahap 3 siap diuji.</p></div>
      </>
    );
  }
  if (!ctx.perms.canAny("chat.view")) return <Denied what="inbox" />;
  const sim = await isFeatureEnabled("ai_simulation");
  return (
    <>
      <PageHeader
        title="Inbox"
        sub={<>Percakapan lintas channel sesuai izin Anda. {sim ? <Badge kind="sample">AI SIMULASI menyala — bukan AI sungguhan</Badge> : <Badge kind="na">AI belum terhubung (Tahap 4)</Badge>}</>}
      />
      <InboxApp />
    </>
  );
}
