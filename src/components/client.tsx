"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const CsrfCtx = createContext<string | null>(null);
export const CsrfProvider = ({ token, children }: { token: string | null; children: ReactNode }) => <CsrfCtx.Provider value={token}>{children}</CsrfCtx.Provider>;

export type ApiError = { code: string; message: string; details?: unknown };
export type ApiResult<T = Record<string, unknown>> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

export function useApi() {
  const csrf = useContext(CsrfCtx);
  return useCallback(
    async <T = Record<string, unknown>,>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> => {
      try {
        const res = await fetch(path, {
          method, credentials: "same-origin",
          headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        if (res.ok) return { ok: true, status: res.status, data: json as T };
        return { ok: false, status: res.status, error: json?.error ?? { code: "UNKNOWN", message: "Terjadi kesalahan." } };
      } catch {
        return { ok: false, status: 0, error: { code: "NETWORK", message: "Tidak dapat menghubungi server. Periksa koneksi Anda." } };
      }
    },
    [csrf],
  );
}

export function describeError(e: ApiError): string {
  const d = Array.isArray(e.details) ? (e.details as { field?: string; message?: string }[]).map((x) => `${x.field ? x.field + ": " : ""}${x.message}`).join("; ") : "";
  return d ? `${e.message} (${d})` : e.message;
}

/** Menjalankan satu aksi API dengan status pending/error/sukses; opsional refresh data server. */
export function useAction() {
  const api = useApi();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = useCallback(
    async <T = Record<string, unknown>,>(method: string, path: string, body?: unknown, o: { success?: string; refresh?: boolean; onOk?: (d: T) => void } = {}) => {
      setPending(true); setError(null); setOk(null);
      const r = await api<T>(method, path, body);
      setPending(false);
      if (r.ok) {
        if (o.success) setOk(o.success);
        o.onOk?.(r.data);
        if (o.refresh !== false) router.refresh();
      } else setError(describeError(r.error));
      return r;
    },
    [api, router],
  );
  return { run, pending, error, ok, setError, setOk };
}

export function Notice({ kind, children }: { kind: "error" | "ok" | "info" | "warn"; children: ReactNode }) {
  return <div className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}
export function Feedback({ error, ok }: { error: string | null; ok: string | null }) {
  return <>{error && <Notice kind="error">{error}</Notice>}{ok && <Notice kind="ok">{ok}</Notice>}</>;
}
