#!/usr/bin/env node
/**
 * Guard nomor operasional (AGENTS.md §10.1, GATE-CHECKLIST B6).
 * Memastikan identitas channel operasional (Admisi …1119, Hotline …0124) TIDAK muncul di konfigurasi, seed, fixture,
 * kode, atau dokumen non-production.
 *
 * Aturan:
 *  G1  Tidak ada channel yang diberi penanda operasional bernilai benar (flag isOperational) di seed/fixture/config/test.
 *      Pengecualian eksplisit per baris: komentar `guard-operational:allow` (dipakai test yang SENGAJA menguji penolakan).
 *  G2  Tidak ada nomor telepon format Indonesia yang berakhiran 1119 atau 0124 di berkas mana pun.
 *  G3  Tidak ada nomor telepon lengkap sama sekali di repository (aturan data pelanggan, AGENTS.md §3.5).
 *  G4  Jika env OPERATIONAL_NUMBER_HASHES diisi (sha256 dari digit E.164, dipisah koma), nomor apa pun yang hash-nya
 *      cocok = pelanggaran. Hash disimpan sebagai secret CI, BUKAN di repository.
 * Keluaran hanya memuat berkas:baris dan nomor yang DISAMARKAN.
 *
 * Pemakaian: node scripts/guard-operational.mjs [direktori-root]
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { listFiles, readText } from "./lib-files.mjs";

const root = path.resolve(process.argv[2] ?? process.cwd());
// Nomor Indonesia: 08xx…, +628xx…, 628xx…, juga berspasi/bertanda baca: "+62 812 …", "(+62) 812-…". Batas kata mencegah kecocokan pada UUID/hash.
const PHONE = /(?<![\w-])\(?(?:\+?62\)?[\s.-]*|0)8[\d\s().-]{7,14}\d(?![\w-])/g;
const MARKER = /["']?(?:isOperational|is_operational)["']?\s*[:=]\s*true\b/;
const OP_SUFFIX = ["1119", "0124"];
const hashes = new Set((process.env.OPERATIONAL_NUMBER_HASHES ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const digits = (s) => s.replace(/\D/g, "").replace(/^0/, "62");
const mask = (d) => `${d.slice(0, 3)}${"•".repeat(Math.max(d.length - 5, 0))}${d.slice(-2)}`;
const SEED_LIKE = /(^|\/)(seed|seeds|fixtures?|config|tests?|scripts|db|drizzle|deploy|\.github)(\/|$)|\.env|docker-compose|Dockerfile|Caddyfile|\.sql$/i;

const findings = [];
for (const rel of listFiles(root)) {
  const text = readText(root, rel);
  if (text === null) continue;
  text.split("\n").forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (SEED_LIKE.test(rel) && MARKER.test(line) && !line.includes("guard-operational:allow")) {
      findings.push({ rule: "G1", at, msg: "channel bertanda operasional di seed/fixture/config/test" });
    }
    for (const m of line.matchAll(PHONE)) {
      const d = digits(m[0]);
      if (d.length < 10 || d.length > 15) continue;
      if (OP_SUFFIX.some((s) => d.endsWith(s))) findings.push({ rule: "G2", at, msg: `nomor berakhiran operasional (${mask(d)})` });
      else if (hashes.has(createHash("sha256").update(d).digest("hex"))) findings.push({ rule: "G4", at, msg: `nomor operasional terdaftar (${mask(d)})` });
      else findings.push({ rule: "G3", at, msg: `nomor telepon lengkap di repository (${mask(d)})` });
    }
  });
}

if (findings.length) {
  console.error(`GUARD NOMOR OPERASIONAL GAGAL — ${findings.length} temuan:`);
  for (const f of findings) console.error(`  [${f.rule}] ${f.at} — ${f.msg}`);
  process.exit(1);
}
console.log(`Guard nomor operasional lulus (${listFiles(root).length} berkas dipindai${hashes.size ? `, ${hashes.size} hash nomor operasional diperiksa` : ", tanpa daftar hash"}).`);
