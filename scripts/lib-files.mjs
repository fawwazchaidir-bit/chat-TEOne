// Daftar berkas teks yang dipindai guard/secret-scan. Memakai git bila tersedia (hanya berkas tertrack/belum-tertrack
// yang tidak di-ignore), jika tidak menelusuri direktori. Dipakai bersama oleh guard-operational dan secret-scan.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", ".test-results", "playwright-report", "test-results"]);
const SKIP_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const BINARY = /\.(png|jpe?g|gif|ico|webp|pdf|woff2?|ttf|eot|zip|gz|dump|enc)$/i;

function walk(dir, root, out) {
  for (const f of readdirSync(dir)) {
    if (SKIP_DIRS.has(f)) continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, root, out);
    else out.push(path.relative(root, p));
  }
}

export function listFiles(root) {
  let files;
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    files = out.split("\n").filter(Boolean);
  } catch {
    files = [];
    walk(root, root, files);
  }
  return [...new Set(files)].filter((f) => !SKIP_FILES.has(path.basename(f)) && !BINARY.test(f));
}

export function readText(root, rel) {
  try {
    const t = readFileSync(path.join(root, rel), "utf8");
    return t.includes("\u0000") ? null : t;
  } catch {
    return null;
  }
}
