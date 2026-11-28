import { IntegrationTool } from "@/components/integration-tool";
import { WebhookCounterCard } from "@/components/webhook-counter-card";
import { Badge, Denied, NotAvailable, PageHeader } from "@/components/ui";
import { requireFull } from "@/lib/page-auth";
import { listToolChannels } from "@/modules/conversations-messages";
import { isFeatureEnabled } from "@/modules/feature-flags";
import { getMetaConfig, isRealMetaEndpoint, webhookCounterSnapshot } from "@/modules/whatsapp-adapter";

export default async function IntegrationPage() {
  const ctx = await requireFull();
  if (!ctx.perms.canAny("integration.test")) return <Denied what="alat uji integrasi" />;
  // G3-T01: ringkasan penolakan webhook hanya untuk Super Admin; tampil juga saat flag mati (justru saat itu Meta ditolak 404).
  const counter = ctx.user.isSuperAdmin ? <WebhookCounterCard snap={webhookCounterSnapshot()} /> : null;
  if (!(await isFeatureEnabled("whatsapp_connector"))) {
    return (
      <>
        <PageHeader title="Alat uji integrasi WhatsApp" sub={<NotAvailable stage={2} />} />
        <div className="card"><p>Fitur ini <strong>mati</strong> (feature flag <code className="mono">whatsapp_connector</code>). Super Admin dapat menyalakannya di halaman Kill switch &amp; flag setelah konfigurasi Meta siap.</p></div>
        {counter}
      </>
    );
  }
  const channels = await listToolChannels(ctx);
  const real = isRealMetaEndpoint(getMetaConfig());
  return (
    <>
      <PageHeader title="Alat uji integrasi WhatsApp" sub={<>Bukan inbox operasional. Pengiriman hanya ke penerima uji. {real ? <Badge kind="ok">Endpoint: Meta asli</Badge> : <Badge kind="sample">Endpoint: MOCK — hasil = SIMULASI</Badge>}</>} />
      {channels.length === 0 ? <div className="card muted">Tidak ada channel yang dapat Anda uji.</div> : <IntegrationTool channels={channels.map((c) => ({ id: c.id, name: c.name }))} canManageRecipients={ctx.perms.can("integration.test")} />}
      {counter}
    </>
  );
}
