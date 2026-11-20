#!/usr/bin/env node
/**
 * `npm run test:report` — menjalankan Vitest lalu penjaga laporan, dan GAGAL bila SALAH SATUNYA gagal.
 *
 * Perbaikan G1-A01 (audit Gate 1): sebelumnya `vitest run …; node scripts/test-tag-report.mjs` memakai pemisah `;`, sehingga
 * exit code Vitest dibuang dan hanya exit code pelapor yang menentukan status job. Kegagalan tingkat suite (mis. `afterAll`
 * melempar error) membuat Vitest exit 1 tetapi pelapor (yang hanya membaca status assertion) mencetak "Tidak ada masalah".
 *
 * Perilaku:
 *  1. Menghapus hasil lama (.test-results/vitest.json, vitest-exit.json) → hasil usang tidak pernah dianggap hasil baru.
 *  2. Menjalankan Vitest dengan reporter JSON; MENCATAT exit code aslinya di .test-results/vitest-exit.json.
 *  3. Selalu menjalankan pelapor (agar diagnosis tercetak), lalu keluar ≠ 0 bila Vitest ATAU pelapor gagal.
 * Argumen setelah `--` diteruskan ke Vitest (dipakai test regresi penjaga ini).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const vitestPkgPath = require.resolve("vitest/package.json");
const vitestBin = path.join(path.dirname(vitestPkgPath), "vitest.mjs");
const vitestVersion = require(vitestPkgPath).version;
const resultsDir = path.resolve(process.cwd(), ".test-results");
const extra = process.argv.slice(2).filter((a) => a !== "--");

mkdirSync(resultsDir, { recursive: true });
rmSync(path.join(resultsDir, "vitest.json"), { force: true });
rmSync(path.join(resultsDir, "vitest-exit.json"), { force: true });

const startedAt = new Date().toISOString();
const run = spawnSync(process.execPath, [vitestBin, "run", "--reporter=json", `--outputFile=${path.join(resultsDir, "vitest.json")}`, ...extra], { stdio: "inherit" });
// exit code null = dimatikan sinyal / gagal dijalankan → diperlakukan sebagai kegagalan.
const vitestExit = typeof run.status === "number" ? run.status : 1;
writeFileSync(
  path.join(resultsDir, "vitest-exit.json"),
  JSON.stringify({ exitCode: vitestExit, signal: run.signal ?? null, spawnError: run.error ? String(run.error.code ?? "error") : null, startedAt, finishedAt: new Date().toISOString(), nodeVersion: process.version, vitestVersion }, null, 2) + "\n",
);

const report = spawnSync(process.execPath, [path.join(here, "test-tag-report.mjs")], { stdio: "inherit", cwd: process.cwd() });
const reportExit = typeof report.status === "number" ? report.status : 1;

if (vitestExit !== 0) console.error(`\nGAGAL: Vitest keluar dengan kode ${vitestExit}${run.signal ? ` (sinyal ${run.signal})` : ""}.`);
if (reportExit !== 0) console.error("\nGAGAL: penjaga laporan test menemukan masalah (lihat di atas).");
process.exit(vitestExit !== 0 || reportExit !== 0 ? 1 : 0);
