/**
 * G3-T01 — observabilitas endpoint webhook. Setiap cabang respons menghasilkan TEPAT SATU baris log `[webhook]`
 * (kode status + alasan), dan baris log TIDAK PERNAH memuat payload, header tanda tangan, nomor, ID pesan, atau isi pesan.
 * Perilaku respons (status & body) tidak berubah — dibandingkan dengan nilai yang sudah dibekukan di test @tahap-2.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { formatWebhookLog, resetWebhookCounterForTests, signBody, webhookCounterSnapshot, WEBHOOK_REASONS } from "@/modules/whatsapp-adapter";
import { ownerQuery, resetDb } from "../helpers/db";
import { APP_SECRET, CUSTOMER, PHONE_ID, VERIFY_TOKEN, enableConnector, envelope, getChallenge, messagesChange, postWebhook, textMsg, world } from "../helpers/whatsapp";

afterAll(closeDb);
beforeEach(async () => {
  await resetDb();
  resetWebhookCounterForTests();
});
afterEach(() => { vi.restoreAllMocks(); });

// String penanda: bila salah satu muncul di log, berarti payload/tanda tangan/rahasia bocor.
const MARK_BODY = "PENANDA-ISI-PESAN-9f3a";
const MARK_ID = "wamid.PENANDA-ID-7c1e";
const MARK_CHALLENGE = "PENANDA_CHALLENGE_42";

/** Menangkap SEMUA keluaran console selama `fn` berjalan. */
async function capture<T>(fn: () => Promise<T>) {
  const lines: string[] = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(" ")); });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { lines.push(String(chunk).replace(/\n$/, "")); return true; });
  const result = await fn();
  vi.restoreAllMocks();
  const webhook = lines.filter((l) => l.startsWith("[webhook] "));
  return { result, lines, webhook, parsed: webhook.map((l) => JSON.parse(l.slice("[webhook] ".length)) as Record<string, unknown>) };
}
const payload = (id = MARK_ID) => envelope([messagesChange({ messages: [textMsg(id, CUSTOMER, MARK_BODY)] })]);
/** Semua keluaran (bukan hanya baris [webhook]) tidak boleh memuat penanda, tanda tangan, secret, nomor, atau token. */
function expectClean(lines: string[], extra: string[] = []) {
  const all = lines.join("\n");
  for (const s of [MARK_BODY, MARK_ID, MARK_CHALLENGE, CUSTOMER, PHONE_ID, APP_SECRET, VERIFY_TOKEN, "sha256=", ...extra]) expect(all, `bocor: ${s.slice(0, 12)}…`).not.toContain(s);
}

describe("@tahap-3 G3-T01 log webhook: satu baris per cabang, tanpa payload/tanda tangan", () => {
  it("POST sukses → 1 baris info: status 200, reason ok, hitungan received/stored/duplicates/quarantined; kirim ulang → duplicates", async () => {
    await world();
    const raw = JSON.stringify(payload());
    const sig = signBody(raw, APP_SECRET);
    const a = await capture(() => postWebhook(null, { rawOverride: raw, sign: sig }));
    expect(a.result.status).toBe(200);
    expect(JSON.parse(a.result.text)).toEqual({ received: 1, stored: 1, duplicates: 0, quarantined: 0 }); // respons tidak berubah
    expect(a.webhook).toHaveLength(1);
    expect(a.parsed[0]).toMatchObject({ evt: "webhook.whatsapp", method: "POST", status: 200, reason: "ok", bytes: Buffer.byteLength(raw), counts: { received: 1, stored: 1, duplicates: 0, quarantined: 0 } });
    expectClean(a.lines, [sig.slice(7)]);
    // Kasus S7: Meta mengirim ulang ID yang sama → 200, dan log kini MENJELASKAN penyebab 0 event baru.
    const b = await capture(() => postWebhook(null, { rawOverride: raw, sign: sig }));
    expect(b.result.status).toBe(200);
    expect(b.parsed).toEqual([expect.objectContaining({ status: 200, reason: "ok", counts: { received: 1, stored: 0, duplicates: 1, quarantined: 0 } })]);
    expectClean(b.lines, [sig.slice(7)]);
  });

  it("phone_number_id tak dikenal → 200 dengan quarantined=1 tercatat (tanpa menulis phone_number_id ke log)", async () => {
    await world();
    const p = envelope([messagesChange({ phoneId: "123456123", messages: [textMsg(MARK_ID, CUSTOMER, MARK_BODY)] })]);
    const r = await capture(() => postWebhook(p));
    expect(r.result.status).toBe(200);
    expect(r.parsed).toEqual([expect.objectContaining({ status: 200, reason: "ok", counts: expect.objectContaining({ received: 1, quarantined: 1 }) })]);
    expectClean(r.lines, ["123456123"]);
  });

  it("tanda tangan tidak cocok (mis. App Secret berubah) → 401 + 1 baris warn signature_invalid", async () => {
    await world();
    const raw = JSON.stringify(payload());
    const wrong = signBody(raw, "secret-lama-yang-sudah-diganti");
    const r = await capture(() => postWebhook(null, { rawOverride: raw, sign: wrong }));
    expect(r.result).toEqual({ status: 401, text: "tanda tangan tidak valid" });
    expect(r.webhook).toHaveLength(1);
    expect(r.parsed[0]).toMatchObject({ status: 401, reason: "signature_invalid", method: "POST" });
    expectClean(r.lines, [wrong.slice(7), "secret-lama-yang-sudah-diganti"]);
    expect(await ownerQuery("select count(*)::int n from inbound_events").then((q) => q.rows[0].n)).toBe(0);
  });

  it("header tanda tangan tidak ada → 401 + signature_missing", async () => {
    await world();
    const r = await capture(() => postWebhook(payload(), { sign: false }));
    expect(r.result).toEqual({ status: 401, text: "tanda tangan tidak valid" });
    expect(r.parsed).toEqual([expect.objectContaining({ status: 401, reason: "signature_missing" })]);
    expectClean(r.lines);
  });

  it("flag whatsapp_connector mati → 404 + flag_off (POST dan GET)", async () => {
    await enableConnector(false);
    const p = await capture(() => postWebhook(payload()));
    expect(p.result).toEqual({ status: 404, text: "tidak ditemukan" });
    expect(p.parsed).toEqual([expect.objectContaining({ method: "POST", status: 404, reason: "flag_off" })]);
    const g = await capture(() => getChallenge({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": MARK_CHALLENGE }));
    expect(g.result.status).toBe(404);
    expect(g.parsed).toEqual([expect.objectContaining({ method: "GET", status: 404, reason: "flag_off" })]);
    expectClean([...p.lines, ...g.lines]);
  });

  it("body terlalu besar → 413 + too_large (Content-Length dinyatakan maupun body aktual)", async () => {
    await world();
    const big = `{"x":"${MARK_BODY}${"x".repeat(3 * 1024 * 1024)}"}`;
    const actual = await capture(() => postWebhook(null, { rawOverride: big, sign: "sha256=" + "0".repeat(64) }));
    expect(actual.result).toEqual({ status: 413, text: "terlalu besar" });
    expect(actual.parsed).toEqual([expect.objectContaining({ status: 413, reason: "too_large", bytes: Buffer.byteLength(big) })]);
    const declared = await capture(() => postWebhook(null, { rawOverride: "{}", sign: "sha256=" + "0".repeat(64), headers: { "content-length": String(4 * 1024 * 1024) } }));
    expect(declared.result).toEqual({ status: 413, text: "terlalu besar" });
    expect(declared.parsed).toEqual([expect.objectContaining({ status: 413, reason: "too_large", bytes: 4 * 1024 * 1024 })]);
    expectClean([...actual.lines, ...declared.lines]);
  });

  it("tanda tangan sah tetapi bukan JSON → 400 + not_json (isi body tidak dicatat)", async () => {
    await world();
    const raw = `bukan-json ${MARK_BODY} ${CUSTOMER}`;
    const r = await capture(() => postWebhook(null, { rawOverride: raw }));
    expect(r.result).toEqual({ status: 400, text: "bukan JSON" });
    expect(r.parsed).toEqual([expect.objectContaining({ status: 400, reason: "not_json" })]);
    expectClean(r.lines, [signBody(raw, APP_SECRET).slice(7)]);
  });

  it("App Secret tidak dikonfigurasi → 503 + secret_missing", async () => {
    await world();
    const prev = process.env.META_APP_SECRET;
    delete process.env.META_APP_SECRET;
    resetEnvCacheForTests();
    try {
      const r = await capture(() => postWebhook(payload()));
      expect(r.result).toEqual({ status: 503, text: "konfigurasi belum lengkap" });
      expect(r.parsed).toEqual([expect.objectContaining({ status: 503, reason: "secret_missing" })]);
      expectClean(r.lines);
    } finally {
      process.env.META_APP_SECRET = prev;
      resetEnvCacheForTests();
    }
  });

  it("database menolak tulis → 500 + store_failed dengan label error aman saja (tanpa parameter query)", async () => {
    await world();
    await ownerQuery("revoke insert on inbound_events from teone_app");
    let r: Awaited<ReturnType<typeof capture<{ status: number; text: string }>>>;
    try {
      r = await capture(() => postWebhook(payload()));
    } finally {
      await ownerQuery("grant insert on inbound_events to teone_app");
    }
    expect(r.result).toEqual({ status: 500, text: "gagal menyimpan" });
    expect(r.webhook).toHaveLength(1);
    expect(r.parsed[0]).toMatchObject({ status: 500, reason: "store_failed" });
    expect(String(r.parsed[0]?.error)).toMatch(/^pg:\w+$/);
    expectClean(r.lines);
  });

  it("GET challenge: token benar → challenge_ok; salah → challenge_rejected; challenge & token tidak dicatat", async () => {
    await enableConnector();
    const ok = await capture(() => getChallenge({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": MARK_CHALLENGE }));
    expect(ok.result).toEqual({ status: 200, text: MARK_CHALLENGE });
    expect(ok.parsed).toEqual([expect.objectContaining({ method: "GET", status: 200, reason: "challenge_ok" })]);
    const bad = await capture(() => getChallenge({ "hub.mode": "subscribe", "hub.verify_token": "token-salah-PENANDA", "hub.challenge": MARK_CHALLENGE }));
    expect(bad.result).toEqual({ status: 403, text: "ditolak" });
    expect(bad.parsed).toEqual([expect.objectContaining({ method: "GET", status: 403, reason: "challenge_rejected" })]);
    expectClean([...ok.lines, ...bad.lines], ["token-salah-PENANDA"]);
  });

  it("penghitung 24 jam untuk Super Admin: menjumlah per alasan, memisahkan diterima vs ditolak", async () => {
    await world();
    await capture(async () => {
      await postWebhook(payload());
      await postWebhook(payload(), { sign: false });
      await postWebhook(payload(), { sign: signBody("lain", APP_SECRET) });
      await postWebhook(payload(), { sign: signBody("lain", APP_SECRET) });
    });
    const s = webhookCounterSnapshot();
    expect(s.byReason).toEqual({ ok: 1, signature_missing: 1, signature_invalid: 2 });
    expect(s.accepted).toBe(1);
    expect(s.rejected).toBe(3);
    expect(s.lastRejectedHour).toBeInstanceOf(Date);
  });
});

describe("@tahap-3 G3-T01 format log & penghitung (fungsi murni)", () => {
  it("setiap alasan memetakan ke kode status respons yang ada; baris log hanya berisi field daftar putih", () => {
    expect(WEBHOOK_REASONS).toMatchObject({ ok: 200, flag_off: 404, secret_missing: 503, too_large: 413, signature_missing: 401, signature_invalid: 401, not_json: 400, store_failed: 500, challenge_ok: 200, challenge_rejected: 403 });
    const line = formatWebhookLog({ method: "POST", reason: "store_failed", bytes: 12, error: "pg:42501" }, new Date("2026-11-28T00:00:00Z"));
    expect(line).toBe('[webhook] {"evt":"webhook.whatsapp","ts":"2026-11-28T00:00:00.000Z","method":"POST","status":500,"reason":"store_failed","bytes":12,"error":"pg:42501"}');
    expect(line.split("\n")).toHaveLength(1);
  });
  it("label error yang bukan label aman (mis. pesan error berisi spasi/isi) diganti — string bebas tidak bisa masuk log", () => {
    const line = formatWebhookLog({ method: "POST", reason: "store_failed", error: `duplicate key ${MARK_BODY}\nbaris kedua` });
    expect(line).not.toContain(MARK_BODY);
    expect(line).toContain('"error":"label_tidak_aman"');
    expect(line).not.toContain("\n");
  });
  it("penghitung hanya menghitung 24 jam terakhir", async () => {
    const { recordWebhookOutcome } = await import("@/modules/whatsapp-adapter");
    resetWebhookCounterForTests();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const H = 3_600_000;
    const t0 = Date.UTC(2026, 10, 28, 0, 30);
    recordWebhookOutcome({ method: "POST", reason: "signature_invalid" }, t0);
    recordWebhookOutcome({ method: "POST", reason: "ok" }, t0 + 5 * H);
    expect(webhookCounterSnapshot(t0 + 5 * H).rejected).toBe(1);
    expect(webhookCounterSnapshot(t0 + 24 * H).rejected).toBe(0); // slot t0 sudah keluar jendela
    expect(webhookCounterSnapshot(t0 + 24 * H).accepted).toBe(1);
  });
  it("pencatatan tidak pernah melempar error walau console gagal (respons endpoint tidak boleh berubah)", async () => {
    const { recordWebhookOutcome } = await import("@/modules/whatsapp-adapter");
    vi.spyOn(console, "warn").mockImplementation(() => { throw new Error("stdout rusak"); });
    expect(() => recordWebhookOutcome({ method: "POST", reason: "signature_invalid" })).not.toThrow();
  });
});
