import { FeatureFlagPanel, KillSwitchPanel } from "@/components/admin-forms";
import { Denied, PageHeader, Badge } from "@/components/ui";
import { requireFull } from "@/lib/page-auth";
import { listChannels } from "@/modules/channels/service";
import { listFlags } from "@/modules/feature-flags";
import { AUTOMATION_FEATURES, listKillSwitches } from "@/modules/kill-switch";

export default async function KillSwitchPage() {
  const ctx = await requireFull();
  if (!ctx.perms.can("killswitch.manage")) return <Denied what="kill switch" />;
  const [items, flags, channels] = await Promise.all([listKillSwitches(ctx), ctx.user.isSuperAdmin ? listFlags(ctx) : Promise.resolve([]), listChannels(ctx)]);
  return (
    <>
      <PageHeader title="Kill switch & feature flag" sub={<>Khusus Super Admin. <Badge kind="warn">Tahap 1: terbukti pada fungsi contoh saja — belum ada otomatisasi nyata yang dihentikan.</Badge></>} />
      <div className="notice info">Kill switch yang menyala <strong>tidak pernah menyala kembali/terlepas sendiri</strong>; hanya manusia berizin yang dapat melepasnya, dan setiap perubahan tercatat. Pemeriksaan dilakukan tanpa cache sehingga berlaku seketika. Bila status tidak dapat dibaca, otomatisasi diblokir (fail-closed).</div>
      <h2>Kill switch</h2>
      <KillSwitchPanel items={items.map((i) => ({ ...i, engagedAt: i.engagedAt?.toISOString() ?? null, releasedAt: i.releasedAt?.toISOString() ?? null }))} channels={channels.map((c) => ({ id: c.id, name: c.name }))} features={AUTOMATION_FEATURES.map((f) => ({ key: f.key, label: f.label }))} />
      {ctx.user.isSuperAdmin && (<><h2>Feature flag</h2><FeatureFlagPanel flags={flags.map((f) => ({ key: f.key, label: f.label, stage: f.stage, enabled: f.enabled }))} /></>)}
    </>
  );
}
