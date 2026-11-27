/**
 * Mock Meta Graph API untuk E2E (SIMULASI — BUKAN Meta). Berjalan sebagai proses terpisah agar server aplikasi (next start) dapat memanggilnya
 * lewat META_GRAPH_BASE_URL. Port kontrol (JSON) dipakai spec untuk membuktikan "tepat satu panggilan kirim" dan memprogram perilaku.
 */
import http from "node:http";
import { MockGraph, type SendMode, type SmbMode } from "../helpers/mock-graph";
import { E2E_CTL_PORT, E2E_ENV, E2E_GRAPH_PORT } from "./env";

const mock = new MockGraph();
mock.token = E2E_ENV.META_ACCESS_TOKEN;

const sends = () => mock.sends().map((c, i) => ({ wamid: `wamid.mock.${i + 1}`, to: (c.json as { to?: string } | undefined)?.to ?? null, type: (c.json as { type?: string } | undefined)?.type ?? null, text: (c.json as { text?: { body?: string } } | undefined)?.text?.body ?? null }));

async function main() {
await mock.start(E2E_GRAPH_PORT);
const ctl = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://x");
    const out = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname === "/health") return out(200, { ok: true });
    if (url.pathname === "/sends") return out(200, sends());
    if (url.pathname === "/reset" && req.method === "POST") { mock.reset(); mock.token = E2E_ENV.META_ACCESS_TOKEN; return out(200, { ok: true }); }
    if (url.pathname === "/mode" && req.method === "POST") { mock.sendMode = (JSON.parse(Buffer.concat(chunks).toString() || "{}").sendMode ?? "ok") as SendMode; return out(200, { ok: true }); }
    // S-12: bukti jumlah panggilan SMB App Data API (SIMULASI) + pemrograman perilakunya + pendaftaran nomor di mock agar pemetaan dapat "terverifikasi" (mode simulasi).
    if (url.pathname === "/smb-calls") return out(200, mock.smbCalls().map((c) => ({ path: c.path.replace(/\/\d+\//, "/<id>/"), syncType: (c.json as { sync_type?: string } | undefined)?.sync_type ?? null })));
    if (url.pathname === "/smb-mode" && req.method === "POST") { mock.smbMode = (JSON.parse(Buffer.concat(chunks).toString() || "{}").smbMode ?? "ok") as SmbMode; return out(200, { ok: true }); }
    if (url.pathname === "/register" && req.method === "POST") {
      const b = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { phoneId: string; wabaId: string; display: string };
      mock.phones.set(b.phoneId, { display: b.display, name: "Nomor Uji (mock)" }); mock.wabas.set(b.wabaId, [b.phoneId]); mock.subscribed.add(b.wabaId);
      return out(200, { ok: true });
    }
    return out(404, { error: "tidak dikenal" });
  });
});
ctl.listen(E2E_CTL_PORT, "127.0.0.1", () => console.log(`[e2e] mock Graph: ${E2E_GRAPH_PORT}, kontrol: ${E2E_CTL_PORT}`));
const stop = () => { ctl.close(); void mock.stop().then(() => process.exit(0)); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
}
void main();
