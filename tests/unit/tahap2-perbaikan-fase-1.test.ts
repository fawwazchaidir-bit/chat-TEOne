/**
 * Perbaikan Fase 1 (audit independen Gate 1 & 2, putaran ke-3): tes unit deterministik (tanpa DB; promise terkendali).
 * P1 = G2-B03 (pemicu inline). Tes P3 (echo `to_user_id`) ditambahkan di berkas ini; integrasi DB ada di
 * tests/integration/tahap2-perbaikan-fase-1.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { KICK_BATCHES_PER_ROUND, createKicker } from "@/modules/conversations-messages";

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
