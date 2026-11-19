#!/usr/bin/env node
/**
 * Pemindai rahasia lokal (melengkapi gitleaks di CI). AGENTS.md §3.4, GATE-CHECKLIST CCP 1.5.
 * Menolak: kunci privat, token Meta/GitHub/Slack/AWS/Google/Anthropic/OpenAI, JWT, string koneksi berpassword nyata,
 * penetapan rahasia bernilai panjang, dan berkas .env yang ter-track. Keluaran TIDAK pernah mencetak nilai rahasia.
 * Pengecualian per baris: komentar `secret-scan:allow`. Data uji di tests/ dikecualikan HANYA dari aturan generik.
 *
 * Pemakaian: node scripts/secret-scan.mjs [direktori-root]
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { listFiles, readText } from "./lib-files.mjs";

const root = path.resolve(process.argv[2] ?? process.cwd());

const SPECIFIC = [
  ["kunci-privat", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ["token-meta", /\bEA[A-Z][A-Za-z0-9]{40,}\b/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["api-key-llm", /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
];
const PLACEHOLDER = /(GANTI|CHANGEME|CHANGE_ME|EXAMPLE|CONTOH|PLACEHOLDER|YOUR_|<[^>]+>|\$\{|\$[A-Za-z_]\w*|process\.env|x{4,}|\*{3,}|\.{3})/i;
const GENERIC = [
  ["penetapan-rahasia", /\b(?:secret|token|passw(?:or)?d|passwd|api[_-]?key|private[_-]?key|app[_-]?secret|encryption[_-]?key)\b["']?\s*[:=]\s*["'`]?([A-Za-z0-9/+=_-]{20,})["'`]?(?!\s*\()/i],
  ["string-koneksi-berpassword", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:/@]+:([^\s@]{3,})@/i],
];
const TEST_PATH = /(^|\/)tests?\//;

const findings = [];
for (const rel of listFiles(root)) {
  if (/(^|\/)\.env(\..*)?$/.test(rel) && !rel.endsWith(".env.example")) {
    findings.push({ rule: "env-ter-track", at: rel, msg: "berkas .env tidak boleh masuk repository" });
    continue;
  }
  const text = readText(root, rel);
  if (text === null) continue;
  text.split("\n").forEach((line, i) => {
    if (line.includes("secret-scan:allow")) return;
    const at = `${rel}:${i + 1}`;
    for (const [rule, re] of SPECIFIC) if (re.test(line)) findings.push({ rule, at, msg: "pola rahasia terdeteksi (nilai tidak ditampilkan)" });
    if (TEST_PATH.test(rel)) return;
    for (const [rule, re] of GENERIC) {
      const m = re.exec(line);
      if (m && !PLACEHOLDER.test(m[0])) findings.push({ rule, at, msg: "kemungkinan rahasia tertanam (nilai tidak ditampilkan)" });
    }
  });
}

// Berkas .env yang sudah pernah ter-track juga harus ditolak walau kini di-ignore.
try {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n");
  for (const f of tracked) if (/(^|\/)\.env(\..*)?$/.test(f) && !f.endsWith(".env.example") && !findings.some((x) => x.at === f)) findings.push({ rule: "env-ter-track", at: f, msg: "berkas .env ter-track di git" });
} catch { /* bukan repo git */ }

if (findings.length) {
  console.error(`SECRET SCAN GAGAL — ${findings.length} temuan:`);
  for (const f of findings) console.error(`  [${f.rule}] ${f.at} — ${f.msg}`);
  process.exit(1);
}
console.log(`Secret scan lulus (${listFiles(root).length} berkas dipindai).`);
