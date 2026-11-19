import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { processInboundBatch } from "@/modules/conversations-messages";
import { signBody } from "@/modules/whatsapp-adapter";
import { ownerQuery, resetDb } from "../helpers/db";
import { APP_SECRET, CUSTOMER, VERIFY_TOKEN, enableConnector, envelope, getChallenge, listRecipient, mapChannel, messagesChange, postWebhook, statusObj, textMsg, world } from "../helpers/whatsapp";

afterAll(closeDb);
beforeEach(async () => { await resetDb(); });
afterEach(() => { vi.restoreAllMocks(); });

const count = async (table: string, where = "true") => (await ownerQuery(`select count(*)::int n from ${table} where ${where}`)).rows[0].n as number;
const drain = async () => { let total = 0; for (;;) { const r = await processInboundBatch({ limit: 50 }); total += r.claimed; if (!r.claimed) return total; } };
const one = (id = "wamid.uji.1", text = "halo") => envelope([messagesChange({ messages: [textMsg(id, CUSTOMER, text)] })]);

describe("@tahap-2 webhook: verifikasi langganan (challenge)", () => {
  it("token benar → 200 dan challenge dikembalikan apa adanya", async () => {
    await enableConnector();
    const r = await getChallenge({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444" });
    expect(r).toEqual({ status: 200, text: "1158201444" });
  });
  it("token salah / mode salah / challenge hilang / challenge berisi karakter berbahaya → 403", async () => {
    await enableConnector();
    const bad: Record<string, string>[] = [
      { "hub.mode": "subscribe", "hub.verify_token": "salah-salah-salah", "hub.challenge": "123" },
      { "hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "123" },
      { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN },
      { "hub.mode": "subscribe", "hub.challenge": "123" },
      { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "<script>alert(1)</script>" },
      { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "a".repeat(500) },
    ];
    for (const q of bad) expect((await getChallenge(q)).status, JSON.stringify(q)).toBe(403);
  });
  it("feature flag mati → endpoint seolah tidak ada (404), POST maupun GET", async () => {
    await enableConnector(false);
    expect((await getChallenge({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1" })).status).toBe(404);
    expect((await postWebhook(one())).status).toBe(404);
    expect(await count("inbound_events")).toBe(0);
  });
});

describe("@tahap-2 CCP 2.1: validasi tanda tangan pada raw body", () => {
  it("tanda tangan sah → 200 dan event tersimpan", async () => {
    await world();
    const r = await postWebhook(one());
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toMatchObject({ received: 1, stored: 1, duplicates: 0 });
    expect(await count("inbound_events")).toBe(1);
  });

  it("tanpa header / skema salah / panjang salah / bukan hex → 401, tidak ada yang tersimpan", async () => {
    await world();
    for (const sign of [false, "sha1=" + "a".repeat(40), "sha256=", "sha256=" + "z".repeat(64), "sha256=" + "a".repeat(63), "", "plain", "sha256=" + "a".repeat(64) + "00"] as const) {
      const r = await postWebhook(one(), { sign: sign as string | false });
      expect(r.status, String(sign)).toBe(401);
    }
    expect(await count("inbound_events")).toBe(0);
  });

  it("100% dari 90 varian yang diubah ditolak: payload diubah setelah ditandatangani, tanda tangan diubah 1 karakter, rahasia lain", async () => {
    await world();
    const body = JSON.stringify(one("wamid.uji.sig", "saldo 100"));
    const good = signBody(body, APP_SECRET);
    const results: number[] = [];
    for (let i = 0; i < 30; i++) results.push((await postWebhook(null, { rawOverride: body.replace("saldo 100", `saldo ${100 + i + 1}`), sign: good })).status); // payload diubah
    for (let i = 0; i < 30; i++) { const pos = 7 + (i % 64); const c = good[pos] === "a" ? "b" : "a"; results.push((await postWebhook(null, { rawOverride: body, sign: good.slice(0, pos) + c + good.slice(pos + 1) })).status); } // tanda tangan diubah
    for (let i = 0; i < 10; i++) results.push((await postWebhook(null, { rawOverride: body, sign: signBody(body, `rahasia-lain-${i}`) })).status); // secret salah
    for (let i = 0; i < 10; i++) results.push((await postWebhook(null, { rawOverride: body + " ".repeat(i + 1), sign: good })).status); // spasi tambahan di raw body
    expect(results).toHaveLength(80);
    expect(results.every((s) => s === 401)).toBe(true);
    expect(await count("inbound_events")).toBe(0);
    expect((await postWebhook(null, { rawOverride: body, sign: good })).status).toBe(200); // kontrol: yang asli tetap sah
  });

  it("tanda tangan diperiksa SEBELUM parsing: JSON rusak + tanda tangan salah → 401 (bukan 400); JSON rusak + sah → 400", async () => {
    await world();
    expect((await postWebhook(null, { rawOverride: "{bukan json", sign: "sha256=" + "0".repeat(64) })).status).toBe(401);
    expect((await postWebhook(null, { rawOverride: "{bukan json" })).status).toBe(400);
    expect((await postWebhook(null, { rawOverride: "\xff\xfe" })).status).toBe(400); // bukan UTF-8 valid
    expect(await count("inbound_events")).toBe(0);
  });

  it("gagal-tertutup: tanpa META_APP_SECRET webhook menolak semua (503) walau tanda tangan 'sah' terhadap secret apa pun", async () => {
    await world();
    const prev = process.env.META_APP_SECRET;
    delete process.env.META_APP_SECRET;
    resetEnvCacheForTests();
    try {
      const body = JSON.stringify(one());
      expect((await postWebhook(null, { rawOverride: body, sign: signBody(body, "apa-saja") })).status).toBe(503);
      expect(await count("inbound_events")).toBe(0);
    } finally {
      process.env.META_APP_SECRET = prev;
      resetEnvCacheForTests();
    }
  });

  it("payload melebihi batas → 413 sebelum diproses", async () => {
    await world();
    const r = await postWebhook(null, { rawOverride: "x".repeat(3 * 1024 * 1024 + 10), sign: "sha256=" + "0".repeat(64) });
    expect(r.status).toBe(413);
  });

  it("satu payload berisi banyak event (pesan + status + pesan lain) → semuanya tersimpan", async () => {
    await world();
    const p = envelope([
      messagesChange({ messages: [textMsg("wamid.uji.a", CUSTOMER, "satu"), textMsg("wamid.uji.b", CUSTOMER, "dua")], statuses: [statusObj("wamid.keluar.1", "sent"), statusObj("wamid.keluar.1", "delivered")] }),
    ]);
    const r = await postWebhook(p);
    expect(JSON.parse(r.text)).toMatchObject({ received: 4, stored: 4 });
    await drain();
    expect(await count("messages", "direction = 'masuk'")).toBe(2);
    expect(await count("message_status_events")).toBe(2);
  });
});

describe("@tahap-2 CCP 2.2: event DISIMPAN sebelum respons sukses", () => {
  it("database menolak tulis → BUKAN 200 (Meta akan mengirim ulang); setelah pulih, event yang dikirim ulang tersimpan tepat sekali; tanpa kebocoran isi ke log", async () => {
    await world();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await ownerQuery("revoke insert on inbound_events from teone_app");
    let down: { status: number; text: string };
    try {
      down = await postWebhook(one("wamid.uji.db", "RAHASIA-ISI-CHAT-777"));
    } finally {
      await ownerQuery("grant insert on inbound_events to teone_app");
    }
    expect(down.status).toBe(500);
    expect(down.status).not.toBe(200);
    expect(await count("inbound_events")).toBe(0);
    const logged = JSON.stringify(err.mock.calls);
    expect(logged).not.toContain("RAHASIA-ISI-CHAT-777"); // pesan driver memuat parameter query → tidak boleh masuk log
    expect(down.text).not.toContain("RAHASIA");
    // Meta mengirim ulang event yang sama setelah DB pulih:
    expect((await postWebhook(one("wamid.uji.db", "RAHASIA-ISI-CHAT-777"))).status).toBe(200);
    expect(await count("inbound_events")).toBe(1);
    await drain();
    expect(await count("messages")).toBe(1);
  });

  it("payload dengan banyak event disimpan ATOMIK: bila satu gagal, tidak ada yang tersimpan sebagian", async () => {
    await world();
    await ownerQuery("alter table inbound_events add constraint uji_tolak_kunci check (event_key <> 'msg:wamid.uji.racun')");
    try {
      const p = envelope([messagesChange({ messages: [textMsg("wamid.uji.baik", CUSTOMER, "a"), textMsg("wamid.uji.racun", CUSTOMER, "b")] })]);
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await postWebhook(p)).status).toBe(500);
      expect(await count("inbound_events")).toBe(0); // 'wamid.uji.baik' pun tidak tersimpan
    } finally {
      await ownerQuery("alter table inbound_events drop constraint uji_tolak_kunci");
    }
  });
});

describe("@tahap-2 CCP 2.3: idempotensi event (dedup oleh kunci unik provider)", () => {
  it("payload yang sama dikirim ulang 120× berurutan → 1 event, 1 pesan", async () => {
    await world();
    for (let i = 0; i < 120; i++) expect((await postWebhook(one("wamid.uji.dup", "sama"))).status).toBe(200);
    expect(await count("inbound_events")).toBe(1);
    await drain();
    expect(await count("messages")).toBe(1);
    expect(await count("conversations")).toBe(1);
    expect(await count("contacts")).toBe(1);
  });

  it("40 pengiriman IDENTIK secara paralel → tetap 1 event", async () => {
    await world();
    const rs = await Promise.all(Array.from({ length: 40 }, () => postWebhook(one("wamid.uji.paralel", "paralel"))));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(await count("inbound_events")).toBe(1);
  });

  it("≥100 event berbeda, masing-masing dikirim ulang 2× (total 220 permintaan) → tepat 110 pesan, tanpa duplikat", async () => {
    await world();
    const payloads = Array.from({ length: 110 }, (_, i) => one(`wamid.uji.m${i}`, `isi ${i}`));
    for (const p of payloads) await postWebhook(p);
    await Promise.all(payloads.map((p) => postWebhook(p)));
    for (const p of payloads) await postWebhook(p);
    expect(await count("inbound_events")).toBe(110);
    await drain();
    expect(await count("messages")).toBe(110);
    expect((await ownerQuery("select count(distinct provider_message_id)::int n from messages")).rows[0].n).toBe(110);
    expect(await count("inbound_events", "status = 'processed'")).toBe(110);
  });

  it("event yang SUDAH DIPROSES lalu dikirim ulang oleh Meta: dilaporkan sebagai duplikat, status tetap 'processed', tidak diproses lagi", async () => {
    await world();
    const first = await postWebhook(one("wamid.uji.sudah", "sekali"));
    expect(JSON.parse(first.text)).toMatchObject({ stored: 1, duplicates: 0 });
    await drain();
    const [before] = (await ownerQuery("select id, status, attempts, processed_at from inbound_events")).rows;
    expect(before).toMatchObject({ status: "processed", attempts: 1 });
    for (let i = 0; i < 3; i++) {
      const again = await postWebhook(one("wamid.uji.sudah", "sekali"));
      expect(JSON.parse(again.text)).toMatchObject({ received: 1, stored: 0, duplicates: 1, quarantined: 0 });
    }
    expect((await ownerQuery("select id, status, attempts, processed_at from inbound_events")).rows[0]).toEqual(before); // tidak berubah sama sekali
    expect(await drain()).toBe(0); // tidak ada yang perlu diproses lagi
    expect(await count("messages")).toBe(1);
  });

  it("memproses event yang sudah diproses LAGI (ingest ulang) tidak menggandakan pesan atau memicu hook", async () => {
    await world();
    const { onCustomerMessage } = await import("@/modules/conversations-messages");
    const seen: string[] = [];
    const off = onCustomerMessage((e) => { seen.push(e.messageId); });
    await postWebhook(one("wamid.uji.ulang", "x"));
    await drain();
    await ownerQuery("update inbound_events set status = 'pending', attempts = 0, run_after = now()"); // simulasi pemrosesan ulang paksa
    await drain();
    off();
    expect(await count("messages")).toBe(1);
    expect(seen).toHaveLength(1);
  });

  it("dua channel/listing tidak mengganggu dedup: kunci unik global per provider", async () => {
    const w = await world();
    await listRecipient(CUSTOMER);
    expect(w.channel.id).toBeTruthy();
    await mapChannel((await (await import("../helpers/fixtures")).makeChannel("Hotline — contoh", "Hotline")).id, { phoneId: "200000000000002", waba: "100000000000002" });
    await postWebhook(one("wamid.uji.global", "a"));
    await postWebhook(envelope([messagesChange({ phoneId: "200000000000002", messages: [textMsg("wamid.uji.global", CUSTOMER, "a")] })], "100000000000002"));
    expect(await count("inbound_events")).toBe(1); // wamid unik secara global → event kedua dianggap duplikat
  });
});
