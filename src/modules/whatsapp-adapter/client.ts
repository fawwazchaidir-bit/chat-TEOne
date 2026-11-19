/**
 * Klien Meta Graph API (Cloud API). Satu-satunya tempat HTTP ke Meta.
 * - Tidak pernah melempar error: selalu mengembalikan hasil terstruktur (`ok` / `kind`).
 * - Token hanya di header Authorization; tidak pernah di URL, log, atau hasil kembali.
 * - Timeout/jaringan = hasil BELUM PASTI bagi permintaan kirim (permintaan mungkin sudah diproses Meta) → tidak boleh di-retry buta.
 */
import { assertSafeBaseUrl, getMetaConfig, type MetaConfig } from "./config";

export type MetaErr = { code: number | null; subcode: number | null; message: string | null; type: string | null };
export type CallResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; kind: "konfigurasi"; detail: string }
  | { ok: false; kind: "timeout" }
  | { ok: false; kind: "jaringan" }
  | { ok: false; kind: "http"; status: number; meta: MetaErr };

type Json = Record<string, unknown>;
const toErr = (body: unknown): MetaErr => {
  const e = (typeof body === "object" && body !== null ? (body as Json).error : null) as Json | null;
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : null);
  return { code: n(e?.code), subcode: n(e?.error_subcode), message: s(e?.message), type: s(e?.type) };
};

async function call<T>(method: "GET" | "POST", path: string, o: { query?: Record<string, string>; json?: unknown; form?: FormData; cfg?: MetaConfig } = {}): Promise<CallResult<T>> {
  const cfg = o.cfg ?? getMetaConfig();
  if (!cfg.accessToken) return { ok: false, kind: "konfigurasi", detail: "META_ACCESS_TOKEN belum diisi" };
  try {
    assertSafeBaseUrl(cfg);
  } catch (e) {
    return { ok: false, kind: "konfigurasi", detail: (e as Error).message };
  }
  const url = new URL(`${cfg.graphBaseUrl}/${cfg.apiVersion}/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { authorization: `Bearer ${cfg.accessToken}` };
  let body: BodyInit | undefined;
  if (o.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(o.json); }
  else if (o.form) body = o.form;
  try {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(cfg.timeoutMs), redirect: "error" });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* body bukan JSON */ }
    if (res.ok) return { ok: true, status: res.status, data: parsed as T };
    return { ok: false, kind: "http", status: res.status, meta: toErr(parsed) };
  } catch (e) {
    const name = (e as Error)?.name;
    return { ok: false, kind: name === "TimeoutError" || name === "AbortError" ? "timeout" : "jaringan" };
  }
}

// ───────────── Pemeriksaan koneksi (dipakai verifyConnection / skrip meta:check) ─────────────
export const getPhoneNumber = (phoneNumberId: string) =>
  call<{ id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }>("GET", encodeURIComponent(phoneNumberId), { query: { fields: "id,display_phone_number,verified_name,quality_rating" } });
export const listWabaPhoneNumbers = (wabaId: string) =>
  call<{ data?: { id?: string }[] }>("GET", `${encodeURIComponent(wabaId)}/phone_numbers`, { query: { fields: "id,display_phone_number", limit: "100" } });
export const listSubscribedApps = (wabaId: string) => call<{ data?: unknown[] }>("GET", `${encodeURIComponent(wabaId)}/subscribed_apps`);
export const subscribeApp = (wabaId: string) => call<{ success?: boolean }>("POST", `${encodeURIComponent(wabaId)}/subscribed_apps`);

// ───────────── Kirim ─────────────
export type SendOk = { messages?: { id?: string }[]; contacts?: unknown[] };
export const postMessage = (phoneNumberId: string, payload: Json) => call<SendOk>("POST", `${encodeURIComponent(phoneNumberId)}/messages`, { json: { messaging_product: "whatsapp", recipient_type: "individual", ...payload } });

const base = (to: string, opaque?: string) => ({ to, ...(opaque ? { biz_opaque_callback_data: opaque.slice(0, 512) } : {}) });
export const buildText = (to: string, body: string, opaque?: string): Json => ({ ...base(to, opaque), type: "text", text: { body, preview_url: false } });
export const buildImage = (to: string, mediaId: string, caption?: string, opaque?: string): Json => ({ ...base(to, opaque), type: "image", image: { id: mediaId, ...(caption ? { caption } : {}) } });
export const buildDocument = (to: string, mediaId: string, filename: string, caption?: string, opaque?: string): Json => ({ ...base(to, opaque), type: "document", document: { id: mediaId, filename, ...(caption ? { caption } : {}) } });
/** Dipakai Tahap 6 (follow-up). Uji nyata pada Tahap 2 opsional; tidak terhubung ke UI. */
export const buildTemplate = (to: string, name: string, language: string, components: unknown[] = [], opaque?: string): Json => ({ ...base(to, opaque), type: "template", template: { name, language: { code: language }, components } });

// ───────────── Media ─────────────
export function uploadMedia(phoneNumberId: string, bytes: Uint8Array, mime: string, filename: string) {
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mime);
  form.set("file", new Blob([bytes as BlobPart], { type: mime }), filename);
  return call<{ id?: string }>("POST", `${encodeURIComponent(phoneNumberId)}/media`, { form });
}
export const getMediaInfo = (mediaId: string) => call<{ url?: string; mime_type?: string; sha256?: string; file_size?: number }>("GET", encodeURIComponent(mediaId));

/** URL media dari Meta wajib https pada domain Meta (cegah SSRF); pada mock non-production: origin yang sama dengan basis Graph. */
export function isAllowedMediaUrl(raw: string, cfg: MetaConfig = getMetaConfig()): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  const g = new URL(cfg.graphBaseUrl);
  if (g.hostname === "graph.facebook.com") {
    return u.protocol === "https:" && /(^|\.)((facebook\.com)|(fbcdn\.net)|(fbsbx\.com)|(whatsapp\.net)|(whatsapp\.com))$/.test(u.hostname);
  }
  return u.origin === g.origin; // mock lokal
}

export type DownloadResult = { ok: true; bytes: Uint8Array } | { ok: false; kind: "konfigurasi" | "url_tidak_diizinkan" | "terlalu_besar" | "timeout" | "jaringan" | "http"; status?: number };
export async function downloadMedia(url: string, maxBytes: number, cfg: MetaConfig = getMetaConfig()): Promise<DownloadResult> {
  if (!cfg.accessToken) return { ok: false, kind: "konfigurasi" };
  if (!isAllowedMediaUrl(url, cfg)) return { ok: false, kind: "url_tidak_diizinkan" };
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${cfg.accessToken}` }, signal: AbortSignal.timeout(cfg.timeoutMs * 3), redirect: "error" });
    if (!res.ok) return { ok: false, kind: "http", status: res.status };
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) return { ok: false, kind: "terlalu_besar" };
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, kind: "jaringan" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); return { ok: false, kind: "terlalu_besar" }; }
      chunks.push(value);
    }
    return { ok: true, bytes: Buffer.concat(chunks) };
  } catch (e) {
    const name = (e as Error)?.name;
    return { ok: false, kind: name === "TimeoutError" || name === "AbortError" ? "timeout" : "jaringan" };
  }
}
