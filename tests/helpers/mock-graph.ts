/**
 * Mock Meta Graph API untuk uji. BUKAN Meta: setiap hasil pemeriksaan terhadap server ini berstatus SIMULASI.
 * Perilaku kirim dapat diprogram (ok / 4xx / 5xx / timeout / tanpa-ID) dan semua panggilan direkam (untuk membuktikan
 * "tepat satu panggilan" / "tanpa retry buta").
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export type SendMode = "ok" | "http400" | "http429" | "http500" | "timeout" | "noid" | "window131047";
type Call = { method: string; path: string; json?: Record<string, unknown>; auth: string | undefined; bytes?: number };

export class MockGraph {
  private server = http.createServer((req, res) => void this.handle(req, res));
  private timers = new Set<NodeJS.Timeout>();
  url = "";
  token = "uji-access-token-sintetis-0001";
  calls: Call[] = [];
  sendMode: SendMode | ((n: number) => SendMode) = "ok";
  sendCount = 0;
  phones = new Map<string, { display: string; name: string }>();
  wabas = new Map<string, string[]>();
  subscribed = new Set<string>();
  media = new Map<string, { bytes: Buffer; mime: string; sha256?: string }>();
  mediaInfoStatus = 200;
  /** ID aplikasi yang tampil pada subscribed_apps (default = META_APP_ID uji). */
  appId = "300000000000001";
  /** Status HTTP untuk GET subscribed_apps (≠200 → galat Meta; menguji langganan "tidak diketahui"). */
  subscribedStatus = 200;
  /** Penahan permintaan (untuk uji balapan/crash): `hold("send")` menahan POST /messages sampai fungsi pelepas dipanggil. */
  private gates = new Map<string, Promise<void>>();
  hold(kind: "send" | "upload" | "phone"): () => void {
    let release!: () => void;
    this.gates.set(kind, new Promise<void>((r) => { release = r; }));
    return () => { this.gates.delete(kind); release(); };
  }
  /** Menunggu sampai predikat benar (mis. permintaan sudah tiba di mock) — batas waktu agar test tidak menggantung. */
  async waitFor(pred: () => boolean, ms = 8000) {
    const end = Date.now() + ms;
    while (!pred()) { if (Date.now() > end) throw new Error("waitFor: batas waktu"); await new Promise((r) => setTimeout(r, 15)); }
  }
  uploaded: { size: number; type?: string }[] = [];
  /** Menimpa URL unduhan yang dikembalikan info media (untuk menguji penolakan SSRF). */
  overrideMediaUrl: string | null = null;

  async start() {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }
  async stop() {
    this.timers.forEach(clearTimeout);
    this.server.closeAllConnections();
    await new Promise<void>((r) => this.server.close(() => r()));
  }
  reset() {
    this.calls = []; this.sendCount = 0; this.sendMode = "ok"; this.uploaded = []; this.mediaInfoStatus = 200; this.overrideMediaUrl = null;
    this.appId = "300000000000001"; this.subscribedStatus = 200; this.gates.clear(); this.phones.clear(); this.wabas.clear(); this.subscribed.clear(); this.media.clear(); this.token = "uji-access-token-sintetis-0001";
  }
  sends() { return this.calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages")); }

  private err(res: http.ServerResponse, status: number, code: number, message: string) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message, type: "OAuthException", code, fbtrace_id: "mock" } }));
  }
  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? "/", this.url);
    const auth = req.headers.authorization;
    const ct = req.headers["content-type"] ?? "";
    let json: Record<string, unknown> | undefined;
    if (ct.includes("application/json") && body.length) { try { json = JSON.parse(body.toString("utf8")); } catch { /* abaikan */ } }
    this.calls.push({ method: req.method ?? "GET", path: url.pathname, json, auth, bytes: body.length });
    if (auth !== `Bearer ${this.token}`) return this.err(res, 401, 190, "Invalid OAuth access token.");

    const dl = /^\/dl\/(.+)$/.exec(url.pathname);
    if (dl) {
      const m = this.media.get(decodeURIComponent(dl[1] as string));
      if (!m) { res.writeHead(404); return void res.end(); }
      res.writeHead(200, { "content-type": m.mime, "content-length": String(m.bytes.length) });
      return void res.end(m.bytes);
    }
    const parts = url.pathname.replace(/^\/v\d+\.\d+\//, "").split("/").filter(Boolean);
    const [id, sub] = parts;
    const out = (status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    const gateKind = req.method === "POST" && sub === "messages" ? "send" : req.method === "POST" && sub === "media" ? "upload" : req.method === "GET" && id && !sub && this.phones.has(id) ? "phone" : null;
    const gate = gateKind ? this.gates.get(gateKind) : undefined;
    if (gate) await gate;

    if (req.method === "POST" && sub === "messages") {
      this.sendCount++;
      const mode = typeof this.sendMode === "function" ? this.sendMode(this.sendCount) : this.sendMode;
      if (mode === "timeout") { this.timers.add(setTimeout(() => res.destroy(), 4000)); return; }
      if (mode === "http400") return this.err(res, 400, 100, "Invalid parameter");
      if (mode === "http429") return this.err(res, 429, 130429, "Rate limit hit");
      if (mode === "http500") return this.err(res, 500, 1, "Unknown error");
      if (mode === "window131047") return this.err(res, 400, 131047, "Re-engagement message");
      if (mode === "noid") return out(200, { messaging_product: "whatsapp" });
      return out(200, { messaging_product: "whatsapp", contacts: [{ input: "x", wa_id: "x" }], messages: [{ id: `wamid.mock.${this.sendCount}` }] });
    }
    if (req.method === "POST" && sub === "media") {
      this.uploaded.push({ size: body.length, type: String(ct) });
      return out(200, { id: `media.out.${this.uploaded.length}` });
    }
    if (req.method === "POST" && sub === "subscribed_apps" && id) { this.subscribed.add(id); return out(200, { success: true }); }
    if (req.method === "GET" && sub === "phone_numbers" && id) return out(200, { data: (this.wabas.get(id) ?? []).map((p) => ({ id: p })) });
    if (req.method === "GET" && sub === "subscribed_apps" && id && this.subscribedStatus !== 200) return this.err(res, this.subscribedStatus, 1, "gangguan");
    if (req.method === "GET" && sub === "subscribed_apps" && id) return out(200, { data: this.subscribed.has(id) ? [{ whatsapp_business_api_data: { id: this.appId } }] : [] });
    if (req.method === "GET" && id && !sub) {
      const p = this.phones.get(id);
      if (p) return out(200, { id, display_phone_number: p.display, verified_name: p.name });
      const m = this.media.get(id);
      if (m) {
        if (this.mediaInfoStatus !== 200) return this.err(res, this.mediaInfoStatus, 100, "media tidak tersedia");
        return out(200, { id, url: this.overrideMediaUrl ?? `${this.url}/dl/${encodeURIComponent(id)}`, mime_type: m.mime, sha256: m.sha256, file_size: m.bytes.length });
      }
      return this.err(res, 404, 100, "Unsupported get request");
    }
    return this.err(res, 404, 100, "Unknown path");
  }
}
