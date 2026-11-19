import { and, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db/client";
import { channels, users } from "@/db/schema";
import { Badge, NotAvailable, PageHeader } from "@/components/ui";
import { getEnv } from "@/lib/env";
import { requireFull } from "@/lib/page-auth";
import { getOrgSettings } from "@/modules/org-settings/service";

export default async function Dashboard() {
  const ctx = await requireFull();
  const org = await getOrgSettings();
  const db = getDb();
  const visibleChannels = ctx.perms.canAny("channel.view") ? (await db.select({ id: channels.id }).from(channels).where(isNull(channels.archivedAt))).filter((c) => ctx.perms.can("channel.view", c.id)).length : null;
  const userCount = ctx.perms.can("user.manage") ? (await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.status, "active")))[0]?.n ?? 0 : null;
  const activeAll = (await db.select({ n: sql<number>`count(*)::int` }).from(channels).where(and(isNull(channels.archivedAt))))[0]?.n ?? 0;
  const env = getEnv().APP_ENV;
  return (
    <>
      <PageHeader title={`Halo, ${ctx.user.name}`} sub="Fondasi TE One (Tahap 1). Belum ada koneksi WhatsApp, inbox, atau AI." />
      <div className="grid">
        {visibleChannels !== null && (
          <div className="card"><div className="muted small">Channel yang dapat Anda lihat</div><div className="stat">{visibleChannels}</div>
            {ctx.user.isSuperAdmin && <div className="small muted">Slot aktif organisasi: {activeAll} / {org.maxChannels}</div>}</div>
        )}
        {userCount !== null && <div className="card"><div className="muted small">Pengguna aktif</div><div className="stat">{userCount}</div></div>}
        <div className="card"><div className="muted small">Lingkungan</div><div className="stat" style={{ fontSize: "1.3rem" }}>{env}</div><div className="small muted">Zona waktu bisnis: {org.timezone}</div></div>
        <div className="card"><div className="muted small">Keamanan akun Anda</div>
          <div>2FA: {ctx.user.totpEnabled ? <Badge kind="ok">Aktif</Badge> : <Badge kind="warn">Belum aktif</Badge>}</div>
          {!ctx.user.totpEnabled && <div className="small"><Link href="/login/2fa-setup">Aktifkan sekarang</Link></div>}</div>
      </div>

      <h2>Status modul</h2>
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Modul</th><th>Status</th><th>Keterangan</th></tr></thead>
          <tbody>
            <tr><td>Akun, peran & izin, tim</td><td><Badge kind="ok">Dibuat · diuji lokal</Badge></td><td className="small muted">Pengujian otomatis lokal/CI; staging belum terverifikasi.</td></tr>
            <tr><td>Channel (data & batas)</td><td><Badge kind="ok">Dibuat · diuji lokal</Badge></td><td className="small muted">Semua channel berstatus “Belum dikonfigurasi” — tidak ada koneksi WhatsApp.</td></tr>
            <tr><td>Audit log, kill switch, feature flag</td><td><Badge kind="ok">Dibuat · diuji lokal</Badge></td><td className="small muted">Kill switch baru terbukti pada fungsi contoh; belum ada otomatisasi nyata.</td></tr>
            <tr><td>Konektor WhatsApp (Meta)</td><td><NotAvailable stage={2} /></td><td className="small muted">Belum dibuat. Nomor operasional tidak disentuh.</td></tr>
            <tr><td>Inbox, AI agent, label, pipeline, follow-up, laporan</td><td><NotAvailable stage={3} /></td><td className="small muted">Dijadwalkan Tahap 3–6.</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
