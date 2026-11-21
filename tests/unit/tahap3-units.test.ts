/** Tahap 3 — fungsi murni (kelayakan pesan, templat balasan cepat, akses) dan penjaga arsitektur statis. Tanpa database/jaringan. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "@/modules/conversations-messages/eligibility";
import { ACTION_PERMISSION } from "@/modules/conversations-messages/access";
import { renderTemplate, validateTemplate } from "@/modules/inbox/quick-replies";
import { PERMISSIONS } from "@/modules/roles-permissions/registry";

const root = path.resolve(import.meta.dirname, "../..");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
const src = walk(path.join(root, "src"));
const rel = (f: string) => path.relative(root, f).replaceAll("\\", "/");
const read = (f: string) => readFileSync(f, "utf8");

const NOW = new Date("2026-06-01T10:00:00Z");
const msg = (o: Partial<{ source: string; direction: string; isHistory: boolean; providerTs: Date | null }> = {}) => ({ source: "pelanggan", direction: "masuk", isHistory: false, providerTs: new Date("2026-06-01T09:59:00Z"), ...o });

describe("@tahap-3 kelayakan pesan untuk otomatisasi (fungsi murni; AGENTS §8: ragu → jangan proses)", () => {
  const cases: [string, Parameters<typeof evaluateEligibility>[0], string | true][] = [
    ["pesan pelanggan baru, AI Aktif, tanpa batas", { aiStatus: "aktif", aiBoundaryAt: null, message: msg(), now: NOW }, true],
    ["AI Off → tidak layak", { aiStatus: "off", aiBoundaryAt: null, message: msg(), now: NOW }, "ai_off"],
    ["history → tidak layak", { aiStatus: "aktif", aiBoundaryAt: null, message: msg({ isHistory: true }), now: NOW }, "history"],
    ["sumber history → tidak layak", { aiStatus: "aktif", aiBoundaryAt: null, message: msg({ source: "history" }), now: NOW }, "history"],
    ["pesan keluar → tidak layak", { aiStatus: "aktif", aiBoundaryAt: null, message: msg({ direction: "keluar", source: "te_one" }), now: NOW }, "bukan_pesan_pelanggan"],
    ["echo dari HP → tidak layak", { aiStatus: "aktif", aiBoundaryAt: null, message: msg({ direction: "keluar", source: "whatsapp_business_app" }), now: NOW }, "bukan_pesan_pelanggan"],
    ["tanpa waktu provider → tidak layak (ditinjau)", { aiStatus: "aktif", aiBoundaryAt: null, message: msg({ providerTs: null }), now: NOW }, "waktu_tidak_terbukti"],
    ["waktu di masa depan jauh → tidak layak (ditinjau)", { aiStatus: "aktif", aiBoundaryAt: null, message: msg({ providerTs: new Date("2026-06-01T11:00:00Z") }), now: NOW }, "waktu_tidak_terbukti"],
    ["waktu tidak valid → tidak layak (ditinjau)", { aiStatus: "aktif", aiBoundaryAt: null, message: msg({ providerTs: new Date("bukan tanggal") }), now: NOW }, "waktu_tidak_terbukti"],
    ["sebelum batas aktivasi → tidak layak", { aiStatus: "aktif", aiBoundaryAt: new Date("2026-06-01T09:59:30Z"), message: msg(), now: NOW }, "sebelum_batas"],
    ["tepat PADA batas → tidak layak (batas eksklusif)", { aiStatus: "aktif", aiBoundaryAt: new Date("2026-06-01T09:59:00Z"), message: msg(), now: NOW }, "sebelum_batas"],
    ["satu milidetik sesudah batas → layak", { aiStatus: "aktif", aiBoundaryAt: new Date("2026-06-01T09:58:59.999Z"), message: msg(), now: NOW }, true],
    ["toleransi jam kecil di depan (≤5 menit) → layak", { aiStatus: "aktif", aiBoundaryAt: null, message: msg({ providerTs: new Date("2026-06-01T10:03:00Z") }), now: NOW }, true],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => {
      const r = evaluateEligibility(input);
      if (expected === true) expect(r).toEqual({ eligible: true });
      else expect(r).toMatchObject({ eligible: false, reason: expected });
    });
  }
  it("hanya 'waktu tidak terbukti' yang menandai peninjauan; alasan lain tidak", () => {
    expect(evaluateEligibility({ aiStatus: "aktif", aiBoundaryAt: null, message: msg({ providerTs: null }), now: NOW })).toMatchObject({ review: true });
    for (const m of [msg({ isHistory: true }), msg({ direction: "keluar" })]) expect(evaluateEligibility({ aiStatus: "aktif", aiBoundaryAt: null, message: m, now: NOW })).toMatchObject({ review: false });
  });
});

describe("@tahap-3 balasan cepat: variabel aman", () => {
  it("hanya {nama} dan {channel}; variabel lain ditolak; nilai kosong tidak menyisakan kurung", () => {
    expect(() => validateTemplate("Halo {nama}, dari {channel}")).not.toThrow();
    for (const bad of ["{alamat}", "{password}", "{nama} {token}", "{NAMA}"]) expect(() => validateTemplate(bad), bad).toThrow(/tidak dikenal/);
    expect(renderTemplate("Halo {nama}!", { nama: "Budi" })).toBe("Halo Budi!");
    expect(renderTemplate("Halo {nama}!", {})).toBe("Halo !");
    // isi variabel TIDAK dievaluasi ulang (tak ada injeksi templat berlapis)
    expect(renderTemplate("Halo {nama}", { nama: "{channel}", channel: "X" })).toBe("Halo {channel}");
  });
});

describe("@tahap-3 izin Tahap 3 terdaftar dan dipetakan ke aksi percakapan", () => {
  it("setiap aksi percakapan memetakan ke izin yang tersedia dan bercakupan channel", () => {
    for (const [action, perm] of Object.entries(ACTION_PERMISSION)) {
      const p = PERMISSIONS.find((x) => x.key === perm);
      expect(p, `${action} → ${perm}`).toBeTruthy();
      expect(p!.available, perm).toBe(true);
    }
    for (const key of ["chat.view", "chat.reply", "chat.note", "ai.toggle", "chat.assign", "chat.transfer", "quickreply.manage", "killswitch.channel"]) {
      expect(PERMISSIONS.find((x) => x.key === key)?.available, key).toBe(true);
    }
  });
});

describe("@tahap-3 penjaga arsitektur statis (kontrak inti #4, #5, #6, #7; AGENTS §5, §14)", () => {
  it("status AI hanya diubah lewat setAiState (ai-state.ts); tak ada UPDATE kolom ai_* di tempat lain", () => {
    const offenders = src.filter((f) => !f.endsWith("conversations-messages/ai-state.ts") && /\.set\(\{[^}]*\bai(Status|Version|OffReason|BoundaryAt|ChangedAt)\b/s.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });
  it("otomatisasi tidak memanggil Meta langsung: pengiriman hanya lewat executeSend; penerima & kill switch diperiksa di titik komit", () => {
    const jobs = read(path.join(root, "src/modules/automation/jobs.ts"));
    expect(jobs).not.toMatch(/\b(postMessage|uploadMedia|fetch)\(/);
    expect(jobs).toContain("executeSend(");
    expect(jobs).toContain("preSend");
    expect(jobs).toContain("checkAutomation(");
    expect(jobs).toContain("recipientAllowed(");
    expect(jobs).toContain('.for("update")'); // titik komit dengan baris percakapan dikunci
  });
  it("balasan admin: akses + kebijakan penerima + jendela + AI Off dalam satu transaksi, lalu executeSend (kontrak inti #5)", () => {
    const a = read(path.join(root, "src/modules/inbox/actions.ts"));
    const reply = a.slice(a.indexOf("export async function replyToConversation"), a.indexOf("// ───────────── Catatan internal"));
    const order = ['getConversationForAction(ctx, conversationId, "reply")', "recipientAllowed(", "evaluateWindow(", "setAiState(", "executeSend("].map((s) => reply.indexOf(s));
    expect(order.every((i) => i > 0), String(order)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(reply).not.toMatch(/to:\s*input\.|input\.to\b/); // penerima tidak pernah dari input klien
  });
  it("kill switch: modul otomatisasi hanya memeriksa; jalur kirim otomatis selalu lewat pemeriksaan (checkAutomation) di komit dan sebelum kirim", () => {
    const jobs = read(path.join(root, "src/modules/automation/jobs.ts"));
    expect(jobs.match(/checkAutomation\(/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it("modul Tahap 3 tidak memakai console.log dan tidak mencatat isi chat; tidak ada dangerouslySetInnerHTML di seluruh src (XSS)", () => {
    for (const f of src.filter((x) => /modules\/(inbox|automation|kill-switch)\/|conversations-messages\/(access|ai-state|eligibility|outbox)\.ts/.test(x))) {
      expect(read(f), rel(f)).not.toMatch(/console\.log\(/);
      expect(read(f), rel(f)).not.toMatch(/console\.(error|warn)\([^;]*\b(body|text|payload)\b/);
    }
    expect(src.filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=/.test(read(f))).map(rel)).toEqual([]);
  });
  it("semua route percakapan/inbox/balasan cepat memakai apiFull (sesi penuh + CSRF + 2FA) — tak ada route Tahap 3 tanpa pemeriksaan", () => {
    const routes = src.filter((f) => f.endsWith("route.ts") && /api\/v1\/(conversations|inbox|quick-replies)\//.test(f.replaceAll("\\", "/")) || /api\/v1\/channels\/\[id\]\/(automation-pause|default-team)/.test(f.replaceAll("\\", "/")));
    expect(routes.length).toBeGreaterThanOrEqual(14);
    for (const f of routes) expect(read(f), rel(f)).toMatch(/apiFull\(/);
  });
  it("tabel append-only Tahap 3 dilindungi trigger dan REVOKE (event AI, catatan internal)", () => {
    const sql = read(path.join(root, "drizzle/0005_tahap3_triggers_integrity.sql"));
    expect(sql).toMatch(/te_ai_events_immutable/);
    expect(sql).toMatch(/te_notes_immutable/);
    expect(read(path.join(root, "db/grants.sql"))).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON conversation_ai_events|conversation_ai_events/);
  });
});
