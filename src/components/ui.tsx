import type { ReactNode } from "react";
import { getEnv } from "@/lib/env";

export function EnvBanner() {
  const env = getEnv().APP_ENV;
  if (env === "production") return null;
  return <div className={`env-banner env-${env}`} role="status">LINGKUNGAN {env === "test" ? "UJI" : env.toUpperCase()} — BUKAN PRODUCTION</div>;
}

export function Badge({ kind, children }: { kind?: "ok" | "warn" | "bad" | "sample" | "na"; children: ReactNode }) {
  return <span className={`badge ${kind ?? ""}`}>{children}</span>;
}
export const SampleBadge = () => <Badge kind="sample">CONTOH</Badge>;
export const NotAvailable = ({ stage }: { stage?: number }) => <Badge kind="na">Belum tersedia{stage ? ` · Tahap ${stage}` : ""}</Badge>;

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
      <div><h1>{title}</h1>{sub && <div className="muted">{sub}</div>}</div>
      {actions}
    </div>
  );
}

export function Denied({ what = "halaman ini" }: { what?: string }) {
  return (
    <div className="card" role="alert">
      <h1>Akses ditolak</h1>
      <p className="muted">Anda tidak memiliki izin untuk membuka {what}. Hubungi Super Admin bila ini keliru.</p>
    </div>
  );
}

export const fmtDate = (d: Date | string | null | undefined, tz = "Asia/Jakarta") =>
  d ? new Date(d).toLocaleString("id-ID", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "—";
