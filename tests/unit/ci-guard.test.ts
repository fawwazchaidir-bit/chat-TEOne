/**
 * Regresi G1-A01 (audit independen Gate 1): penjaga CI HARUS gagal untuk kegagalan tingkat suite, bukan hanya assertion.
 * Dua lapis, semuanya NYATA (tidak memalsukan hasil gagal dengan mock):
 *  A) `npm run test:report` (pembungkus) menjalankan VITEST SUNGGUHAN pada proyek fixture sementara yang sengaja rusak
 *     (afterAll melempar error, assertion gagal, gagal impor, global teardown gagal, penolakan tak tertangani, tanpa test)
 *     dan wajib keluar ≠ 0 — termasuk kasus yang dulu lolos: Vitest exit 1 tetapi pelapor "Tidak ada masalah".
 *  B) pelapor `test-tag-report.mjs` diberi berkas hasil yang hilang, usang, rusak, kosong, atau berbentuk persis hasil kegagalan
 *     suite (success:false / numFailedTestSuites>0 dengan semua assertion "passed") dan wajib gagal.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const WRAPPER = path.join(root, "scripts", "run-test-report.mjs");
const REPORT = path.join(root, "scripts", "test-tag-report.mjs");
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function project(files: Record<string, string>) {
  const d = mkdtempSync(path.join(os.tmpdir(), "teone-ciguard-"));
  dirs.push(d);
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    writeFileSync(path.join(d, f), c);
  }
  return d;
}
/** Lingkungan bersih: Vitest bersarang tidak boleh mewarisi penanda "sedang berada di dalam worker Vitest". */
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST") && !k.startsWith("TEST_") && k !== "NODE_ENV")) as NodeJS.ProcessEnv;
const sh = (script: string, cwd: string, args: string[] = []) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env: cleanEnv(), timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const wrapper = (cwd: string) => sh(WRAPPER, cwd, ["--", "--globals", "--no-color"]);

const OK_TEST = 'describe("@tahap-1 fixture", () => { it("lulus", () => { expect(1).toBe(1); }); });\n';
const CONFIG_GS = 'export default { test: { globals: true, globalSetup: ["./gs.mjs"] } };\n';

describe("@tahap-1 CI guard (G1-A01) — pembungkus test:report menjalankan Vitest SUNGGUHAN", () => {
  it("kontrol: semua lulus → exit 0 dan 'Tidak ada masalah' (penjaga tidak memblokir yang sehat)", () => {
    const r = wrapper(project({ "a.test.js": OK_TEST }));
    expect(r.out).toContain("Tidak ada masalah");
    expect(r.code).toBe(0);
  });

  it("afterAll melempar error (kasus audit: Vitest exit 1, assertion semua lulus) → pembungkus GAGAL dan menyebut sebabnya", () => {
    const r = wrapper(project({ "a.test.js": 'describe("@tahap-1 x", () => { afterAll(() => { throw new Error("teardown gagal"); }); it("lulus", () => { expect(1).toBe(1); }); });\n' }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/Vitest keluar dengan kode 1/);
    expect(r.out).toMatch(/suite\/berkas test gagal|BERKAS GAGAL/);
    expect(r.out).not.toContain("Tidak ada masalah");
  });

  it("assertion gagal → GAGAL", () => {
    const r = wrapper(project({ "a.test.js": 'describe("@tahap-1 x", () => { it("salah", () => { expect(1).toBe(2); }); });\n' }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/GAGAL: .*salah/);
  });

  it("berkas test gagal diimpor (galat runtime suite) → GAGAL", () => {
    const r = wrapper(project({ "a.test.js": 'import "./tidak-ada.js";\ndescribe("@tahap-1 x", () => { it("ok", () => {}); });\n' }));
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain("Tidak ada masalah");
  });

  it("global teardown melempar error → GAGAL", () => {
    const r = wrapper(project({ "a.test.js": OK_TEST, "vitest.config.mjs": CONFIG_GS, "gs.mjs": 'export default function setup() { return () => { throw new Error("global teardown gagal"); }; }\n' }));
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain("Tidak ada masalah");
  });

  it("penolakan promise tak tertangani (test lulus, Vitest exit 1) → GAGAL", () => {
    const r = wrapper(project({ "a.test.js": 'describe("@tahap-1 x", () => { it("lulus", () => { Promise.reject(new Error("tak tertangani")); return new Promise((res) => setTimeout(res, 50)); }); });\n' }));
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain("Tidak ada masalah");
  });

  it("tidak ada test sama sekali → GAGAL (eksekusi kosong tidak dianggap sukses)", () => {
    const r = wrapper(project({ "README.txt": "kosong" }));
    expect(r.code).not.toBe(0);
  });

  it("hasil lama yang ditinggal di .test-results TIDAK dianggap hasil eksekusi baru (dihapus sebelum Vitest berjalan)", () => {
    // hasil 'sukses' palsu dan bukti exit 0 dari masa lalu; eksekusi baru tidak menemukan test → harus tetap GAGAL.
    const old = JSON.stringify({ success: true, numTotalTests: 1, numFailedTests: 0, numFailedTestSuites: 0, startTime: Date.now(), testResults: [{ name: "/x/a.test.ts", status: "passed", assertionResults: [{ ancestorTitles: ["@tahap-1 x"], title: "t", status: "passed" }] }] });
    const d = project({ "README.txt": "kosong", ".test-results/vitest.json": old, ".test-results/vitest-exit.json": JSON.stringify({ exitCode: 0, finishedAt: new Date().toISOString() }) });
    const r = wrapper(d);
    expect(r.code).not.toBe(0);
  });
});

// ───────────── Lapis B: pelapor menolak hasil yang tidak dapat dipercaya ─────────────
const vitestJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numTotalTestSuites: 2, numFailedTestSuites: 0, startTime: Date.now(),
  testResults: [{ name: "/x/a.test.ts", status: "passed", assertionResults: [{ ancestorTitles: ["@tahap-1 fixture"], title: "ok", status: "passed" }] }],
  ...over,
});
const exitJson = (code = 0, finishedAt = new Date().toISOString()) => JSON.stringify({ exitCode: code, finishedAt });
const pwJson = (over: Record<string, unknown> = {}) => JSON.stringify({ stats: { startTime: new Date().toISOString(), expected: 1, unexpected: 0, skipped: 0, flaky: 0 }, errors: [], suites: [], ...over });
const report = (files: Record<string, string>, args: string[] = []) => sh(REPORT, project(files), args);
const GOOD = { ".test-results/vitest.json": vitestJson(), ".test-results/vitest-exit.json": exitJson(0) };

describe("@tahap-1 CI guard (G1-A01) — pelapor menolak hasil yang hilang, usang, rusak, atau menyembunyikan kegagalan", () => {
  it("kontrol: hasil sehat → exit 0", () => {
    const r = report(GOOD);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Tidak ada masalah");
  });
  it("bentuk persis kegagalan afterAll dari audit (success:false, suite gagal, SEMUA assertion 'passed') → GAGAL", () => {
    const r = report({ ".test-results/vitest-exit.json": exitJson(0), ".test-results/vitest.json": vitestJson({ success: false, numFailedTestSuites: 2, testResults: [{ name: "/x/a.test.ts", status: "failed", message: "Error: teardown gagal", assertionResults: [{ ancestorTitles: ["@tahap-1 fixture"], title: "ok", status: "passed" }] }] }) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/success: true/);
    expect(r.out).toMatch(/suite\/berkas test gagal/);
    expect(r.out).toMatch(/BERKAS GAGAL/);
  });
  it("kasus pemisah ';' yang lama: JSON tampak sehat tetapi exit code Vitest 1 → GAGAL (exit code adalah kebenaran)", () => {
    const r = report({ ".test-results/vitest.json": vitestJson(), ".test-results/vitest-exit.json": exitJson(1) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/kode 1/);
  });
  it("hasil Vitest hilang → GAGAL", () => {
    const r = report({ ".test-results/vitest-exit.json": exitJson(0) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Hasil Vitest .* tidak ditemukan/);
  });
  it("bukti exit code hilang (vitest dijalankan manual, bukan lewat test:report) → GAGAL", () => {
    const r = report({ ".test-results/vitest.json": vitestJson() });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/vitest-exit\.json/);
  });
  it("hasil Vitest rusak (bukan JSON) → GAGAL dengan pesan jelas, bukan crash tak terkendali", () => {
    const r = report({ ".test-results/vitest.json": "{ rusak", ".test-results/vitest-exit.json": exitJson(0) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/rusak/);
    expect(r.out).not.toMatch(/SyntaxError|at JSON\.parse/);
  });
  it("hasil USANG (eksekusi kemarin) → GAGAL; --max-age-min dapat diperketat", () => {
    const dayAgo = Date.now() - 24 * 3600_000;
    const r = report({ ".test-results/vitest.json": vitestJson({ startTime: dayAgo }), ".test-results/vitest-exit.json": exitJson(0, new Date(dayAgo).toISOString()) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/USANG/);
    const tenMinAgo = Date.now() - 10 * 60_000;
    const r2 = report({ ".test-results/vitest.json": vitestJson({ startTime: tenMinAgo }), ".test-results/vitest-exit.json": exitJson(0, new Date(tenMinAgo).toISOString()) }, ["--max-age-min=5"]);
    expect(r2.code).toBe(1);
  });
  it("hasil kosong (0 test) → GAGAL", () => {
    const r = report({ ".test-results/vitest.json": vitestJson({ numTotalTests: 0, testResults: [] }), ".test-results/vitest-exit.json": exitJson(0) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/kosong/);
  });
  it("assertion gagal / dilewati → GAGAL (perilaku lama tetap)", () => {
    const failed = report({ ".test-results/vitest-exit.json": exitJson(1), ".test-results/vitest.json": vitestJson({ success: false, numFailedTests: 1, testResults: [{ name: "/x/a.test.ts", status: "failed", assertionResults: [{ ancestorTitles: ["@tahap-1 fixture"], title: "salah", status: "failed" }] }] }) });
    expect(failed.code).toBe(1);
    expect(failed.out).toMatch(/GAGAL: @tahap-1 fixture salah/);
    const skipped = report({ ".test-results/vitest-exit.json": exitJson(0), ".test-results/vitest.json": vitestJson({ testResults: [{ name: "/x/a.test.ts", status: "passed", assertionResults: [{ ancestorTitles: ["@tahap-1 fixture"], title: "skip", status: "skipped" }] }] }) });
    expect(skipped.code).toBe(1);
    expect(skipped.out).toMatch(/DILEWATI/);
  });
  it("baseline turun → GAGAL (perilaku lama tetap)", () => {
    const r = report({ ...GOOD, "tests/baseline-counts.json": JSON.stringify({ "@tahap-1": { vitest: 5, playwright: 0 } }) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/REGRESI JUMLAH TEST VITEST/);
  });
  it("E2E: galat global, test tidak sesuai harapan, usang, atau hasil hilang saat --require-e2e → GAGAL; E2E sehat → lulus", () => {
    expect(report({ ...GOOD, ".test-results/playwright.json": pwJson() }, ["--require-e2e"]).code).toBe(0);
    expect(report({ ...GOOD, ".test-results/playwright.json": pwJson({ errors: [{ message: "webServer gagal" }] }) }).code).toBe(1);
    expect(report({ ...GOOD, ".test-results/playwright.json": pwJson({ stats: { startTime: new Date().toISOString(), unexpected: 2 } }) }).code).toBe(1);
    expect(report({ ...GOOD, ".test-results/playwright.json": pwJson({ stats: { startTime: new Date(Date.now() - 24 * 3600_000).toISOString(), unexpected: 0 } }) }).code).toBe(1);
    expect(report(GOOD, ["--require-e2e"]).code).toBe(1);
  });
});
