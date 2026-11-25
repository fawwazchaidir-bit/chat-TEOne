#!/usr/bin/env node
/**
 * Pemeriksaan KONTEKS DOCKER tanpa Docker (tindak lanjut Gate 1–2): meniru isi konteks build — berkas git (dilacak + baru yang tidak di-ignore) dikurangi aturan `.dockerignore` —
 * lalu menjalankan pemeriksaan tipe yang dipakai `next build` (tsconfig.build.json) DI DALAM konteks itu. Menangkap kegagalan seperti
 * `playwright.config.ts: Cannot find module './tests/e2e/env'` (tests/ dikecualikan dari konteks) SEBELUM sampai ke server staging.
 * Bukan pengganti build image sungguhan (job CI "Image Docker" membangunnya); ini pemeriksaan cepat yang dapat direproduksi di mana pun.
 *   node scripts/check-docker-context.mjs
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rules = readFileSync(path.join(root, ".dockerignore"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

// "**" → ".*" dan "*" → "[^/]*" (penanda sementara memakai karakter pribadi U+E000 agar tidak bentrok dengan "*" tunggal).
const toRegex = (pat) => new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\uE000").replace(/\*/g, "[^/]*").replace(/\uE000/g, ".*") + "$");
const compiled = rules.map((r) => (r.startsWith("!") ? { neg: true, re: toRegex(r.slice(1)) } : { neg: false, re: toRegex(r) }));
/** Aturan Docker: pola cocok dengan jalur atau salah satu direktori induknya; baris belakangan menang (negasi `!` memasukkan kembali). */
export function ignored(file) {
  const parts = file.split("/");
  const prefixes = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  let out = false;
  for (const c of compiled) if (prefixes.some((p) => c.re.test(p))) out = !c.neg;
  return out;
}

const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root }).toString().split("\0").filter(Boolean).filter((f) => existsSync(path.join(root, f)));
const kept = files.filter((f) => !ignored(f));
const tmp = mkdtempSync(path.join(os.tmpdir(), "teone-dockerctx-"));
try {
  for (const f of kept) { mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); cpSync(path.join(root, f), path.join(tmp, f)); }
  if (existsSync(path.join(root, "next-env.d.ts"))) cpSync(path.join(root, "next-env.d.ts"), path.join(tmp, "next-env.d.ts")); // dibuat otomatis oleh next build di image
  symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"), "dir");
  console.log(`konteks tiruan: ${kept.length}/${files.length} berkas (dikecualikan .dockerignore: ${files.length - kept.length}; tests/ ada di konteks: ${kept.some((f) => f.startsWith("tests/")) ? "YA" : "tidak"})`);
  execFileSync(path.join(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.build.json", "--noEmit"], { cwd: tmp, stdio: "inherit" });
  console.log("✔ pemeriksaan tipe `next build` lulus di dalam konteks Docker tiruan");
} catch {
  console.error("✘ pemeriksaan tipe GAGAL di dalam konteks Docker tiruan — berkas yang dirujuk tsconfig.build.json tidak ada di konteks (.dockerignore)");
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
