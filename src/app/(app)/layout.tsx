import Link from "next/link";
import type { ReactNode } from "react";
import { CsrfProvider } from "@/components/client";
import { LogoutButton } from "@/components/auth-forms";
import { NotAvailable } from "@/components/ui";
import { requireFull } from "@/lib/page-auth";
import { isFeatureEnabled } from "@/modules/feature-flags";

const FUTURE = [
  { slug: "ai-agent", label: "AI Agent", stage: 4 },
  { slug: "kartu-program", label: "Kartu Program & Knowledge", stage: 4 },
  { slug: "label-pipeline", label: "Label & Pipeline", stage: 5 },
  { slug: "template-followup", label: "Template & Follow-up", stage: 6 },
  { slug: "laporan", label: "Laporan", stage: 5 },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireFull();
  const p = ctx.perms;
  const inboxOn = await isFeatureEnabled("inbox");
  const admin: [string, string, boolean][] = [
    ["/pengguna", "Pengguna", p.can("user.manage")],
    ["/peran", "Peran & izin", p.can("role.manage") || p.can("user.manage")],
    ["/tim", "Tim", p.can("team.manage")],
    ["/channel", "Channel", p.canAny("channel.view")],
    ["/balasan-cepat", "Balasan cepat", inboxOn && p.canAny("quickreply.manage")],
    ["/audit", "Audit log", p.can("audit.view")],
    ["/integrasi", "Alat uji integrasi", p.canAny("integration.test")],
    ["/pengaturan", "Pengaturan organisasi", ctx.user.isSuperAdmin || p.can("user.manage") || p.can("role.manage")],
    ["/kill-switch", "Kill switch & flag", p.can("killswitch.manage")],
  ];
  return (
    <CsrfProvider token={ctx.csrfToken}>
      <div className="shell">
        <aside className="side">
          <div className="brand">TE One<small>Enterprise Customer Relationship Management Platform</small></div>
          <nav className="nav" aria-label="Navigasi utama">
            <Link href="/dashboard">Dashboard</Link>
            {inboxOn && p.canAny("chat.view")
              ? <Link href="/inbox">Inbox</Link>
              : !inboxOn && <Link href="/belum-tersedia/inbox" className="disabled-module">Inbox <NotAvailable stage={3} /></Link>}
            <div className="sec">Administrasi</div>
            {admin.filter(([, , show]) => show).map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
            <div className="sec">Modul tahap berikutnya</div>
            {FUTURE.map((m) => (
              <Link key={m.slug} href={`/belum-tersedia/${m.slug}`} className="disabled-module">{m.label} <NotAvailable stage={m.stage} /></Link>
            ))}
          </nav>
          <div className="who">
            <div><strong>{ctx.user.name}</strong>{ctx.user.isSuperAdmin && <> <span className="badge">Super Admin</span></>}</div>
            <div className="muted small" style={{ wordBreak: "break-all" }}>{ctx.user.email}</div>
            <p className="small" style={{ margin: ".4rem 0" }}>
              <Link href="/login/ganti-sandi">Ubah kata sandi</Link>
              {!ctx.user.totpEnabled && <> · <Link href="/login/2fa-setup">Aktifkan 2FA</Link></>}
            </p>
            <LogoutButton />
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </CsrfProvider>
  );
}
