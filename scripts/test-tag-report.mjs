#!/usr/bin/env node
/**
 * Laporan jumlah test per tag @tahap-N dan penjaga regresi (AGENTS.md §10.2, GATE-CHECKLIST B1).
 * Membaca .test-results/vitest.json (+ playwright.json bila ada) dan membandingkan dengan tests/baseline-counts.json.
 * GAGAL bila: jumlah test suatu tag < baseline; ada test vitest yang skipped/todo/pending; ada test Playwright yang
 * di-skip padahal bukan placeholder resmi "[BELUM TERSEDIA …]"; ada test gagal.
 * Menulis ringkasan ke .test-results/tag-report.md.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const vitest = read(".test-results/vitest.json");
const pw = read(".test-results/playwright.json");
const baseline = read("tests/baseline-counts.json") ?? {};
const problems = [];
const counts = {}; // tag -> {vitest, playwright}
const tagOf = (s) => (s.match(/@tahap-\d+/g) ?? ["(tanpa-tag)"]);
const bump = (tag, kind) => ((counts[tag] ??= { vitest: 0, playwright: 0 })[kind] += 1);
let vTotal = 0, vFail = 0, vSkip = 0, pTotal = 0, pPass = 0, pPlaceholder = 0;

if (!vitest) problems.push("Hasil vitest (.test-results/vitest.json) tidak ditemukan — jalankan `npm run test:report`.");
else for (const f of vitest.testResults) for (const t of f.assertionResults) {
  vTotal++;
  const name = `${(t.ancestorTitles ?? []).join(" ")} ${t.title}`;
  for (const tag of tagOf(name)) bump(tag, "vitest");
  if (t.status === "failed") { vFail++; problems.push(`GAGAL: ${name}`); }
  else if (t.status !== "passed") { vSkip++; problems.push(`DILEWATI (${t.status}): ${name} — test tidak boleh di-skip/todo tanpa ADR`); }
}

const walkSuites = (suites, parents, fn) => suites?.forEach((s) => {
  const p = [...parents, s.title];
  s.specs?.forEach((sp) => fn(sp, p));
  walkSuites(s.suites, p, fn);
});
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

for (const [tag, { min }] of Object.entries(baseline)) {
  const now = (counts[tag]?.vitest ?? 0) + (counts[tag]?.playwright ?? 0);
  if (now < min) problems.push(`REGRESI JUMLAH TEST: ${tag} = ${now}, baseline minimal ${min} (test dihapus/dilemahkan?)`);
}

const rows = Object.entries(counts).sort().map(([tag, c]) => {
  const b = baseline[tag]?.min;
  return `| ${tag} | ${c.vitest} | ${c.playwright} | ${c.vitest + c.playwright} | ${b ?? "—"} |`;
});
const md = [
  "# Ringkasan test per tag",
  "",
  "| Tag | Vitest (integrasi/unit) | Playwright (E2E) | Total | Baseline minimal |",
  "|---|---|---|---|---|",
  ...rows,
  "",
  `Vitest: ${vTotal} test, ${vFail} gagal, ${vSkip} dilewati.`,
  pw ? `Playwright: ${pTotal} spesifikasi, ${pPass} lulus, ${pPlaceholder} placeholder resmi “BELUM TERSEDIA” (G2–G8; bukan bukti).` : "Playwright: hasil tidak tersedia pada eksekusi ini.",
  problems.length ? `\n**Masalah:**\n${problems.map((p) => `- ${p}`).join("\n")}` : "\nTidak ada masalah.",
].join("\n");
mkdirSync(".test-results", { recursive: true });
writeFileSync(".test-results/tag-report.md", md + "\n");
console.log(md);
if (problems.length) process.exit(1);
