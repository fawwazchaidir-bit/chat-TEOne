#!/usr/bin/env node
/**
 * Laporan jumlah test per tag @tahap-N dan penjaga regresi (AGENTS.md §10.2, GATE-CHECKLIST B1).
 * Membaca .test-results/vitest.json (+ playwright.json bila ada) dan membandingkan dengan tests/baseline-counts.json
 * yang dipisah per jenis: { "@tahap-N": { "vitest": n, "playwright": m } }.
 *
 * GAGAL (exit 1) bila (G1-A01 — audit Gate 1 — memperketat penjaga ini):
 *  • hasil Vitest HILANG, tidak dapat dibaca/rusak, USANG (lebih lama dari --max-age-min, default 180), atau kosong (0 test);
 *  • Vitest tidak melaporkan `success: true`; ada SUITE/berkas gagal (mis. `afterAll`/global teardown melempar error,
 *    gagal impor, galat runtime) walau semua assertion "passed"; ada assertion gagal;
 *  • bukti exit code Vitest (.test-results/vitest-exit.json, ditulis `npm run test:report`) hilang atau ≠ 0;
 *  • jumlah Vitest/Playwright suatu tag < baseline; ada test vitest skipped/todo/pending;
 *  • hasil E2E ada tetapi: ada kegagalan/galat global/usang, atau tes di-skip tanpa penanda resmi "[BELUM TERSEDIA …]";
 *    hasil E2E WAJIB ada bila `--require-e2e`.
 * Langkah awal CI (setelah vitest) tanpa flag; langkah AKHIR (setelah E2E) dengan `--require-e2e` agar E2E tidak bisa diam-diam dihilangkan.
 * Menulis ringkasan ke .test-results/tag-report.md. Dijalankan lewat `npm run test:report` (pembungkus meneruskan exit code Vitest).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const problems = [];
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"); // kode warna terminal (dibangun saat runtime agar lolos aturan lint no-control-regex)
const maxAgeArg = process.argv.find((a) => a.startsWith("--max-age-min="));
const maxAgeMs = (maxAgeArg ? Number(maxAgeArg.split("=")[1]) : 180) * 60_000;
/** Membaca JSON; berkas rusak = MASALAH (bukan crash dan bukan diam-diam dianggap "tidak ada"). */
const read = (p, { required = false, label = p } = {}) => {
  if (!existsSync(p)) { if (required) problems.push(`${label} tidak ditemukan.`); return null; }
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch { problems.push(`${label} rusak/tidak dapat dibaca sebagai JSON.`); return null; }
};
const tooOld = (when) => {
  const t = typeof when === "number" ? when : Date.parse(when);
  return !Number.isFinite(t) || Date.now() - t > maxAgeMs;
};
const vitest = read(".test-results/vitest.json", { required: true, label: "Hasil Vitest (.test-results/vitest.json) — jalankan `npm run test:report`" });
const vitestExit = read(".test-results/vitest-exit.json", { required: true, label: "Bukti exit code Vitest (.test-results/vitest-exit.json) — hanya ditulis `npm run test:report`; jangan menjalankan vitest manual lalu pelapor" });
const pw = read(".test-results/playwright.json");
const baseline = read("tests/baseline-counts.json") ?? {};
const requireE2e = process.argv.includes("--require-e2e");
const counts = {}; // tag -> {vitest, playwright}
const tagOf = (s) => (s.match(/@tahap-\d+/g) ?? ["(tanpa-tag)"]);
const bump = (tag, kind) => ((counts[tag] ??= { vitest: 0, playwright: 0 })[kind] += 1);
let vTotal = 0, vFail = 0, vSkip = 0, pTotal = 0, pPass = 0, pPlaceholder = 0;

if (vitestExit) {
  if (vitestExit.exitCode !== 0) problems.push(`Vitest keluar dengan kode ${vitestExit.exitCode} (exit code adalah kebenaran; pelaporan tidak boleh menutupinya).`);
  if (vitestExit.finishedAt && tooOld(vitestExit.finishedAt)) problems.push("Bukti exit code Vitest USANG (bukan dari eksekusi ini).");
}
if (vitest) {
  const files = Array.isArray(vitest.testResults) ? vitest.testResults : [];
  if (vitest.success !== true) problems.push("Vitest tidak melaporkan `success: true` untuk keseluruhan eksekusi.");
  if ((vitest.numFailedTestSuites ?? 0) > 0) problems.push(`${vitest.numFailedTestSuites} suite/berkas test gagal (mis. afterAll/teardown melempar error, gagal impor) — walau assertion-nya lulus.`);
  if ((vitest.numRuntimeErrorTestSuites ?? 0) > 0) problems.push(`${vitest.numRuntimeErrorTestSuites} suite mengalami galat runtime.`);
  if ((vitest.numFailedTests ?? 0) > 0) problems.push(`${vitest.numFailedTests} test gagal menurut ringkasan Vitest.`);
  if (!(vitest.numTotalTests > 0) || files.length === 0) problems.push("Hasil Vitest kosong (0 test) — eksekusi tidak menjalankan apa pun.");
  if (tooOld(vitest.startTime)) problems.push("Hasil Vitest USANG atau tanpa waktu mulai yang sah (bukan dari eksekusi ini).");
  for (const f of files) if (f.status !== "passed") {
    const short = String(f.message ?? "").replace(/\s+/g, " ").slice(0, 160);
    problems.push(`BERKAS GAGAL: ${path.relative(process.cwd(), f.name ?? "?")}${short ? ` — ${short}` : ""}`);
  }
}
if (vitest) for (const f of vitest.testResults ?? []) for (const t of f.assertionResults ?? []) {
  vTotal++;
  const name = `${(t.ancestorTitles ?? []).join(" ")} ${t.title}`;
  for (const tag of tagOf(name)) bump(tag, "vitest");
  if (t.status === "failed") {
    vFail++;
    // Sertakan ALASAN singkat (baris pertama pesan kegagalan, tanpa ANSI/stack) agar kegagalan di CI dapat didiagnosis dari log
    // tanpa mengunduh artefak. Hanya pesan assertion test (data sintetis); dipotong 300 karakter.
    const why = String((t.failureMessages ?? [])[0] ?? "").replace(ANSI, "").split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").slice(0, 300);
    problems.push(`GAGAL: ${name}${why ? ` — ${why}` : ""}`);
  }
  else if (t.status !== "passed") { vSkip++; problems.push(`DILEWATI (${t.status}): ${name} — test tidak boleh di-skip/todo tanpa ADR`); }
}

const walkSuites = (suites, parents, fn) => suites?.forEach((s) => {
  const p = [...parents, s.title];
  s.specs?.forEach((sp) => fn(sp, p));
  walkSuites(s.suites, p, fn);
});
if (pw) {
  if (Array.isArray(pw.errors) && pw.errors.length > 0) problems.push(`E2E: ${pw.errors.length} galat global (mis. webServer/global setup gagal).`);
  if ((pw.stats?.unexpected ?? 0) > 0) problems.push(`E2E: ${pw.stats.unexpected} test tidak sesuai harapan (gagal).`);
  if (tooOld(pw.stats?.startTime)) problems.push("Hasil E2E USANG atau tanpa waktu mulai yang sah (bukan dari eksekusi ini).");
}
if (pw) walkSuites(pw.suites, [], (spec, parents) => {
  const name = `${parents.join(" ")} ${spec.title}`;
  const results = spec.tests.flatMap((t) => t.results ?? []);
  const skipped = spec.tests.every((t) => t.status === "skipped" || t.expectedStatus === "skipped");
  pTotal++;
  if (skipped) {
    if (/\[BELUM TERSEDIA/.test(spec.title)) pPlaceholder++;
    else problems.push(`E2E DILEWATI tanpa penanda resmi: ${name}`);
    return;
  }
  for (const tag of tagOf(name)) bump(tag, "playwright");
  if (spec.ok === false || results.some((r) => r.status === "failed" || r.status === "timedOut")) problems.push(`E2E GAGAL: ${name}`);
  else pPass++;
});

if (requireE2e && !pw) problems.push("Hasil E2E (.test-results/playwright.json) tidak ditemukan padahal --require-e2e — E2E tidak berjalan?");
for (const [tag, b] of Object.entries(baseline)) {
  const v = counts[tag]?.vitest ?? 0;
  const e = counts[tag]?.playwright ?? 0;
  if (vitest && v < (b.vitest ?? 0)) problems.push(`REGRESI JUMLAH TEST VITEST: ${tag} = ${v}, baseline minimal ${b.vitest} (test dihapus/dilemahkan?)`);
  if (pw && e < (b.playwright ?? 0)) problems.push(`REGRESI JUMLAH TEST E2E: ${tag} = ${e}, baseline minimal ${b.playwright} (test dihapus/dilemahkan/dilewati?)`);
}

const rows = Object.entries(counts).sort().map(([tag, c]) => {
  const b = baseline[tag];
  return `| ${tag} | ${c.vitest} | ${c.playwright} | ${c.vitest + c.playwright} | ${b ? `${b.vitest ?? 0} / ${b.playwright ?? 0}` : "—"} |`;
});
const md = [
  "# Ringkasan test per tag",
  "",
  "| Tag | Vitest (integrasi/unit) | Playwright (E2E) | Total | Baseline minimal (Vitest / E2E) |",
  "|---|---|---|---|---|",
  ...rows,
  "",
  `Vitest: ${vTotal} test, ${vFail} gagal, ${vSkip} dilewati.`,
  pw ? `Playwright: ${pTotal} spesifikasi, ${pPass} lulus, ${pPlaceholder} placeholder resmi “BELUM TERSEDIA” (G2-nyata, G3–G8; bukan bukti).` : "Playwright: hasil tidak tersedia pada eksekusi ini.",
  problems.length ? `\n**Masalah:**\n${problems.map((p) => `- ${p}`).join("\n")}` : "\nTidak ada masalah.",
].join("\n");
mkdirSync(".test-results", { recursive: true });
writeFileSync(".test-results/tag-report.md", md + "\n");
console.log(md);
if (problems.length) process.exit(1);
