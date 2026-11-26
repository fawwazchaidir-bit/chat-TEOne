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
 *  G5  Jika env OPERATIONAL_META_ID_HASHES diisi (sha256 dari digit phone_number_id / WABA ID Meta milik Admisi/Hotline/Kemitraan,
 *      dipisah koma), deretan 10–20 digit apa pun yang hash-nya cocok = pelanggaran (di berkas mana pun, termasuk JSON/URL/`waba_<id>`).
 *      Hash = `printf '%s' <digit> | sha256sum` — HANYA hash yang disimpan (secret CI), bukan ID mentah.
 * Bila salah satu daftar hash kosong/tidak valid, G4/G5 TIDAK AKTIF: guard memberi PERINGATAN jelas (anotasi ::warning di GitHub Actions) dan
 * tetap lulus; set GUARD_REQUIRE_HASHES=1 untuk menjadikannya GAGAL (mis. setelah branch protection aktif). Entri yang bukan sha256 hex
 * 64 karakter diabaikan dengan peringatan (nilainya TIDAK pernah dicetak — bisa saja nomor/ID mentah yang salah ditempel).
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
const parseHashes = (raw) => {
  const all = raw.split(",").map((x) => x.trim()).filter(Boolean);
  const valid = new Set(all.filter((h) => /^[0-9a-f]{64}$/i.test(h)).map((h) => h.toLowerCase()));
  return { valid, invalid: all.length - valid.size };
};
const numberHashes = parseHashes(process.env.OPERATIONAL_NUMBER_HASHES ?? "");
const metaIdHashes = parseHashes(process.env.OPERATIONAL_META_ID_HASHES ?? "");
const hashes = numberHashes.valid;
const META_ID = /(?<!\d)\d{10,20}(?!\d)/g;

const warnings = [];
if (numberHashes.valid.size === 0) warnings.push("OPERATIONAL_NUMBER_HASHES kosong/tidak valid — aturan G4 (hash nomor telepon operasional) TIDAK AKTIF.");
if (metaIdHashes.valid.size === 0) warnings.push("OPERATIONAL_META_ID_HASHES kosong/tidak valid — aturan G5 (hash phone_number_id/WABA ID operasional) TIDAK AKTIF.");
if (numberHashes.invalid) warnings.push(`OPERATIONAL_NUMBER_HASHES: ${numberHashes.invalid} entri bukan sha256 hex 64 karakter dan DIABAIKAN (nilainya tidak dicetak; jangan menaruh nomor mentah).`);
if (metaIdHashes.invalid) warnings.push(`OPERATIONAL_META_ID_HASHES: ${metaIdHashes.invalid} entri bukan sha256 hex 64 karakter dan DIABAIKAN (nilainya tidak dicetak; jangan menaruh ID mentah).`);
if (warnings.length) {
  const inCi = process.env.GITHUB_ACTIONS === "true";
  console.warn("PERINGATAN GUARD NOMOR OPERASIONAL — perlindungan TIDAK penuh:");
  for (const w of warnings) {
    console.warn(`  - ${w}`);
    if (inCi) console.log(`::warning title=Guard nomor operasional tidak penuh::${w}`);
  }
  console.warn("  Yang berjalan: G1–G3 (penanda operasional, akhiran 1119/0124, nomor lengkap). Isi secret repository agar G4/G5 aktif (daftar-tindakan-pemilik.md).");
  if (process.env.GUARD_REQUIRE_HASHES === "1") {
    console.error("GUARD NOMOR OPERASIONAL GAGAL — GUARD_REQUIRE_HASHES=1 tetapi daftar hash tidak lengkap.");
    process.exit(1);
  }
}

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
    if (metaIdHashes.valid.size) {
      for (const m of line.matchAll(META_ID)) {
        if (metaIdHashes.valid.has(createHash("sha256").update(m[0]).digest("hex"))) findings.push({ rule: "G5", at, msg: `ID Meta operasional terdaftar (${mask(m[0])})` });
      }
    }
  });
}

if (findings.length) {
  console.error(`GUARD NOMOR OPERASIONAL GAGAL — ${findings.length} temuan:`);
  for (const f of findings) console.error(`  [${f.rule}] ${f.at} — ${f.msg}`);
  process.exit(1);
}
console.log(`Guard nomor operasional lulus (${listFiles(root).length} berkas dipindai${hashes.size ? `, ${hashes.size} hash nomor operasional diperiksa` : ", tanpa daftar hash nomor"}${metaIdHashes.valid.size ? `, ${metaIdHashes.valid.size} hash ID Meta diperiksa` : ", tanpa daftar hash ID Meta"}).`);
