/**
 * Tahap 4 — STRUKTUR: registri izin (aditif, belum tersedia), flag default mati, migrasi expand-only, kode galat, dan keberadaan dokumen dasar.
 * Tidak ada perilaku agent/AI di sini: hanya penjaga bahwa bentuk dan batas Tahap 4 tidak bergeser diam-diam.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PG_ERR } from "@/db/client";
import { FEATURE_FLAGS } from "@/modules/feature-flags";
import { PERMISSIONS, PERMISSION_META } from "@/modules/roles-permissions/registry";

const root = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");
const migration = (prefix: string) => read(`drizzle/${readdirSync(path.join(root, "drizzle")).find((f) => f.startsWith(prefix)) as string}`);

describe("@tahap-4 struktur: registri izin (prompt §17) — aditif dan jujur 'belum tersedia'", () => {
  const NEW_KEYS = ["agent.view", "agent.publish", "agent.place", "programcard.manage", "programcard.publish", "knowledge.publish", "ai.simulator", "ai.testset", "ai.audit"];
  it("tiap izin baru terdaftar, berlabel, bercakupan channel, BELUM tersedia (fiturnya belum ada) dan dapat didelegasikan (bukan khusus Super Admin)", () => {
    for (const k of NEW_KEYS) {
      const m = PERMISSION_META[k];
      expect(m, k).toBeTruthy();
      expect(m!.label.length, k).toBeGreaterThan(5);
      expect(m!.channelScoped, k).toBe(true);
      expect(m!.available, `${k} tidak boleh 'tersedia' sebelum fiturnya ada`).toBe(false);
      expect((m as { superAdminOnlyGrant?: boolean }).superAdminOnlyGrant, k).toBeUndefined();
    }
    const keys = PERMISSIONS.map((p) => p.key as string);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("13 izin yang diminta prompt §17 semuanya terpetakan ke kunci yang ADA (baru atau lama); tidak ada yang hilang", () => {
    const peta: Record<string, string> = {
      "lihat agent": "agent.view", "ubah agent": "agent.manage", "terbitkan agent": "agent.publish", "tempatkan agent di channel": "agent.place",
      "kelola Kartu Program": "programcard.manage", "terbitkan Kartu Program": "programcard.publish", "kelola knowledge": "knowledge.manage", "terbitkan knowledge": "knowledge.publish",
      "gunakan simulator": "ai.simulator", "jalankan set uji": "ai.testset", "ubah AI On/Off": "ai.toggle", "lihat audit AI": "ai.audit", "kill switch AI": "killswitch.channel",
    };
    expect(Object.keys(peta)).toHaveLength(13);
    for (const [maksud, key] of Object.entries(peta)) expect(PERMISSION_META[key], `${maksud} → ${key}`).toBeTruthy();
  });
  it("izin yang sudah ada TIDAK berubah bentuk (kontrak Tahap 1–3): kunci, cakupan channel, penanda khusus Super Admin", () => {
    expect(PERMISSION_META["agent.manage"]).toMatchObject({ channelScoped: true });
    expect(PERMISSION_META["knowledge.manage"]).toMatchObject({ channelScoped: true });
    expect(PERMISSION_META["ai.toggle"]).toMatchObject({ channelScoped: true, available: true });
    expect(PERMISSION_META["killswitch.channel"]).toMatchObject({ channelScoped: true, available: true });
    expect(PERMISSION_META["killswitch.manage"]).toMatchObject({ channelScoped: false, superAdminOnlyGrant: true });
  });
});

describe("@tahap-4 struktur: feature flag dan batas tahap", () => {
  it("flag `ai_agents` (Tahap 4) terdaftar dan TIDAK menyala bawaan; tidak ada flag Tahap 4 lain yang diam-diam menyala", () => {
    const f = FEATURE_FLAGS.find((x) => x.key === "ai_agents");
    expect(f).toMatchObject({ key: "ai_agents", stage: 4 });
    expect(FEATURE_FLAGS.filter((x) => x.stage === 4).map((x) => x.key)).toEqual(["ai_agents"]); // simulator/knowledge/kartu memakai flag yang sama (ADR-0010)
  });
  it("belum ada modul perilaku Tahap 4 di src (ai-agents/program-cards/knowledge): struktur lebih dulu, perilaku menyusul per gate", () => {
    const walk = (d: string, out: string[] = []): string[] => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else out.push(p); } return out; };
    const hit = walk(path.join(root, "src")).filter((f) => /\/(ai-agents|program-cards|knowledge)\//.test(f));
    expect(hit).toEqual([]);
  });
});

describe("@tahap-4 struktur: migrasi 0007–0008 (maju saja, expand-only) dan kode galat", () => {
  it("0007 hanya MEMBUAT tabel/indeks/FK baru: tidak menyentuh tabel lama (tanpa DROP/ALTER COLUMN/RENAME/TRUNCATE/DELETE data)", () => {
    const sql = migration("0007_");
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b|ALTER COLUMN|SET NOT NULL|(?<!ON )\bDELETE\b|(?<!ON )\bUPDATE\b/i); // "ON DELETE/UPDATE no action" pada FK baru bukan perubahan data
    const alters = [...sql.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(alters.every((t) => /^(ai_|program_card|knowledge_)/.test(t as string)), `ALTER pada tabel lama: ${alters}`).toBe(true); // hanya FK pada tabel baru
    expect([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort()).toEqual(
      ["ai_agent_version_sources", "ai_agent_versions", "ai_agents", "ai_channel_agents", "knowledge_source_agents", "knowledge_source_versions", "knowledge_sources", "program_card_agents", "program_card_versions", "program_cards"],
    );
  });
  it("0008: tiap fungsi penjaga punya pemicu dan kode galat yang terdaftar di PG_ERR; kode TE010–TE014 unik dan tidak bertabrakan dengan TE001–TE003", () => {
    const sql = migration("0008_");
    for (const [fn, trg] of [["te_version_guard", 3], ["te_agent_sources_guard", 1], ["te_agent_in_use_guard", 1], ["te_channel_agent_guard", 1], ["te_active_needs_published", 2]] as const) {
      expect(sql, fn).toContain(`CREATE FUNCTION ${fn}()`);
      expect((sql.match(new RegExp(`EXECUTE FUNCTION ${fn}\\(`, "g")) ?? []).length, fn).toBe(trg);
    }
    const used = [...new Set([...sql.matchAll(/ERRCODE = '(TE\d{3})'/g)].map((m) => m[1]))].sort();
    expect(used).toEqual(["TE010", "TE011", "TE012", "TE013", "TE014"]);
    const codes = Object.values(PG_ERR);
    expect(new Set(codes).size).toBe(codes.length);
    expect(PG_ERR).toMatchObject({ VERSION_IMMUTABLE: "TE010", AGENT_IN_USE: "TE011", PLACEMENT_INVALID: "TE012", ACTIVE_NEEDS_PUBLISHED: "TE013", SOURCES_LOCKED: "TE014" });
    expect(sql).toMatch(/to_tsvector\('indonesian'/);
    expect(sql).toMatch(/USING gin \(content_tsv\)/);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });
});

describe("@tahap-4 struktur: dokumen dasar tersimpan (prompt asli + ADR)", () => {
  it("prompt Tahap 4 disimpan UTUH (bagian kunci hadir; tidak dipotong) dan tidak berubah diam-diam (sidik jari)", () => {
    const t = read("docs/prompts/tahap-4.md");
    for (const h of ["# TAHAP 4", "## 7. Kartu Program", "## 11. Pemeriksaan sebelum setiap balasan AI dikirim", "## 17. Hak akses dan audit", "## 21. Dokumen yang diserahkan"]) expect(t, h).toContain(h);
    expect(t.split("\n").length).toBeGreaterThan(300);
    expect(createHash("sha256").update(t).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("ADR-0010 dan ADR-0011 ada, berstatus 'Diusulkan' (bukan keputusan final) dan menyebut keputusan bisnis yang masih Terbuka sebagai ASUMSI", () => {
    for (const [f, kata] of [["docs/adr/0010-", "Model data"], ["docs/adr/0011-", "retrieval"]] as const) {
      const file = readdirSync(path.join(root, "docs/adr")).find((x) => `docs/adr/${x}`.startsWith(f));
      expect(file, f).toBeTruthy();
      const t = read(`docs/adr/${file}`);
      expect(t).toMatch(/Status:\*\* Diusulkan/);
      expect(t.toLowerCase()).toContain(kata.toLowerCase());
      expect(t).toMatch(/ASUMSI/);
    }
    expect(read("docs/adr/" + readdirSync(path.join(root, "docs/adr")).find((x) => x.startsWith("0011-")))).toMatch(/D-09[^\n]*Terbuka/);
  });
});
