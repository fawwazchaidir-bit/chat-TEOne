/**
 * Perbaikan Fase 1 (audit independen Gate 1 & 2, putaran ke-3): tes unit deterministik (tanpa DB; promise terkendali).
 * P1 = G2-B03 (pemicu inline). Tes P3 (echo `to_user_id`) ditambahkan di berkas ini; integrasi DB ada di
 * tests/integration/tahap2-perbaikan-fase-1.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { KICK_BATCHES_PER_ROUND, createKicker } from "@/modules/conversations-messages";
import { normalizePayload } from "@/modules/whatsapp-adapter/normalize";
import { BUSINESS_DISPLAY, CUSTOMER, echoChange, envelope } from "../helpers/whatsapp";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("@tahap-2 G2-B03 pemicu inline tidak boleh meninggalkan event pending", () => {
  it("kick yang datang SAAT putaran berjalan tidak hilang: putaran mengulang sebelum selesai (balapan klaim-kosong vs event baru)", async () => {
    const first = deferred<{ claimed: number }>();
    let calls = 0;
    const k = createKicker({ enabled: () => true, processBatch: () => (++calls === 1 ? first.promise : Promise.resolve({ claimed: 0 })) });
    k.kick(); // putaran 1 menunggu klaim pertama (snapshot DB SEBELUM event baru tersimpan)
    expect(calls).toBe(1);
    k.kick(); // event baru tersimpan lalu kick, sementara putaran 1 masih berjalan
    expect(k.state().dirty).toBe(true);
    first.resolve({ claimed: 0 }); // klaim pertama kosong → pada kode lama putaran berhenti dan event baru tertinggal `pending`
    await k.idle();
    expect(calls).toBe(2); // diulang karena ada kerja baru
    expect(k.state()).toMatchObject({ running: false, dirty: false });
  });

  it("lonjakan > 200 event: batas 10 batch/putaran tidak menyisakan event — putaran berikutnya dijadwalkan sampai klaim kosong", async () => {
    let remaining = 450, batches = 0, yields = 0;
    const k = createKicker({
      enabled: () => true,
      processBatch: async () => { batches++; const n = Math.min(20, remaining); remaining -= n; return { claimed: n }; },
      yieldNow: async () => { yields++; },
    });
    k.kick();
    await k.idle();
    expect(KICK_BATCHES_PER_ROUND).toBe(10);
    expect(remaining).toBe(0);
    expect(yields).toBe(2); // putaran penuh pertama dan kedua (masing-masing 10 batch berisi) menyerahkan giliran
    expect(batches).toBe(24); // 23 batch berisi + 1 batch kosong penutup
  });

  it("kick beruntun saat berjalan TIDAK menjalankan loop paralel (tepat satu putaran aktif)", async () => {
    let active = 0, maxActive = 0, left = 45;
    const k = createKicker({
      enabled: () => true,
      processBatch: async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((r) => setTimeout(r, 2)); active--; const n = Math.min(20, left); left -= n; return { claimed: n }; },
    });
    for (let i = 0; i < 8; i++) k.kick();
    await k.idle();
    expect(maxActive).toBe(1);
    expect(left).toBe(0);
  });

  it("flag WORKER_INLINE mati → tidak memproses apa pun dan tidak menandai kerja", async () => {
    const processBatch = vi.fn(async () => ({ claimed: 1 }));
    const k = createKicker({ enabled: () => false, processBatch });
    k.kick();
    await k.idle();
    expect(processBatch).not.toHaveBeenCalled();
    expect(k.state()).toMatchObject({ running: false, dirty: false });
  });

  it("galat sementara (mis. DB terputus) → dicoba ulang tertunda lalu pulih; event tidak ditinggalkan", async () => {
    let calls = 0, remaining = 30;
    const logs: string[] = [];
    const k = createKicker({
      enabled: () => true, retryDelayMs: 5, log: (m) => logs.push(m),
      processBatch: async () => { if (++calls <= 2) throw new Error("koneksi putus"); const n = Math.min(20, remaining); remaining -= n; return { claimed: n }; },
    });
    k.kick();
    await vi.waitFor(() => { expect(remaining).toBe(0); }, { timeout: 2000 });
    expect(logs.length).toBe(2);
    expect(logs.join("\n")).not.toContain("koneksi putus"); // label aman, tanpa pesan galat mentah
  });

  it("galat berkepanjangan → berhenti setelah batas percobaan ulang (tidak berputar selamanya); kick berikutnya berjalan lagi", async () => {
    let calls = 0, fail = true;
    const k = createKicker({ enabled: () => true, retryDelayMs: 3, maxErrorRetries: 2, log: () => {}, processBatch: async () => { calls++; if (fail) throw new Error("x"); return { claimed: 0 }; } });
    k.kick();
    await vi.waitFor(() => { expect(calls).toBe(3); }, { timeout: 2000 }); // 1 percobaan + 2 ulang
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toBe(3);
    expect(k.state().retryScheduled).toBe(false);
    fail = false;
    k.kick();
    await k.idle();
    expect(calls).toBe(4);
  });
});

describe("@tahap-2 G2-B04/S-11 normalizer echo: penerima dari `to`, `to_user_id`, dan contacts[] yang terbukti", () => {
  const echo = (fields: Record<string, unknown>, contacts?: Record<string, unknown>[]) =>
    normalizePayload(envelope([echoChange([{ from: BUSINESS_DISPLAY, id: "wamid.uji.n1", timestamp: "1700255121", type: "text", text: { body: "x" }, ...fields }], undefined, contacts)]));
  const first = (evs: ReturnType<typeof normalizePayload>) => {
    const e = evs[0];
    if (!e || e.kind !== "echo") throw new Error(`bukan echo: ${e?.kind}`);
    return e;
  };

  it("`to` saja → nomor (digit) tanpa BSUID; bentuk resmi Meta (from/to/id/timestamp/type/text.body) terbaca", () => {
    const e = first(echo({ to: `+${CUSTOMER}` }));
    expect(e).toMatchObject({ to: CUSTOMER, toUserId: null, contact: null });
    expect(e.message).toMatchObject({ id: "wamid.uji.n1", from: BUSINESS_DISPLAY, type: "text", text: "x" });
    expect(e.eventKey).toBe("echo:wamid.uji.n1");
  });
  it("`to_user_id` saja (nomor dihilangkan Meta) → BSUID terbaca, nomor null", () => {
    expect(first(echo({ to_user_id: "BSUID.UJI.A" }))).toMatchObject({ to: null, toUserId: "BSUID.UJI.A", contact: null });
  });
  it("keduanya → keduanya terbaca", () => {
    expect(first(echo({ to: CUSTOMER, to_user_id: "BSUID.UJI.A" }))).toMatchObject({ to: CUSTOMER, toUserId: "BSUID.UJI.A" });
  });
  it("tidak ada keduanya → null/null (ingest yang memutuskan karantina); event tetap dikenali sebagai echo, tidak hilang", () => {
    expect(first(echo({}))).toMatchObject({ to: null, toUserId: null, contact: null });
  });
  it("contacts[] dipakai HANYA bila terbukti milik echo itu (pengenal sama, tidak bertentangan); tanpa fallback ke entri pertama", () => {
    const proven = { wa_id: CUSTOMER, user_id: "BSUID.UJI.B", profile: { username: "peserta.uji" } };
    expect(first(echo({ to_user_id: "BSUID.UJI.B" }, [proven])).contact).toMatchObject({ waId: CUSTOMER, userId: "BSUID.UJI.B" });
    expect(first(echo({ to: CUSTOMER }, [proven])).contact).toMatchObject({ userId: "BSUID.UJI.B" });
    expect(first(echo({ to_user_id: "BSUID.UJI.B" }, [{ wa_id: "15550007777", user_id: "BSUID.LAIN" }, proven])).contact).toMatchObject({ userId: "BSUID.UJI.B" }); // bukan entri pertama
    expect(first(echo({ to_user_id: "BSUID.UJI.B" }, [{ wa_id: CUSTOMER, user_id: "BSUID.LAIN" }])).contact).toBeNull(); // bertentangan → tidak dipakai
    expect(first(echo({ to_user_id: "BSUID.UJI.B" }, [{ wa_id: CUSTOMER }])).contact).toBeNull(); // tanpa pengenal yang sama → tidak terbukti
    expect(first(echo({ to_user_id: "BSUID.UJI.B" }, [proven, { wa_id: "15550007777", user_id: "BSUID.UJI.B" }])).contact).toBeNull(); // ambigu → tidak ada
    expect(first(echo({}, [proven])).contact).toBeNull(); // tanpa penerima, contacts[] sendirian bukan bukti
  });
});
