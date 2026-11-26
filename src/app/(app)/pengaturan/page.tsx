import { isNull, sql } from "drizzle-orm";
import { OrgSettingsForm } from "@/components/admin-forms";
import { Denied, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { channels } from "@/db/schema";
import { requireFull } from "@/lib/page-auth";
import { getOrgSettings } from "@/modules/org-settings/service";

export default async function SettingsPage() {
  const ctx = await requireFull();
  if (!(ctx.user.isSuperAdmin || ctx.perms.can("user.manage") || ctx.perms.can("role.manage"))) return <Denied what="pengaturan organisasi" />;
  const org = await getOrgSettings();
  const [{ n } = { n: 0 }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(channels).where(isNull(channels.archivedAt));
  return (
    <>
      <PageHeader title="Pengaturan organisasi" sub="Jumlah channel maksimal adalah pengaturan organisasi (bawaan 5), bukan konstanta di kode." />
      <OrgSettingsForm maxChannels={org.maxChannels} timezone={org.timezone} activeChannels={n} canEdit={ctx.user.isSuperAdmin} />
      <div className="card small muted">
        <strong>Belum tersedia:</strong> pengaturan jam kerja/jam kirim (Tahap 6), retensi data (D-18 staging sudah diputuskan; pengaturannya di UI belum ada), dan integrasi Meta (Tahap 2).
      </div>
    </>
  );
}
