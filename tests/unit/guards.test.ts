import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  const vitestJson = (statuses: string[], tag = "@tahap-1") => JSON.stringify({ testResults: [{ assertionResults: statuses.map((s, i) => ({ ancestorTitles: [`${tag} suite`], title: `t${i}`, status: s })) }] });
  const spec = (title: string, status: string) => ({ title, ok: status !== "failed", tests: [{ status, expectedStatus: status === "skipped" ? "skipped" : "passed", results: [{ status }] }] });
  const pwJson = (specs: object[]) => ({ suites: [{ title: "g1.spec.ts", specs: [], suites: [{ title: "@tahap-1 G1", specs }] }] });
  const mk = (v: string, baseline: { vitest: number; playwright: number }, pw?: object) => {
    const files: Record<string, string> = { ".test-results/vitest.json": v, "tests/baseline-counts.json": JSON.stringify({ "@tahap-1": baseline }) };
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
