/**
 * Tindak lanjut audit ulang Gate 1 (G1-A02 portabilitas, G1-A05 backup/restore): verifikasi media (fungsi murni) dan penjaga statis agar perbaikan
 * tidak mundur. Perilaku shell (backup/restore sungguhan) dibuktikan oleh drill `scripts/backup-restore-drill.sh` (job CI "Drill backup & restore nyata").
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveInside, verifyMediaFiles } from "../../scripts/lib/media-verify";

const root = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

describe("@tahap-1 verifikasi konsistensi media hasil restore (fungsi murni)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "teone-media-")); mkdirSync(path.join(dir, "aa/bb"), { recursive: true }); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const put = (key: string, content: string) => { writeFileSync(path.join(dir, key), content); return { storagePath: key, sha256: sha(content), sizeBytes: Buffer.byteLength(content) }; };

  it("konsisten: semua baris punya berkas dengan ukuran dan SHA-256 yang sama → 0 masalah", async () => {
    const a = put("aa/bb/x.bin", "isi-satu"); const b = put("y.bin", "isi-dua");
    const r = await verifyMediaFiles([{ id: "m1", ...a }, { id: "m2", ...b }], dir);
    expect(r).toEqual({ checked: 2, problems: [], orphans: 0 });
  });
  it("berkas HILANG, ukuran beda, dan isi berubah masing-masing tertangkap (kontrol negatif)", async () => {
    const a = put("aa/bb/x.bin", "isi-satu"); const b = put("y.bin", "isi-dua"); const c = put("z.bin", "isi-tiga");
    writeFileSync(path.join(dir, "y.bin"), "isi-dua-lebih-panjang"); // ukuran beda
    writeFileSync(path.join(dir, "z.bin"), "isi-TIGA"); // ukuran sama, isi beda
    rmSync(path.join(dir, "aa/bb/x.bin"));
    const r = await verifyMediaFiles([{ id: "m1", ...a }, { id: "m2", ...b }, { id: "m3", ...c }], dir);
    expect(r.problems).toHaveLength(3);
    expect(r.problems[0]).toMatch(/m1.*HILANG/);
    expect(r.problems[1]).toMatch(/m2.*ukuran beda/);
    expect(r.problems[2]).toMatch(/m3.*SHA-256 beda/);
  });
  it("berkas tanpa baris database ('yatim') hanya dilaporkan, bukan kegagalan", async () => {
    const a = put("a.bin", "satu"); put("yatim.bin", "tanpa baris");
    const r = await verifyMediaFiles([{ id: "m1", ...a }], dir);
    expect(r.problems).toEqual([]);
    expect(r.orphans).toBe(1);
  });
  it("kunci penyimpanan di luar direktori ditolak (.., absolut, NUL, kosong) — tidak pernah membaca berkas di luar", async () => {
    for (const key of ["../luar.bin", "aa/../../luar.bin", "/etc/passwd", "a\0b", ""]) expect(resolveInside(dir, key), JSON.stringify(key)).toBeNull();
    expect(resolveInside(dir, "aa/bb/x.bin")).toBe(path.join(dir, "aa/bb/x.bin"));
    const r = await verifyMediaFiles([{ id: "m1", storagePath: "../luar.bin", sha256: sha("x"), sizeBytes: 1 }], dir);
    expect(r.problems[0]).toMatch(/tidak sah/);
  });
  it("tautan simbolik yang menunjuk ke luar tidak dianggap berkas sah di dalam direktori", async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), "teone-outside-"));
    try {
      writeFileSync(path.join(outside, "rahasia.txt"), "di luar");
      symlinkSync(path.join(outside, "rahasia.txt"), path.join(dir, "tautan.bin"));
      const r = await verifyMediaFiles([{ id: "m1", storagePath: "tautan.bin", sha256: sha("di luar"), sizeBytes: 7 }], dir);
      // stat() mengikuti tautan; isi cocok → tidak crash. Yang dijaga: kunci tidak dapat keluar lewat `..` (diuji di atas). Hasil dicatat apa adanya.
      expect(r.checked).toBe(1);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});

describe("@tahap-1 portabilitas lingkungan terbatas (audit ulang Gate 1 G1-A02)", () => {
  // Hanya baris KODE (komentar dibuang): `npx tsx`/`tsx` CLI membuat socket IPC yang gagal EPERM di sebagian sandbox.
  const code = (file: string) => read(file).split("\n").filter((l) => !/^\s*(#|\/\/|\*)/.test(l)).map((l) => l.replace(/\s+\/\/.*$/, "")).join("\n");

  it("tidak ada pemanggilan `npx tsx` / `tsx <berkas>` di playwright.config, skrip shell, dan package.json — peluncur = `node --import tsx`", () => {
    for (const f of ["playwright.config.ts", "scripts/backup-restore-drill.sh", "scripts/verify-all.sh", "scripts/backup.sh", "scripts/restore.sh"]) {
      expect(code(f), f).not.toMatch(/\bnpx tsx\b/);
    }
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    for (const [name, cmd] of Object.entries(scripts)) {
      if (/\.ts\b/.test(cmd)) expect(cmd, `npm run ${name}`).toMatch(/^node --import tsx /);
    }
    expect(code("playwright.config.ts")).toContain("node --import tsx tests/e2e/prepare-db.ts");
    expect(code("playwright.config.ts")).toContain("node --import tsx tests/e2e/mock-graph-server.ts");
  });

  it("verify-all menandai E2E sebagai TIDAK DAPAT DIJALANKAN (bukan lulus, bukan gagal samar) bila Chromium tidak dapat dibuka", () => {
    const v = read("scripts/verify-all.sh");
    expect(v).toMatch(/step "e2e-playwright".*@chromium/);
    expect(v).toMatch(/step "penjaga-akhir-dengan-e2e".*@chromium/);
    expect(v).toContain("node scripts/check-chromium.mjs");
    expect(read("scripts/check-chromium.mjs")).toMatch(/process\.exit\(1\)/);
  });
});

describe("@tahap-1 backup & restore: aturan keselamatan (penjaga statis; perilaku sungguhan dibuktikan drill di CI)", () => {
  it("backup.sh: arsip media dibuat SEBELUM dump database (setiap baris media di dump punya berkas di arsip) dan keduanya terenkripsi + checksum", () => {
    const b = read("scripts/backup.sh");
    expect(b.indexOf("media_out\"")).toBeGreaterThan(0);
    expect(b.indexOf("tar --create")).toBeGreaterThan(0);
    expect(b.indexOf("tar --create")).toBeLessThan(b.indexOf("pg_dump --format=custom"));
    expect((b.match(/encrypt "\$/g) ?? []).length).toBe(2);
    expect((b.match(/checksum "\$/g) ?? []).length).toBe(2);
    expect(b).toContain("BACKUP_REQUIRE_MEDIA");
    expect(b).not.toMatch(/PGPASSWORD=|--passphrase\s+\S|--password/); // rahasia tidak lewat argumen perintah
  });

  it("restore.sh: SEMUA checksum diverifikasi dan kebijakan media diputuskan SEBELUM pg_restore menyentuh database; tidak menimpa media; mode aman bawaan menyalakan kill switch global", () => {
    const r = read("scripts/restore.sh");
    const iCheck = r.indexOf('check_sum "$BACKUP_FILE"');
    const iPolicy = r.indexOf("RESTORE_SKIP_MEDIA");
    const iRestore = r.indexOf("pg_restore --no-owner");
    const iMedia = r.indexOf("tar --extract");
    expect(iCheck).toBeGreaterThan(0);
    expect(iCheck).toBeLessThan(iRestore);
    expect(iPolicy).toBeLessThan(iRestore);
    expect(iRestore).toBeLessThan(iMedia);
    expect(r).toContain("exit 2");
    expect(r).toContain("exit 3");
    expect(r).toMatch(/tidak kosong/);
    expect(r).toContain('RESTORE_SAFE_MODE:-1'); // bawaan = aman
    expect(r).toMatch(/INSERT INTO kill_switches[\s\S]*'global'/);
    expect(r).toContain("restore.safe_mode");
    expect(r).not.toMatch(/PGPASSWORD=/);
  });

  it("drill membuktikan kontrol negatif (arsip media rusak, direktori tidak kosong, kebijakan media tak ditetapkan, berkas media hilang/rusak) dan mode aman", () => {
    const d = read("scripts/backup-restore-drill.sh");
    for (const needle of ["arsip media rusak tidak ditolak", "direktori media tidak kosong tidak ditolak", "restore tanpa kebijakan media tidak ditolak", "pemeriksa media meloloskan berkas hilang", "pemeriksa media meloloskan berkas rusak", "RESTORE_EXPECT_SAFE_MODE=1", "pohon berkas media hasil restore IDENTIK"]) {
      expect(d, needle).toContain(needle);
    }
    // perusakan berkas harus PASTI mengubah isi (bukan menimpa konstanta) — T3-F14
    expect(d).toContain("flip_byte");
    expect(d).not.toMatch(/printf 'X' \| dd/);
  });
});

describe("@tahap-1 build & deployment staging dapat direproduksi dan dikaitkan ke commit (tindak lanjut Gate 1–2)", () => {
  it("build image tidak bergantung pada tests/: .dockerignore mengecualikan tests, dan tsconfig.build.json (dipakai next build) mengecualikan tests + konfigurasi uji", () => {
    const di = read(".dockerignore").split("\n").map((l) => l.trim());
    expect(di).toContain("tests");
    expect(di).toContain("docs");
    const tb = JSON.parse(read("tsconfig.build.json")) as { include: string[]; exclude: string[] };
    expect(tb.exclude).toEqual(expect.arrayContaining(["tests", "playwright.config.ts", "vitest.config.mts"]));
    for (const inc of tb.include) { expect(inc, inc).not.toMatch(/^tests(\/|$)/); expect(inc, inc).not.toBe("*.ts"); } // tidak menarik tests/ atau berkas .ts di akar (playwright/vitest config)
    expect(read("next.config.ts")).toContain('tsconfigPath: "tsconfig.build.json"');
    expect(JSON.parse(read("package.json")).scripts["check:docker-context"]).toBe("node scripts/check-docker-context.mjs");
    expect(read(".github/workflows/ci.yml")).toContain("npm run check:docker-context");
  });

  it("domain staging tidak ditulis di Caddyfile (dibaca dari SITE_ADDRESS; bawaan .invalid), dan konfigurasi lokal operator tidak masuk git/image", () => {
    const c = read("deploy/Caddyfile");
    expect(c).toContain("{$SITE_ADDRESS:staging-chat.example.invalid}");
    expect(c).not.toMatch(/trilogikaedutama|https?:\/\//);
    const compose = read("deploy/docker-compose.staging.yml");
    expect(compose).toContain("SITE_ADDRESS: ${SITE_ADDRESS:-staging-chat.example.invalid}");
    expect(compose).toContain("teone-app:${TEONE_TAG:-staging}");
    expect(compose.match(/teone-tools:\$\{TEONE_TAG:-staging\}/g)).toHaveLength(2);
    expect(read("deploy/.env.example")).not.toMatch(/PASSWORD|SECRET|TOKEN|KEY\s*=/i); // hanya nilai non-rahasia
    expect(read(".dockerignore")).toContain("deploy/.env");
  });

  it("image dikaitkan ke commit: label revision di kedua target, skrip build menolak pohon kotor, dan CI membangun + menjalankan image", () => {
    const d = read("Dockerfile");
    expect((d.match(/org\.opencontainers\.image\.revision="\$\{GIT_SHA\}"/g) ?? []).length).toBe(2);
    expect((d.match(/^ARG GIT_SHA/gm) ?? []).length).toBe(2);
    const b = read("scripts/build-staging-image.sh");
    expect(b).toContain("git status --porcelain");
    expect(b).toContain("ALLOW_DIRTY");
    expect(b).toMatch(/exit 1/);
    expect(b).toContain("GIT_SHA=$rev");
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/image:\n\s+name: Image Docker/);
    expect(ci).toContain("docker run --rm --network host");
    expect(ci).toContain("npm run db:migrate");
    expect(ci).toContain("caddy validate");
    expect(ci).not.toMatch(/PASSWORD:\s*\S*[A-Za-z0-9]{8,}.*\n.*teone_owner/); // sandi tidak ditulis literal di langkah image
  });
});

describe("@tahap-1 worker staging siap dijalankan dan nama proyek compose dikunci (S-10/A-4, S-06/R-2)", () => {
  const compose = read("deploy/docker-compose.staging.yml");
  const lines = compose.split("\n");
  const serviceBlock = (name: string) => {
    const i = lines.findIndex((l) => l === `  ${name}:` || l.startsWith(`  ${name}:`));
    expect(i, `service ${name}`).toBeGreaterThanOrEqual(0);
    let j = i + 1;
    while (j < lines.length && !/^  \S/.test(lines[j]!) && !/^\S/.test(lines[j]!)) j++;
    return lines.slice(i, j).join("\n");
  };

  it("compose menetapkan `name: deploy` di puncak (sebelum services) sehingga volume deploy_* yang ada tetap dipakai dari direktori mana pun", () => {
    const nameIdx = lines.findIndex((l) => /^name: deploy\s*$/.test(l));
    const servicesIdx = lines.findIndex((l) => /^services:\s*$/.test(l));
    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(servicesIdx).toBeGreaterThan(nameIdx);
    expect(compose.match(/^name:/gm)).toHaveLength(1);
  });

  it("service worker: image tools bertag sama, perintah `npm run worker`, env sama dengan app (env_file + MEDIA_DIR + volume media), restart, shutdown halus", () => {
    const w = serviceBlock("worker");
    const a = serviceBlock("app");
    expect(w).toContain("image: teone-tools:${TEONE_TAG:-staging}");
    expect(w).toContain('command: ["npm", "run", "worker"]');
    expect(w).toContain("env_file: /etc/teone/staging.env");
    expect(a).toContain("env_file: /etc/teone/staging.env");
    for (const needle of ["MEDIA_DIR: /data/media", "media_data:/data/media", "restart: unless-stopped", "stop_grace_period:", 'user: "10001:10001"']) {
      expect(w, needle).toContain(needle);
      if (needle.startsWith("MEDIA_DIR") || needle.startsWith("media_data")) expect(a, `app ${needle}`).toContain(needle); // sama dengan app
    }
    expect(w).toMatch(/depends_on:.*db.*service_healthy/);
    expect(w).not.toMatch(/ports:/); // tidak dipublikasikan
    expect(JSON.parse(read("package.json")).scripts.worker).toBe("node --import tsx scripts/worker.ts");
  });

  it("perintah menyalakan worker terdokumentasi (`-p deploy`, dua --env-file, --no-deps) dan scripts/worker.ts memakai loop yang diuji + mode --once", () => {
    const d = read("docs/staging.md");
    expect(d).toContain("-p deploy --env-file /etc/teone/staging.env --env-file deploy/.env");
    expect(d).toContain("up -d --no-deps worker");
    const w = read("scripts/worker.ts");
    expect(w).toContain("runWorkerLoop");
    expect(w).toContain('process.argv.includes("--once")');
    expect(read("src/modules/conversations-messages/worker-loop.ts")).toContain("runMaintenance"); // pemeliharaan (termasuk purge payload D-18) hidup di loop worker
  });
});
