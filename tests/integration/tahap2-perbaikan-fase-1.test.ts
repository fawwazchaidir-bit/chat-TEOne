/**
 * Perbaikan Fase 1 — integrasi (PostgreSQL nyata, Meta SIMULASI). P1 = G2-B03 (pemicu inline).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { resetEnvCacheForTests } from "@/lib/env";
import { kickProcessing, waitForKickIdle } from "@/modules/conversations-messages";
import { normalizePayload, storeEvents } from "@/modules/whatsapp-adapter";
import { ownerQuery, resetDb } from "../helpers/db";
import { CUSTOMER, envelope, messagesChange, postWebhook, secAgo, textMsg, world } from "../helpers/whatsapp";

const q = async (sql: string, p: unknown[] = []) => (await ownerQuery(sql, p)).rows;
const count = async (table: string, where = "true") => (await q(`select count(*)::int n from ${table} where ${where}`))[0].n as number;

let prevInline: string | undefined;
beforeAll(() => { prevInline = process.env.WORKER_INLINE; process.env.WORKER_INLINE = "true"; resetEnvCacheForTests(); });
afterAll(async () => {
  if (prevInline === undefined) delete process.env.WORKER_INLINE; else process.env.WORKER_INLINE = prevInline;
  resetEnvCacheForTests();
  await closeDb();
});
beforeEach(resetDb);

/** Menyimpan event TANPA memicu kick (meniru webhook yang sudah 200 tetapi belum diproses). Pesan lama → tidak layak otomatisasi (lebih cepat). */
async function storeMessages(prefix: string, n: number, from = CUSTOMER) {
  const msgs = Array.from({ length: n }, (_, i) => textMsg(`wamid.uji.${prefix}.${i}`, from, `isi ${prefix} ${i}`, secAgo(7200)));
  for (let i = 0; i < msgs.length; i += 30) await storeEvents(normalizePayload(envelope([messagesChange({ messages: msgs.slice(i, i + 30) })])));
}

describe("@tahap-2 G2-B03 (integrasi) pemrosesan inline tidak menyisakan event pending", () => {
  it("lonjakan 450 event tersimpan → SATU kick memprosesnya semua tanpa menunggu webhook berikutnya (kode lama berhenti di 200)", async () => {
    await world();
    await storeMessages("burst", 450);
    expect(await count("inbound_events", "status = 'pending'")).toBe(450);
    kickProcessing();
    await waitForKickIdle();
    expect(await count("inbound_events", "status = 'pending'")).toBe(0);
    expect(await count("inbound_events", "status = 'processed'")).toBe(450);
    expect(await count("messages")).toBe(450);
  }, 120_000);

  it("event yang disimpan SELAMA kick berjalan tetap diproses tanpa webhook berikutnya", async () => {
    await world();
    await storeMessages("awal", 60);
    kickProcessing(); // putaran berjalan
    await storeMessages("terlambat", 1); // tersimpan sementara putaran berjalan
    kickProcessing(); // kick saat berjalan → harus menandai kerja baru
    await waitForKickIdle();
    expect(await count("inbound_events", "status = 'pending'")).toBe(0);
    expect(await count("messages", "body = 'isi terlambat 0'")).toBe(1);
  }, 60_000);

  it("jalur webhook SEBENARNYA (route → kickProcessing): pesan terproses tanpa pemanggilan pemroses manual", async () => {
    await world();
    const r = await postWebhook(envelope([messagesChange({ messages: [textMsg("wamid.uji.inline.1", CUSTOMER, "lewat route inline", secAgo(7200))] })]));
    expect(r.status).toBe(200);
    await waitForKickIdle();
    expect(await count("inbound_events", "status = 'pending'")).toBe(0);
    expect((await q("select body from messages"))[0].body).toBe("lewat route inline");
  });
});
