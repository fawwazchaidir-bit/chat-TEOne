import { randomInt } from "node:crypto";

type Handler = (req: Request, rc: { params: Promise<Record<string, string>> }) => Promise<Response>;
const modules = import.meta.glob("../../src/app/api/**/route.ts") as Record<string, () => Promise<Record<string, Handler>>>;

const routes = Object.entries(modules).map(([file, load]) => {
  const p = file.replace("../../src/app", "").replace("/route.ts", "") || "/";
  const names: string[] = [];
  const re = new RegExp("^" + p.replace(/\[(\w+)\]/g, (_m, n: string) => (names.push(n), "([^/]+)")) + "$");
  return { re, names, load };
});

export type ApiResult = { status: number; body: any; headers: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function rawCall(method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}): Promise<ApiResult> {
  const url = new URL(path, "http://localhost:3000");
  for (const r of routes) {
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const mod = await r.load();
    const handler = mod[method];
    if (!handler) return { status: 405, body: null, headers: new Headers() };
    const params = Object.fromEntries(r.names.map((n, i) => [n, m[i + 1] as string]));
    const isForm = init.body instanceof FormData;
    const req = new Request(url, { method, headers: { ...(isForm ? {} : { "content-type": "application/json" }), ...init.headers }, body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body) });
    const res = await handler(req, { params: Promise.resolve(params) });
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, body, headers: res.headers };
  }
  return { status: 404, body: null, headers: new Headers() };
}

/** Klien uji bergaya browser: menyimpan cookie session dan token CSRF, mengirim header Origin. */
export class Client {
  cookie: string | null = null;
  csrf: string | null = null;
  stage: string | null = null;
  constructor(public ip = `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`) {}

  async request(method: string, path: string, body?: unknown, opts: { csrf?: boolean; origin?: string | null } = {}): Promise<ApiResult> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip };
    if (opts.origin !== null) headers.origin = opts.origin ?? "http://localhost:3000";
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && opts.csrf !== false) headers["x-csrf-token"] = this.csrf;
    const res = await rawCall(method, path, { body, headers });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!.endsWith("=") ? null : set.split(";")[0]!;
    return res;
  }
  get = (p: string) => this.request("GET", p);
  post = (p: string, b?: unknown) => this.request("POST", p, b ?? {});
  postForm = (p: string, form: FormData) => this.request("POST", p, form);
  put = (p: string, b?: unknown) => this.request("PUT", p, b ?? {});
  patch = (p: string, b?: unknown) => this.request("PATCH", p, b ?? {});
  delete = (p: string) => this.request("DELETE", p);

  /** Memuat stage + token CSRF dari /auth/me. */
  async refresh() {
    const r = await this.get("/api/v1/auth/me");
    if (r.status === 200) {
      this.csrf = r.body.csrfToken;
      this.stage = r.body.stage;
    }
    return r;
  }
}

export async function loginRaw(email: string, password: string, ip?: string) {
  const client = new Client(ip);
  const res = await client.post("/api/v1/auth/login", { email, password });
  if (res.status === 200) await client.refresh();
  return { client, res };
}
