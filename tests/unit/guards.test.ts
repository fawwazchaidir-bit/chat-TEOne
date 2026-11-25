import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function tmp(files: Record<string, string>) {
  const d = mkdtempSync(path.join(os.tmpdir(), "teone-guard-"));
  dirs.push(d);
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    writeFileSync(path.join(d, f), c);
  }
  return d;
}
const run = (script: string, dir: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", script), dir], { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

// Nomor/rahasia sintetis dibangun saat runtime agar berkas test ini sendiri tidak memuat pola terlarang.
const phone = (tail: string) => ["+62", "812", "3456", tail].join("");
const FLAG = ["is", "Operational"].join("");
const FLAG_SQL = ["is", "operational"].join("_");
const GUARD = "guard-operational.mjs";
const SCAN = "secret-scan.mjs";

describe("@tahap-1 guard nomor operasional (CI)", () => {
  it("repository ini lulus", () => {
    const r = run(GUARD, root);
    expect(r.code, r.out).toBe(0);
  });

  it("G1: channel bertanda operasional di seed/fixture/config → GAGAL; dengan pengecualian eksplisit → lulus", () => {
    const bad = tmp({ "seeds/channels.ts": `export const c = { name: 'X', ${FLAG}: true };\n` });
    const r = run(GUARD, bad);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[G1]");
    expect(r.out).toContain("seeds/channels.ts:1");
    const sql = tmp({ "db/seed.sql": `insert into channels(${FLAG_SQL}) values (true); -- ${FLAG_SQL} = true\n` });
    expect(run(GUARD, sql).code).toBe(1);
    const ok = tmp({ "tests/x.test.ts": `const c = { ${FLAG}: true }; // guard-operational:allow — uji penolakan\n` });
    expect(run(GUARD, ok).code).toBe(0);
    const falseVal = tmp({ "seeds/channels.ts": `export const c = { ${FLAG}: false };\n` });
    expect(run(GUARD, falseVal).code).toBe(0);
  });

  it("G2: nomor berakhiran 1119 / 0124 (berbagai format) di berkas mana pun → GAGAL; keluaran disamarkan", () => {
    const dashed = (tail: string) => ["0812", "3456", tail].join("-");
    for (const [file, content, tail] of [
      ["config/a.json", `{"phone":"${phone("1119")}"}`, "1119"],
      ["src/b.ts", `const n = "${["0812", "3456", "0124"].join("")}";`, "0124"],
      ["docs/c.md", `Hubungi ${dashed("1119")} untuk admisi`, "1119"],
      ["docs/d.md", `WA: ${["62", "812", "3456", "0124"].join(" ")}`, "0124"], // kode negara + spasi (sebelumnya lolos!)
      ["docs/e.md", `WA: ${["+62", "812", "3456", "0124"].join(" ")}`, "0124"],
      ["docs/f.md", `WA: (+62) ${["812", "3456", "1119"].join("-")}`, "1119"],
      ["docs/g.md", `WA: ${["+62", "812", "3456", "1119"].join("-")}`, "1119"],
      ["docs/h.md", `WA: ${["0812", "3456", "0124"].join(" ")}`, "0124"],
    ] as const) {
      const r = run(GUARD, tmp({ [file]: content }));
      expect(r.code, `${file}\n${r.out}`).toBe(1);
      expect(r.out).toContain("[G2]");
      expect(r.out).not.toContain("81234561119");
      expect(r.out).not.toContain("81234560124");
      expect(r.out, tail).toContain("•");
    }
  });

  it("G3: nomor telepon lengkap APA PUN di repository → GAGAL (data pelanggan tidak boleh ada)", () => {
    const r = run(GUARD, tmp({ "tests/fixtures/chat.json": `{"from":"${phone("5555")}"}` }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("[G3]");
  });

  it("G4: hash nomor operasional dari secret CI dikenali walau berakhiran biasa", () => {
    const digits = ["62", "812", "9999", "0042"].join("");
    const h = createHash("sha256").update(digits).digest("hex");
    const dir = tmp({ "config/x.ts": `const n = "${["0812", "9999", "0042"].join("-")}";\n` });
    const r = run(GUARD, dir, { OPERATIONAL_NUMBER_HASHES: `deadbeef,${h}` });
    expect(r.code).toBe(1);
    expect(r.out).toContain("[G4]");
    expect(r.out).not.toContain("99990042");
  });

  it("tidak salah-tangkap: UUID, hash, ellipsis di dokumen, dan angka biasa", () => {
    const dir = tmp({
      "drizzle/meta/x.json": `{"id":"6f9619ff-8b86-d011-b42d-081234567890","v":"sha512-0812345678901234567890abcdef"}`,
      "docs/a.md": "Admisi (…1119) dan Hotline (…0124) tidak boleh disentuh. Rp 3.000.000.000 → 10.000.000.000. Tag 4 Mar 2027, 15 Mar 2027.",
      "src/n.ts": "const n = 20261119; const y = 2027;",
    });
    expect(run(GUARD, dir).code, run(GUARD, dir).out).toBe(0);
  });
});

describe("@tahap-1 G1-B04 guard nomor operasional: aturan G5 (ID Meta operasional) dan peringatan bila daftar hash kosong", () => {
  // ID sintetis dibangun saat runtime (berkas test ini tidak memuat deretan 15 digit); bukan ID Meta sungguhan.
  const metaId = ["1000", "0000", "0000", "123"].join("");
  const metaHash = createHash("sha256").update(metaId).digest("hex");
  const otherHash = createHash("sha256").update(["9000", "0000", "0000", "321"].join("")).digest("hex");

  it("G5: hash ID Meta operasional dari secret CI dikenali di JSON, URL Graph, dan nama variabel (`waba_<id>`); keluaran tanpa ID mentah", () => {
    const dir = tmp({
      "config/meta.json": `{"phone_number_id":"${metaId}"}`,
      "docs/graph.md": `GET /v23.0/${metaId}/messages`,
      "src/x.ts": `const waba_${metaId} = 1;`,
    });
    const r = run(GUARD, dir, { OPERATIONAL_META_ID_HASHES: `${otherHash},${metaHash}` });
    expect(r.code, r.out).toBe(1);
    expect(r.out.match(/\[G5\]/g)).toHaveLength(3);
    expect(r.out).toContain("config/meta.json:1");
    expect(r.out).not.toContain(metaId);
    expect(r.out).not.toContain(metaId.slice(0, 12));
  });

  it("G5: ID lain (hash tidak terdaftar) dan angka biasa tidak ditandai; hash terdaftar tetapi tidak muncul → lulus dan jumlah hash dilaporkan", () => {
    const dir = tmp({ "config/meta.json": `{"phone_number_id":"${["7000", "0000", "0000", "777"].join("")}","tahun":2027,"rp":10000000000}` });
    const r = run(GUARD, dir, { OPERATIONAL_META_ID_HASHES: metaHash, OPERATIONAL_NUMBER_HASHES: otherHash });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("1 hash ID Meta diperiksa");
    expect(r.out).not.toContain("PERINGATAN");
  });

  it("daftar hash KOSONG → PERINGATAN jelas menyebut kedua variabel dan aturan yang tidak aktif (anotasi ::warning di GitHub Actions); tetap lulus", () => {
    const dir = tmp({ "src/a.ts": "export const a = 1;\n" });
    const r = run(GUARD, dir, { OPERATIONAL_NUMBER_HASHES: "", OPERATIONAL_META_ID_HASHES: "" });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("PERINGATAN GUARD NOMOR OPERASIONAL");
    expect(r.out).toContain("OPERATIONAL_NUMBER_HASHES kosong");
    expect(r.out).toContain("aturan G4");
    expect(r.out).toContain("OPERATIONAL_META_ID_HASHES kosong");
    expect(r.out).toContain("aturan G5");
    expect(r.out).not.toContain("::warning");
    const ci = run(GUARD, dir, { OPERATIONAL_NUMBER_HASHES: "", OPERATIONAL_META_ID_HASHES: "", GITHUB_ACTIONS: "true" });
    expect(ci.out).toContain("::warning title=Guard nomor operasional tidak penuh::");
    expect(ci.out.match(/::warning/g)).toHaveLength(2);
  });

  it("hanya satu daftar terisi → peringatan HANYA untuk yang kosong; entri bukan sha256 diabaikan dengan peringatan TANPA mencetak nilainya (bisa nomor/ID mentah)", () => {
    const dir = tmp({ "src/a.ts": "export const a = 1;\n" });
    const mentah = ["6281", "2345", "0001"].join(""); // salah tempel: nomor mentah (dibangun saat runtime agar berkas ini tidak memuat pola terlarang)
    const r = run(GUARD, dir, { OPERATIONAL_NUMBER_HASHES: metaHash, OPERATIONAL_META_ID_HASHES: mentah });
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain("OPERATIONAL_NUMBER_HASHES kosong");
    expect(r.out).toContain("OPERATIONAL_META_ID_HASHES kosong/tidak valid");
    expect(r.out).toContain("1 entri bukan sha256 hex 64 karakter dan DIABAIKAN");
    expect(r.out).not.toContain(mentah);
  });

  it("GUARD_REQUIRE_HASHES=1: daftar hash tidak lengkap → GAGAL; lengkap → lulus (untuk dipakai setelah branch protection aktif)", () => {
    const dir = tmp({ "src/a.ts": "export const a = 1;\n" });
    const gagal = run(GUARD, dir, { GUARD_REQUIRE_HASHES: "1", OPERATIONAL_NUMBER_HASHES: metaHash });
    expect(gagal.code).toBe(1);
    expect(gagal.out).toContain("GUARD_REQUIRE_HASHES=1");
    const ok = run(GUARD, dir, { GUARD_REQUIRE_HASHES: "1", OPERATIONAL_NUMBER_HASHES: otherHash, OPERATIONAL_META_ID_HASHES: metaHash });
    expect(ok.code, ok.out).toBe(0);
  });

  it("repository ini lulus dengan kedua daftar terisi (hash sembarang) dan CI meneruskan KEDUA secret ke langkah guard", () => {
    const r = run(GUARD, root, { OPERATIONAL_NUMBER_HASHES: otherHash, OPERATIONAL_META_ID_HASHES: otherHash });
    expect(r.code, r.out).toBe(0);
    const ci = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("OPERATIONAL_NUMBER_HASHES: ${{ secrets.OPERATIONAL_NUMBER_HASHES }}");
    expect(ci).toContain("OPERATIONAL_META_ID_HASHES: ${{ secrets.OPERATIONAL_META_ID_HASHES }}");
  });
});

describe("@tahap-1 secret scan (CI)", () => {
  it("repository ini lulus", () => {
    const r = run(SCAN, root);
    expect(r.code, r.out).toBe(0);
  });

  it("mendeteksi kunci privat, token Meta/GitHub/AWS/LLM/JWT, tanpa mencetak nilainya", () => {
    const secrets: Record<string, string> = {
      "k/pk.pem.txt": ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" "),
      "k/meta.ts": `const t = "EAA${"B".repeat(60)}";`,
      "k/gh.ts": `const t = "ghp_${"a1".repeat(20)}";`,
      "k/aws.ts": `const t = "AKIA${"Q".repeat(16)}";`,
      "k/llm.ts": `const t = "sk-${"z9".repeat(16)}";`,
      "k/jwt.ts": `const t = "eyJ${"a".repeat(12)}.eyJ${"b".repeat(12)}.${"c".repeat(12)}";`,
    };
    for (const [f, c] of Object.entries(secrets)) {
      const r = run(SCAN, tmp({ [f]: c + "\n" }));
      expect(r.code, f).toBe(1);
      expect(r.out).toContain(f);
      expect(r.out).not.toContain("BBBBBBBB");
      expect(r.out).not.toContain("a1a1a1a1");
    }
  });

  it("mendeteksi penetapan rahasia & string koneksi berpassword di kode; placeholder & kode biasa diabaikan", () => {
    const longVal = "Ab3dEf6hIj9kLm2nOp5qRs8t";
    expect(run(SCAN, tmp({ "src/a.ts": `const appSecret = "${longVal}";` })).code).toBe(1);
    expect(run(SCAN, tmp({ "src/b.ts": `API_KEY=${longVal}` })).code).toBe(1);
    expect(run(SCAN, tmp({ "src/c.ts": `const u = "postgres://app:Rahasia123@db.internal/x";` })).code).toBe(1);
    expect(run(SCAN, tmp({ ".env.example": "DATABASE_URL=postgres://teone_app:GANTI_PASSWORD_APP@localhost/x\nAPP_ENCRYPTION_KEY=\n" })).code).toBe(0);
    expect(run(SCAN, tmp({ "scripts/x.sh": 'export DATABASE_URL="postgres://app:$APP_PW@localhost/db"\n' })).code).toBe(0); // referensi variabel shell, bukan nilai
    expect(run(SCAN, tmp({ "src/d.ts": "const token = process.env.META_TOKEN_VALUE_FROM_ENV_VARIABLE;\nsecret: OTPAuth.Secret.fromBase32(secretBase32)" })).code).toBe(0);
  });

  it("berkas .env wajib ditolak; .env.example boleh", () => {
    expect(run(SCAN, tmp({ ".env": "A=1\n" })).code).toBe(1);
    expect(run(SCAN, tmp({ "deploy/.env.staging": "A=1\n" })).code).toBe(1);
    expect(run(SCAN, tmp({ ".env.example": "A=\n" })).code).toBe(0);
  });

  it("data uji di tests/ dikecualikan dari aturan generik, tetapi TIDAK dari pola token spesifik", () => {
    expect(run(SCAN, tmp({ "tests/helpers.ts": `const PASSWORD = "Sandi-Uji-Panjang-1234567";` })).code).toBe(0);
    expect(run(SCAN, tmp({ "tests/x.ts": `const t = "ghp_${"a1".repeat(20)}";` })).code).toBe(1);
  });
});

describe("@tahap-1 penjaga regresi jumlah test", () => {
  // Fixture dibuat REALISTIS (bentuk keluaran Vitest asli: success, ringkasan, status berkas, waktu mulai) sejak perbaikan G1-A01 —
  // pelapor kini menolak hasil yang tidak lengkap/usang. Semua ekspektasi lama di bawah TIDAK dilonggarkan.
  const vitestJson = (statuses: string[], tag = "@tahap-1") => {
    const failed = statuses.filter((s) => s === "failed").length;
    return JSON.stringify({
      success: failed === 0, numTotalTests: statuses.length, numFailedTests: failed, numFailedTestSuites: failed ? 1 : 0, startTime: Date.now(),
      testResults: [{ name: "/x/a.test.ts", status: failed ? "failed" : "passed", assertionResults: statuses.map((s, i) => ({ ancestorTitles: [`${tag} suite`], title: `t${i}`, status: s })) }],
    });
  };
  const spec = (title: string, status: string) => ({ title, ok: status !== "failed", tests: [{ status, expectedStatus: status === "skipped" ? "skipped" : "passed", results: [{ status }] }] });
  const pwJson = (specs: object[]) => ({
    stats: { startTime: new Date().toISOString(), unexpected: specs.filter((s) => (s as { ok?: boolean }).ok === false).length }, errors: [],
    suites: [{ title: "g1.spec.ts", specs: [], suites: [{ title: "@tahap-1 G1", specs }] }],
  });
  const mk = (v: string, baseline: { vitest: number; playwright: number }, pw?: object) => {
    const files: Record<string, string> = {
      ".test-results/vitest.json": v,
      ".test-results/vitest-exit.json": JSON.stringify({ exitCode: JSON.parse(v).success ? 0 : 1, finishedAt: new Date().toISOString() }),
      "tests/baseline-counts.json": JSON.stringify({ "@tahap-1": baseline }),
    };
    if (pw) files[".test-results/playwright.json"] = JSON.stringify(pw);
    return tmp(files);
  };
  const report = (cwd: string, ...args: string[]) => {
    const r = spawnSync(process.execPath, [path.join(root, "scripts/test-tag-report.mjs"), ...args], { cwd, encoding: "utf8" });
    return { code: r.status, out: r.stdout + r.stderr };
  };

  it("lulus bila jumlah Vitest ≥ baseline dan tidak ada yang dilewati", () => {
    const r = report(mk(vitestJson(["passed", "passed", "passed"]), { vitest: 3, playwright: 0 }));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("| @tahap-1 | 3 |");
  });
  it("GAGAL bila jumlah Vitest turun di bawah baseline (test dihapus/dilemahkan)", () => {
    const r = report(mk(vitestJson(["passed", "passed"]), { vitest: 3, playwright: 0 }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("REGRESI JUMLAH TEST VITEST");
  });
  it("GAGAL bila ada test dilewati/todo atau gagal", () => {
    const b = { vitest: 1, playwright: 0 };
    expect(report(mk(vitestJson(["passed", "skipped"]), b)).code).toBe(1);
    expect(report(mk(vitestJson(["passed", "todo"]), b)).out).toContain("DILEWATI");
    expect(report(mk(vitestJson(["passed", "failed"]), b)).out).toContain("GAGAL");
  });
  it("REGRESI CI run #1: langkah SETELAH Vitest tetapi SEBELUM E2E tidak boleh gagal hanya karena hitungan E2E belum ada", () => {
    // Baseline gabungan lama membandingkan 119 < 122 dan menggagalkan CI. Kini baseline dipisah per jenis.
    const r = report(mk(vitestJson(["passed", "passed", "passed"]), { vitest: 3, playwright: 3 }));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("hasil tidak tersedia");
  });
  it("--require-e2e: GAGAL bila hasil E2E tidak ada (E2E tidak boleh diam-diam hilang dari CI)", () => {
    const r = report(mk(vitestJson(["passed"]), { vitest: 1, playwright: 3 }), "--require-e2e");
    expect(r.code).toBe(1);
    expect(r.out).toContain("--require-e2e");
  });
  it("Playwright: placeholder resmi 'BELUM TERSEDIA' boleh dilewati dan tidak dihitung; skip lain GAGAL", () => {
    const ok = report(mk(vitestJson(["passed"]), { vitest: 1, playwright: 1 }, pwJson([spec("login", "passed"), spec("G2 — x [BELUM TERSEDIA — Tahap 2]", "skipped")])), "--require-e2e");
    expect(ok.code, ok.out).toBe(0);
    expect(ok.out).toMatch(/1 placeholder resmi/);
    expect(ok.out).toContain("| @tahap-1 | 1 | 1 | 2 |");
    const bad = report(mk(vitestJson(["passed"]), { vitest: 1, playwright: 0 }, pwJson([spec("fitur sungguhan", "skipped")])), "--require-e2e");
    expect(bad.code).toBe(1);
    expect(bad.out).toContain("E2E DILEWATI tanpa penanda resmi");
  });
  it("GAGAL bila jumlah E2E turun di bawah baseline atau E2E gagal", () => {
    const low = report(mk(vitestJson(["passed"]), { vitest: 1, playwright: 2 }, pwJson([spec("login", "passed")])), "--require-e2e");
    expect(low.code).toBe(1);
    expect(low.out).toContain("REGRESI JUMLAH TEST E2E");
    const failed = report(mk(vitestJson(["passed"]), { vitest: 1, playwright: 1 }, pwJson([spec("login", "failed")])), "--require-e2e");
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("E2E GAGAL");
  });
});
