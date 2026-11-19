import Link from "next/link";
import { Badge, Denied, PageHeader, fmtDate } from "@/components/ui";
import { requireFull } from "@/lib/page-auth";
import { listAudit } from "@/modules/audit";
import { getOrgSettings } from "@/modules/org-settings/service";

type SP = { action?: string; actor?: string; beforeId?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireFull();
  if (!ctx.perms.can("audit.view")) return <Denied what="audit log" />;
  const sp = await searchParams;
  const beforeId = Number(sp.beforeId);
  const [{ items, nextBeforeId }, org] = await Promise.all([
    listAudit(ctx, { action: sp.action || undefined, actor: sp.actor || undefined, beforeId: Number.isFinite(beforeId) && beforeId > 0 ? beforeId : undefined, limit: 50 }),
    getOrgSettings(),
  ]);
  const qs = (b: number) => new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), ...(sp.actor ? { actor: sp.actor } : {}), beforeId: String(b) }).toString();
  return (
    <>
      <PageHeader title="Audit log" sub="Append-only bagi aplikasi. Tidak memuat rahasia maupun isi chat." />
      <form className="card" method="get">
        <div className="row">
          <div><label htmlFor="a-act">Jenis tindakan (awalan)</label><input id="a-act" name="action" defaultValue={sp.action} placeholder="mis. user., channel., auth." /></div>
          <div><label htmlFor="a-actor">Aktor (email)</label><input id="a-actor" name="actor" defaultValue={sp.actor} /></div>
          <div className="auto"><button type="submit">Saring</button></div>
        </div>
      </form>
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Waktu</th><th>Aktor</th><th>Tindakan</th><th>Objek</th><th>Hasil</th><th>ID korelasi</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="muted">Tidak ada catatan.</td></tr>}
            {items.map((r) => (
              <tr key={r.id}>
                <td className="small">{fmtDate(r.occurredAt, org.timezone)}</td>
                <td className="small">{r.actorLabel}</td>
                <td className="mono small">{r.action}</td>
                <td className="small">{r.objectType}{r.objectId && <div className="mono muted" style={{ wordBreak: "break-all" }}>{r.objectId}</div>}</td>
                <td><Badge kind={r.result === "success" ? "ok" : r.result === "denied" ? "warn" : "bad"}>{r.result}</Badge></td>
                <td className="mono small muted">{r.correlationId.slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextBeforeId && <p><Link className="btn secondary" href={`/audit?${qs(nextBeforeId)}`}>Muat catatan lebih lama →</Link></p>}
    </>
  );
}
