import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getEnv, resetEnvCacheForTests } from "@/lib/env";

const root = path.resolve(import.meta.dirname, "../..");
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(f)) continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const srcFiles = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => path.relative(root, f);

describe("@tahap-1 arsitektur & kontrol statis", () => {
  it("hanya modul kill-switch yang menulis tabel kill_switches (tidak ada jalur lain yang dapat 'menyalakan kembali')", () => {
    const writers = srcFiles.filter((f) => /\.(insert|update|delete)\(\s*killSwitches\s*\)/.test(readFileSync(f, "utf8"))).map(rel);
    expect(writers).toEqual(["src/modules/kill-switch/index.ts"]);
  });

  it("modul kill-switch tidak memiliki timer/penjadwal/pemulihan otomatis", () => {
    const code = readFileSync(path.join(root, "src/modules/kill-switch/index.ts"), "utf8");
    expect(code).not.toMatch(/setTimeout|setInterval|cron|schedule|expires|ttl/i);
  });

  it("tidak ada konektor WhatsApp tidak resmi (WAHA/Baileys/whatsapp-web.js) di dependensi atau kode — AGENTS.md §3.3", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(" ");
    expect(deps).not.toMatch(/baileys|whatsapp-web|waha|venom|wppconnect/i);
    for (const f of srcFiles) expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/baileys|whatsapp-web\.js|wppconnect/i);
  });

  it("tidak ada tombol/label 'Hubungkan WhatsApp' atau status 'Terhubung' pada UI (Tahap 1 tanpa koneksi nyata)", () => {
    for (const f of srcFiles.filter((x) => x.includes("/app/") && x.endsWith(".tsx"))) {
      const t = readFileSync(f, "utf8");
      expect(t, rel(f)).not.toMatch(/Hubungkan WhatsApp/i);
      expect(t, rel(f)).not.toMatch(/["'>]\s*Terhubung\s*["'<]/);
    }
  });

  it("modul Meta/WhatsApp belum ada (jangan membangun fitur tahap berikutnya)", () => {
    expect(srcFiles.some((f) => /whatsapp-adapter|ai-agents|pipelines|follow-up/.test(rel(f)))).toBe(false);
  });

  it("semua route /api/v1 memakai pembungkus apiFull/apiSession/apiPublic (tidak ada handler tanpa pemeriksaan sesi)", () => {
    const routes = srcFiles.filter((f) => f.endsWith("route.ts") && f.includes("/api/v1/"));
    expect(routes.length).toBeGreaterThan(20);
    for (const f of routes) {
      const t = readFileSync(f, "utf8");
      const exported = [...t.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)];
      expect(exported.length, rel(f)).toBeGreaterThan(0);
      for (const m of exported) {
        const after = t.slice(m.index!, m.index! + 120);
        expect(/apiFull|apiSession|apiPublic/.test(after), `${rel(f)} ${m[1]}`).toBe(true);
      }
      // hanya login yang boleh publik pada /api/v1
      if (/apiPublic/.test(t)) expect(rel(f)).toBe("src/app/api/v1/auth/login/route.ts");
    }
  });

  it("layanan berizin menolak default: setiap fungsi ekspor di service memeriksa izin/peran", () => {
    for (const f of ["users", "teams", "channels", "roles-permissions", "org-settings"].map((m) => path.join(root, `src/modules/${m}/service.ts`))) {
      const t = readFileSync(f, "utf8");
      expect(t, rel(f)).toMatch(/perms\.can|isSuperAdmin|need\(/);
    }
  });

  it("konfigurasi lingkungan: kunci enkripsi wajib 32 byte dan pesan error tidak membocorkan nilainya", () => {
    const saved = { ...process.env };
    try {
      process.env.APP_ENCRYPTION_KEY = Buffer.from("terlalu-pendek-rahasia").toString("base64");
      resetEnvCacheForTests();
      let msg = "";
      try { getEnv(); } catch (e) { msg = (e as Error).message; }
      expect(msg).toContain("APP_ENCRYPTION_KEY");
      expect(msg).not.toContain(process.env.APP_ENCRYPTION_KEY);
      delete process.env.DATABASE_URL;
      resetEnvCacheForTests();
      expect(() => getEnv()).toThrow(/DATABASE_URL/);
    } finally {
      process.env = saved;
      resetEnvCacheForTests();
    }
  });

  it("next.config: header keamanan terpasang (CSP, frame, nosniff, referrer, no-store)", async () => {
    const mod = await import("../../next.config");
    const rules = await mod.default.headers!();
    const h = Object.fromEntries(rules[0]!.headers.map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBeTruthy();
    expect(h["Cache-Control"]).toBe("no-store");
    expect(mod.default.poweredByHeader).toBe(false);
  });

  it("gitleaks: aturan bawaan dipakai; allowlist HANYA untuk aturan generic-api-key di tests/ (tidak boleh melebar)", () => {
    const toml = readFileSync(path.join(root, ".gitleaks.toml"), "utf8").replace(/^\s*#.*$/gm, "");
    expect(toml).toMatch(/useDefault\s*=\s*true/);
    expect((toml.match(/\[\[rules\]\]/g) ?? []).length).toBe(1); // hanya satu aturan yang diubah
    expect(toml).toMatch(/id\s*=\s*"generic-api-key"/);
    expect((toml.match(/\[\[rules\.allowlists\]\]/g) ?? []).length).toBe(1);
    expect(toml).not.toMatch(/\[\[?allowlists?\]\]/); // tidak ada allowlist global (akan mengecualikan SEMUA aturan)
    expect(toml).not.toMatch(/\b(regexes|stopwords|commits)\s*=/); // hanya path
    expect([...toml.matchAll(/paths\s*=\s*\[([^\]]*)\]/g)].map((m) => m[1]!.trim())).toEqual(["'''^tests/'''"]);
  });

  it("CI: gitleaks memakai biner ber-pin checksum (bukan action berbasis rentang commit yang gagal pada root commit)", () => {
    const ci = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/GITLEAKS_SHA256:\s*"[0-9a-f]{64}"/);
    expect(ci).toContain("sha256sum --check --strict");
    expect(ci).toContain("gitleaks detect --source .");
    expect(ci).not.toMatch(/uses:\s*gitleaks\/gitleaks-action/);
    expect(ci).toMatch(/fetch-depth:\s*0/); // riwayat penuh agar seluruh commit dipindai
    expect(ci).toContain("test-tag-report.mjs --require-e2e"); // E2E tidak boleh diam-diam hilang
  });

  it(".env tidak ter-commit dan .gitignore mencakupnya", () => {
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toMatch(/^\.env$/m);
    let tracked = "";
    try { tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" }); } catch { /* repo tanpa git */ }
    expect(tracked.split("\n").filter((f) => /^\.env(\..*)?$/.test(f) && f !== ".env.example")).toEqual([]);
  });
});
