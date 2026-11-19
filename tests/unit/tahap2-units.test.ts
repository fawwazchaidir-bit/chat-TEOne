import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { evaluateWindow, WINDOW_MS } from "@/modules/conversations-messages/window";
import { deriveStatus } from "@/modules/conversations-messages/status";
import { sniffMime } from "@/modules/conversations-messages/media";
import { acquireSendSlot, resetRateLimiterForTests } from "@/modules/whatsapp-adapter/rate-limiter";
import { assertSafeBaseUrl, getMetaConfig, isRealMetaEndpoint } from "@/modules/whatsapp-adapter/config";
import { isAllowedMediaUrl } from "@/modules/whatsapp-adapter/client";
import { categorizeMetaError } from "@/modules/whatsapp-adapter/errors";
import { normalizePayload, parseTs } from "@/modules/whatsapp-adapter/normalize";
import { signBody, verifyChallenge, verifySignature } from "@/modules/whatsapp-adapter/signature";
import { CUSTOMER, PHONE_ID, WABA, envelope, messagesChange, statusObj, textMsg } from "../helpers/whatsapp";

const root = path.resolve(import.meta.dirname, "../..");
const cfg = (base: string) => ({ ...getMetaConfig(), graphBaseUrl: base });
afterEach(() => { resetEnvCacheForTests(); });

describe("@tahap-2 tanda tangan & challenge (fungsi murni)", () => {
  const body = '{"object":"whatsapp_business_account"}';
  const sig = signBody(body, "rahasia-uji-1234");
  it("hanya tanda tangan yang tepat (huruf besar/kecil hex sama saja) yang lolos", () => {
    expect(verifySignature(Buffer.from(body), sig, "rahasia-uji-1234")).toBe(true);
    expect(verifySignature(Buffer.from(body), `sha256=${sig.slice(7).toUpperCase()}`, "rahasia-uji-1234")).toBe(true); // hex huruf besar tetap sah
    expect(verifySignature(Buffer.from(body), sig, "rahasia-lain-1234")).toBe(false);
    expect(verifySignature(Buffer.from(body + " "), sig, "rahasia-uji-1234")).toBe(false);
    for (const bad of [null, undefined, "", "sha256=", "sha256=abc", sig.slice(0, -1), sig + "0", "sha1=" + sig.slice(7), sig.replace("sha256=", "")]) expect(verifySignature(Buffer.from(body), bad as string, "rahasia-uji-1234"), String(bad)).toBe(false);
    expect(verifySignature(Buffer.from(body), sig, undefined)).toBe(false);
    expect(verifySignature(Buffer.from(body), sig, "")).toBe(false);
  });
  it("challenge: mode+token+challenge wajib; token dibandingkan aman; karakter berbahaya ditolak", () => {
    const q = (o: Record<string, string>) => new URLSearchParams(o);
    expect(verifyChallenge(q({ "hub.mode": "subscribe", "hub.verify_token": "t0ken-uji", "hub.challenge": "42" }), "t0ken-uji")).toEqual({ ok: true, challenge: "42" });
    expect(verifyChallenge(q({ "hub.mode": "subscribe", "hub.verify_token": "salah", "hub.challenge": "42" }), "t0ken-uji").ok).toBe(false);
    expect(verifyChallenge(q({ "hub.mode": "subscribe", "hub.verify_token": "t0ken-uji", "hub.challenge": "42" }), undefined).ok).toBe(false);
    expect(verifyChallenge(q({ "hub.mode": "subscribe", "hub.verify_token": "t0ken-uji", "hub.challenge": "a b" }), "t0ken-uji").ok).toBe(false);
  });
});

describe("@tahap-2 jendela layanan 24 jam (fungsi murni)", () => {
  const now = new Date("2027-01-10T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it("tabel kasus: terbuka < 24j; tertutup ≥ 24j (batas tepat = tertutup); kosong/masa depan = tidak dapat dipastikan", () => {
    expect(evaluateWindow(ago(1000), now)).toMatchObject({ open: true, reason: "terbuka" });
    expect(evaluateWindow(ago(WINDOW_MS - 1), now).open).toBe(true);
    expect(evaluateWindow(ago(WINDOW_MS), now)).toMatchObject({ open: false, reason: "tertutup" });
    expect(evaluateWindow(ago(WINDOW_MS + 1), now).open).toBe(false);
    expect(evaluateWindow(null, now)).toMatchObject({ open: false, reason: "belum_ada_pesan_pelanggan" });
    expect(evaluateWindow(new Date(now.getTime() + 10 * 60_000), now)).toMatchObject({ open: false, reason: "waktu_tidak_valid" });
    expect(evaluateWindow(new Date(now.getTime() + 60_000), now).open).toBe(true); // selisih jam kecil ditoleransi
    expect(evaluateWindow(new Date("tidak valid"), now).open).toBe(false);
  });
});

describe("@tahap-2 status pesan: turunan dari log, TIDAK bergantung urutan", () => {
  const perms = <T,>(a: T[]): T[][] => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const expected = (s: Set<string>) => (s.has("read") ? "dibaca" : s.has("delivered") ? "diterima" : s.has("failed") ? "gagal" : s.has("sent") ? "terkirim" : "diterima_api");
  it("untuk SEMUA himpunan bagian dari {sent, delivered, read, failed} dan SEMUA urutannya hasilnya identik dan sesuai aturan", () => {
    const all = ["sent", "delivered", "read", "failed"];
    let checked = 0;
    for (let mask = 0; mask < 16; mask++) {
      const subset = all.filter((_, i) => mask & (1 << i));
      const want = expected(new Set(subset));
      for (const order of perms(subset)) {
        expect(deriveStatus("diterima_api", [...order, ...order]), `${order.join(">")}`).toBe(want); // ulangan pun sama
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
  it("status provider tak dikenal diabaikan", () => {
    expect(deriveStatus("diterima_api", ["deleted", "warning"])).toBe("diterima_api");
  });
});

describe("@tahap-2 pembatas kecepatan kirim", () => {
  it("token bucket: kapasitas segera, lalu menunggu pengisian; menyerah setelah batas tunggu", async () => {
    resetRateLimiterForTests();
    let t = 1_000_000;
    const now = () => t;
    const sleep = async (ms: number) => { t += ms; };
    expect(await acquireSendSlot("n1", 2, { now, sleep })).toBe(true);
    expect(await acquireSendSlot("n1", 2, { now, sleep })).toBe(true);
    const before = t;
    expect(await acquireSendSlot("n1", 2, { now, sleep })).toBe(true); // menunggu ±500ms
    expect(t - before).toBeGreaterThanOrEqual(400);
    expect(await acquireSendSlot("n1", 2, { now, sleep, maxWaitMs: 0 })).toBe(false);
    expect(await acquireSendSlot("n2", 2, { now, sleep, maxWaitMs: 0 })).toBe(true); // kunci lain independen
    t += 10_000;
    expect(await acquireSendSlot("n1", 2, { now, sleep, maxWaitMs: 0 })).toBe(true); // terisi ulang
  });
});

describe("@tahap-2 keamanan URL: token hanya ke Meta asli / mock lokal non-production; media hanya dari domain Meta", () => {
  it("isRealMetaEndpoint & assertSafeBaseUrl", () => {
    expect(isRealMetaEndpoint(cfg("https://graph.facebook.com"))).toBe(true);
    expect(isRealMetaEndpoint(cfg("http://127.0.0.1:9"))).toBe(false);
    expect(() => assertSafeBaseUrl(cfg("https://graph.facebook.com"))).not.toThrow();
    expect(() => assertSafeBaseUrl(cfg("http://graph.facebook.com"))).toThrow(); // wajib https
    expect(() => assertSafeBaseUrl(cfg("http://127.0.0.1:9"))).not.toThrow(); // mock lokal di APP_ENV=test
    expect(() => assertSafeBaseUrl(cfg("https://evil.example"))).toThrow(); // token tidak boleh dikirim ke host lain
    expect(() => assertSafeBaseUrl(cfg("http://169.254.169.254"))).toThrow();
    const prev = process.env.APP_ENV;
    process.env.APP_ENV = "production";
    resetEnvCacheForTests();
    try {
      expect(() => assertSafeBaseUrl(cfg("http://127.0.0.1:9"))).toThrow(); // di production, basis non-Meta DITOLAK
      expect(() => assertSafeBaseUrl(cfg("https://graph.facebook.com"))).not.toThrow();
    } finally {
      process.env.APP_ENV = prev;
      resetEnvCacheForTests();
    }
  });
  it("isAllowedMediaUrl: domain Meta via https saja; semua yang lain (SSRF) ditolak", () => {
    const real = cfg("https://graph.facebook.com");
    for (const ok of ["https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", "https://scontent.xx.fbcdn.net/v/x", "https://mmg.whatsapp.net/d/f"]) expect(isAllowedMediaUrl(ok, real), ok).toBe(true);
    for (const bad of ["http://lookaside.fbsbx.com/x", "https://evil.example/x", "https://facebook.com.evil.example/x", "https://notfacebook.com/x", "http://169.254.169.254/latest", "http://127.0.0.1/x", "file:///etc/passwd", "gopher://x", "not a url", "https://fbcdn.net.evil.io/x"]) expect(isAllowedMediaUrl(bad, real), bad).toBe(false);
    expect(isAllowedMediaUrl("http://127.0.0.1:9/dl/x", cfg("http://127.0.0.1:9"))).toBe(true); // mock: origin sama
    expect(isAllowedMediaUrl("http://127.0.0.1:10/dl/x", cfg("http://127.0.0.1:9"))).toBe(false);
  });
});

describe("@tahap-2 sniffing tipe berkas & pemetaan galat", () => {
  it("sniffMime mengenali isi, bukan nama/header", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))).toBe("image/png");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]))).toBe("image/webp");
    for (const bad of [Buffer.from(""), Buffer.from("MZ\x90\x00"), Buffer.from("<svg onload=alert(1)>"), Buffer.from("PK\x03\x04"), Buffer.from("GIF89a")]) expect(sniffMime(bad)).toBeNull();
  });
  it("categorizeMetaError memetakan kode umum; kode tak dikenal → tidak_dikenal; HTTP sebagai cadangan", () => {
    expect(categorizeMetaError(190)).toBe("autentikasi");
    expect(categorizeMetaError(131047)).toBe("jendela_layanan");
    expect(categorizeMetaError(130429)).toBe("rate_limit");
    expect(categorizeMetaError(131026)).toBe("penerima_tidak_valid");
    expect(categorizeMetaError(132001)).toBe("template");
    expect(categorizeMetaError(999999)).toBe("tidak_dikenal");
    expect(categorizeMetaError(null, 429)).toBe("rate_limit");
    expect(categorizeMetaError(null, 503)).toBe("server_meta");
    expect(categorizeMetaError(null, null)).toBe("tidak_dikenal");
  });
});

describe("@tahap-2 normalizer payload Meta: tangguh terhadap input apa pun", () => {
  it("contoh nyata-bentuk: pesan + status dalam satu change → event dengan kunci unik per jenis", () => {
    const ev = normalizePayload(envelope([messagesChange({ messages: [textMsg("wamid.a", CUSTOMER, "hai", "1795000000")], statuses: [statusObj("wamid.b", "delivered")] })]));
    expect(ev.map((e) => [e.kind, e.eventKey])).toEqual([["message", "msg:wamid.a"], ["status", "st:wamid.b:delivered"]]);
    expect(ev[0]).toMatchObject({ meta: { phoneNumberId: PHONE_ID, wabaId: WABA }, providerTs: new Date(1795000000 * 1000).toISOString() });
  });
  it("FUZZ: 4000 struktur JSON acak (bentuk valid/rusak/aneh) tidak pernah melempar error dan selalu menghasilkan ≥ 1 event dengan kunci berformat sah", () => {
    let seed = 987654321;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)] as T;
    const val = (d: number): unknown => {
      const t = rnd();
      if (d <= 0 || t < 0.25) return pick([null, true, false, 0, 1e21, -5, "", "x", "1795000000", "wamid.z", NaN as unknown, "\u0000", "a".repeat(300)]);
      if (t < 0.5) return Array.from({ length: Math.floor(rnd() * 4) }, () => val(d - 1));
      const keys = ["object", "entry", "id", "changes", "field", "value", "metadata", "phone_number_id", "display_phone_number", "messages", "statuses", "contacts", "wa_id", "profile", "name", "from", "type", "text", "body", "image", "document", "timestamp", "status", "recipient_id", "errors", "code", "title", "history", "threads", "message_echoes", "to", "referral", "state_sync", "biz_opaque_callback_data", "media", "mime_type", "sha256", "filename", "caption"];
      return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 6) }, () => [pick(keys), val(d - 1)]));
    };
    for (let i = 0; i < 4000; i++) {
      const body = rnd() < 0.5 ? { object: "whatsapp_business_account", entry: [{ id: pick(["1", 2, null, "waba"]), changes: [{ field: pick(["messages", "smb_message_echoes", "history", "smb_app_state_sync", "lainnya", null]), value: val(4) }] }] } : val(5);
      const ev = normalizePayload(body);
      expect(ev.length).toBeGreaterThanOrEqual(1);
      for (const e of ev) {
        expect(e.eventKey).toMatch(/^(msg|st|echo|hist|histp|cs|unk):/);
        expect(["message", "status", "echo", "history", "contact_sync", "unknown"]).toContain(e.kind);
      }
      expect(normalizePayload(body).map((e) => e.eventKey)).toEqual(ev.map((e) => e.eventKey)); // deterministik → dedup stabil
    }
  });
  it("payload besar (2000 pesan) dinormalisasi cepat; objek non-WhatsApp dikarantina sebagai unknown", () => {
    const t0 = performance.now();
    const ev = normalizePayload(envelope([messagesChange({ messages: Array.from({ length: 2000 }, (_, i) => textMsg(`wamid.${i}`, CUSTOMER, "x")) })]));
    expect(ev).toHaveLength(2000);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(normalizePayload({ object: "instagram", entry: [] })[0]).toMatchObject({ kind: "unknown", reason: "objek_bukan_whatsapp" });
    expect(normalizePayload(null)[0]?.kind).toBe("unknown");
    expect(normalizePayload([])[0]?.kind).toBe("unknown");
  });
  it("parseTs: hanya detik/milidetik epoch yang masuk akal", () => {
    const want = new Date(1795000000 * 1000).toISOString(); // dihitung independen, bukan literal manual
    expect(parseTs("1795000000")).toBe(want);
    expect(parseTs("1795000000000")).toBe(want);
    for (const bad of [null, "", "abc", "-1", "12", "99999999999999", "1000", "0", 1795000000.5]) expect(parseTs(bad), String(bad)).toBeNull();
  });
});

describe("@tahap-2 arsitektur statis: batas modul & jalur kritis", () => {
  const walk = (d: string, out: string[] = []) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(p)) out.push(p); } return out; };
  const src = walk(path.join(root, "src"));
  const rel = (f: string) => path.relative(root, f);
  const read = (f: string) => readFileSync(f, "utf8");

  it("HTTP ke Meta hanya di whatsapp-adapter/client.ts; hanya send.ts (conversations-messages) yang boleh memanggil postMessage/uploadMedia", () => {
    expect(src.filter((f) => /\bfetch\(/.test(read(f)) && /\/src\/(modules|lib)\//.test(f) && !f.endsWith("whatsapp-adapter/client.ts")).map(rel)).toEqual([]);
    const senders = src.filter((f) => /\b(postMessage|uploadMedia)\(/.test(read(f)) && !f.includes("whatsapp-adapter/")).map(rel);
    expect(senders).toEqual(["src/modules/conversations-messages/send.ts"]);
    expect(src.filter((f) => /graph\.facebook\.com/.test(read(f))).map(rel).sort()).toEqual(["src/lib/env.ts", "src/modules/whatsapp-adapter/client.ts", "src/modules/whatsapp-adapter/config.ts"]); // env.ts: hanya nilai bawaan basis URL
  });
  it("whatsapp-adapter tidak bergantung pada modul domain/UI (Meta terisolasi; inbox/AI tidak boleh bocor ke adapter)", () => {
    for (const f of src.filter((x) => x.includes("modules/whatsapp-adapter/"))) {
      const imports = [...read(f).matchAll(/from\s+"(@\/[^"]+)"/g)].map((m) => m[1] as string);
      for (const i of imports) expect(i, `${rel(f)} → ${i}`).not.toMatch(/conversations-messages|contacts|\/app\//);
    }
  });
  it("hook otomatisasi hanya dipancarkan dari cabang 'message' di ingest.ts (echo/history/status tidak pernah)", () => {
    const users = src.filter((f) => /emitCustomerMessage\(/.test(read(f)) && !f.endsWith("events.ts")).map(rel);
    expect(users).toEqual(["src/modules/conversations-messages/ingest.ts"]);
    const ing = read(path.join(root, "src/modules/conversations-messages/ingest.ts"));
    expect(ing.match(/emitCustomerMessage\(/g)).toHaveLength(1);
    const msgCase = ing.slice(ing.indexOf('case "message"'), ing.indexOf('case "echo"'));
    expect(msgCase).toContain("emitCustomerMessage(");
    expect(ing.slice(ing.indexOf('case "echo"'))).not.toContain("emitCustomerMessage(");
  });
  it("webhook: raw body dibaca & tanda tangan divalidasi SEBELUM JSON.parse; penyimpanan sebelum respons sukses; tidak mencatat payload", () => {
    const w = read(path.join(root, "src/app/api/webhooks/whatsapp/route.ts"));
    const post = w.slice(w.indexOf("export async function POST"));
    const order = ["arrayBuffer()", "verifySignature(", "JSON.parse(", "storeEvents(", "status: 200"].map((s) => post.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(post).not.toMatch(/console\.(log|info|debug)/);
    expect(post).not.toMatch(/console\.error\([^)]*(body|raw|payload|\.message)/);
  });
  it("tidak ada console.log di modul Tahap 2 (hindari kebocoran isi chat); error memakai label aman", () => {
    for (const f of src.filter((x) => /modules\/(whatsapp-adapter|conversations-messages|contacts)\//.test(x))) {
      const t = read(f);
      expect(t, rel(f)).not.toMatch(/console\.log\(/);
      expect(t, rel(f)).not.toMatch(/console\.error\([^;]*\.message\b/);
    }
  });
  it("Tahap 2 tidak membawa konektor tidak resmi, dan belum membangun inbox/AI/label/pipeline/follow-up", () => {
    const pkg = JSON.parse(read(path.join(root, "package.json")));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(" ")).not.toMatch(/baileys|whatsapp-web|waha|venom|wppconnect/i);
    expect(src.some((f) => /ai-agents|pipelines|follow-up|program-cards|\/labels\/|\/templates\/|\/inbox\//.test(rel(f)))).toBe(false);
  });
});
