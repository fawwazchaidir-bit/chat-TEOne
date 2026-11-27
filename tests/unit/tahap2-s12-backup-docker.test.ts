/**
 * F2-01: `scripts/backup.sh` mode Docker (`BACKUP_VIA_DOCKER=1`): VPS yang hanya punya Docker menjalankan pg_dump/tar DI DALAM kontainer, enkripsi + checksum tetap di host.
 * Memakai `docker` TIRUAN di PATH (tanpa daemon, tanpa database) + gpg sungguhan. Membuktikan: keluaran berformat SAMA dengan mode biasa, rahasia tidak lewat argumen,
 * gagal-aman tanpa "set" parsial. Perilaku terhadap Docker/PostgreSQL SUNGGUHAN di VPS = BELUM DIUJI (tugas operator; langkah di laporan S-12).
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const BACKUP = path.join(root, "scripts/backup.sh");
const ROTATE = path.join(root, "scripts/backup-rotate.sh");
const base = mkdtempSync(path.join(tmpdir(), "teone-bkdocker-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

const FAKE_DUMP = "FAKE-PGDUMP-CUSTOM-STREAM\n";
const SECRET_PW = "kata-sandi-db-sintetis-123"; // # secret-scan:allow — nilai uji sintetis
const bin = path.join(base, "bin");
mkdirSync(bin, { recursive: true });
// docker TIRUAN: mencatat argumen (TANPA nilai env) ke $FAKE_DOCKER_LOG dan melaporkan apakah PGPASSWORD diteruskan lewat lingkungan.
writeFileSync(path.join(bin, "docker"), `#!/usr/bin/env bash
printf '%s | pgpassword=%s\\n' "$*" "\${PGPASSWORD:+ada}" >> "$FAKE_DOCKER_LOG"
[ "$1" = exec ] || { echo "docker tiruan: hanya exec yang didukung" >&2; exit 125; }
shift
while [ $# -gt 0 ]; do case "$1" in -i) shift;; -e) shift 2;; *) break;; esac; done
container="$1"; shift
[ "$container" = "down" ] && { echo "Error: No such container: down" >&2; exit 1; }
case "$1" in
  pg_dump) printf 'FAKE-PGDUMP-CUSTOM-STREAM\\n' ;;
  test) [ -d "$FAKE_MEDIA_ROOT" ] && [ "$3" = "$FAKE_MEDIA_PATH" ] ;;
  tar) shift; args=(); for a in "$@"; do [ "$a" = "--directory=$FAKE_MEDIA_PATH" ] && a="--directory=$FAKE_MEDIA_ROOT"; args+=("$a"); done; exec tar "\${args[@]}" ;;
  *) echo "docker tiruan: perintah tak dikenal: $1" >&2; exit 126 ;;
esac
`, { mode: 0o755 });
// pg_dump TIRUAN untuk mode biasa (pembanding format).
writeFileSync(path.join(bin, "pg_dump"), `#!/usr/bin/env bash\nprintf 'FAKE-PGDUMP-CUSTOM-STREAM\\n'\n`, { mode: 0o755 });

let seq = 0;
function env() {
  const n = ++seq;
  const dir = path.join(base, `run${n}`);
  const backups = path.join(dir, "backups");
  const media = path.join(dir, "media");
  const gnupg = path.join(dir, "gnupg");
  mkdirSync(path.join(media, "aa"), { recursive: true });
  mkdirSync(gnupg, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(media, "aa", "x.bin"), "isi-media-sintetis");
  const pass = path.join(dir, "pass");
  writeFileSync(pass, "passphrase-uji-sintetis\n", { mode: 0o600 });
  chmodSync(pass, 0o600);
  const log = path.join(dir, "docker.log");
  writeFileSync(log, "");
  return { dir, backups, media, gnupg, pass, log };
}
type E = ReturnType<typeof env>;
const run = (script: string, e: E, extra: Record<string, string> = {}, pathOverride?: string) =>
  spawnSync("bash", [script], {
    encoding: "utf8",
    env: { PATH: pathOverride ?? `${bin}:${process.env.PATH ?? ""}`, HOME: e.dir, GNUPGHOME: e.gnupg, BACKUP_DIR: e.backups, BACKUP_PASSPHRASE_FILE: e.pass, PGDATABASE: "teone", FAKE_DOCKER_LOG: e.log, FAKE_MEDIA_ROOT: e.media, FAKE_MEDIA_PATH: "/data/media", ...extra } as unknown as NodeJS.ProcessEnv,
  });
const DOCKER = (over: Record<string, string> = {}) => ({ BACKUP_VIA_DOCKER: "1", BACKUP_DB_CONTAINER: "db", BACKUP_APP_CONTAINER: "app", MEDIA_DIR: "/data/media", PGUSER: "teone", PGPASSWORD: SECRET_PW, ...over });
const files = (e: E) => (existsSync(e.backups) ? readdirSync(e.backups).sort() : []);
const gpgDecrypt = (e: E, f: string) => spawnSync("gpg", ["--batch", "--quiet", "--pinentry-mode", "loopback", "--passphrase-file", e.pass, "--decrypt", path.join(e.backups, f)], { env: { PATH: process.env.PATH ?? "", HOME: e.dir, GNUPGHOME: e.gnupg } as unknown as NodeJS.ProcessEnv });
const norm = (names: string[]) => names.map((n) => n.replace(/\d{8}T\d{6}Z/, "<STAMP>"));

describe("@tahap-2 F2-01 backup.sh mode Docker: keluaran berformat SAMA dengan mode biasa", () => {
  it("docker exec: pg_dump di kontainer DB, tar di kontainer aplikasi; berkas .dump.gpg + .media.tar.gpg + .sha256 valid; isi terdekripsi benar; jalur dump = baris terakhir stdout", () => {
    const e = env();
    const r = run(BACKUP, e, DOCKER());
    expect(r.status, r.stderr).toBe(0);
    const names = files(e);
    expect(norm(names)).toEqual(["teone-<STAMP>.dump.gpg", "teone-<STAMP>.dump.gpg.sha256", "teone-<STAMP>.media.tar.gpg", "teone-<STAMP>.media.tar.gpg.sha256"]);
    const dump = r.stdout.trim().split("\n").pop() as string;
    expect(path.dirname(dump)).toBe(e.backups);
    expect(names).toContain(path.basename(dump));
    // checksum: format `sha256sum` (dua spasi), cocok, diverifikasi dengan sha256sum asli
    for (const n of names.filter((x) => x.endsWith(".sha256"))) {
      expect(readFileSync(path.join(e.backups, n), "utf8")).toMatch(new RegExp(`^[0-9a-f]{64}  ${n.replace(/\.sha256$/, "").replace(/\./g, "\\.")}\\n$`));
      expect(spawnSync("sha256sum", ["--check", "--status", n], { cwd: e.backups }).status, n).toBe(0);
    }
    // isi: dump (aliran dari kontainer) dan arsip media (dari kontainer) terenkripsi di HOST dan dapat didekripsi
    expect(gpgDecrypt(e, path.basename(dump)).stdout.toString()).toBe(FAKE_DUMP);
    const media = gpgDecrypt(e, names.find((n) => n.endsWith(".media.tar.gpg")) as string);
    const list = spawnSync("tar", ["-t", "-f", "-"], { input: media.stdout, encoding: "utf8" });
    expect(list.stdout).toContain("./aa/x.bin");
    // izin: direktori 700, berkas 600 (sama dengan mode biasa)
    expect((spawnSync("stat", ["-c", "%a", e.backups], { encoding: "utf8" }).stdout).trim()).toBe("700");
    for (const n of names) expect(spawnSync("stat", ["-c", "%a", path.join(e.backups, n)], { encoding: "utf8" }).stdout.trim(), n).toBe("600");
  });

  it("perintah docker: opsi pg_dump/tar SAMA dengan mode biasa; hanya `docker exec`; PGPASSWORD diteruskan sebagai NAMA (nilainya tidak ada di argumen)", () => {
    const e = env();
    expect(run(BACKUP, e, DOCKER()).status).toBe(0);
    const log = readFileSync(e.log, "utf8");
    expect(log).toContain("exec app test -d /data/media"); // media diperiksa di kontainer aplikasi
    expect(log).toContain("exec app tar --create --file=- --directory=/data/media --sort=name --owner=0 --group=0 --numeric-owner .");
    expect(log).toContain("exec -i -e PGPASSWORD db pg_dump --username teone --dbname teone --format=custom --no-owner --no-acl --compress=6");
    expect(log).toContain("pgpassword=ada"); // nilai sampai ke docker lewat lingkungan proses…
    expect(log).not.toContain(SECRET_PW); // …bukan lewat argumen
    expect(log.split("\n").filter(Boolean).every((l) => l.startsWith("exec "))).toBe(true);
    // Penjaga statis: satu-satunya kata kerja docker di skrip adalah `exec`; tidak ada opsi berbahaya.
    const src = readFileSync(BACKUP, "utf8");
    expect(new Set([...src.matchAll(/(?<![\w-])docker (exec|run|cp|ps|inspect|compose|rm|stop|kill|restart|volume|network)\b/g)].map((m) => m[1]))).toEqual(new Set(["exec"]));
    expect(src).not.toMatch(/--privileged|docker run|docker cp|--user\s+root/);
  });

  it("tanpa PGPASSWORD/PGUSER: argumen yang sesuai tidak ditambahkan (tidak ada -e kosong / --username kosong)", () => {
    const e = env();
    expect(run(BACKUP, e, DOCKER({ PGPASSWORD: "", PGUSER: "" })).status).toBe(0);
    const log = readFileSync(e.log, "utf8");
    expect(log).toContain("exec -i db pg_dump --dbname teone --format=custom");
    expect(log).not.toContain("--username");
    expect(log).not.toContain("-e PGPASSWORD");
  });

  it("KESETARAAN FORMAT: kumpulan berkas, pola nama, format checksum, dan izin sama dengan mode biasa (pg_dump/tar langsung di host)", () => {
    const d = env();
    expect(run(BACKUP, d, DOCKER()).status).toBe(0);
    const n = env();
    const r = run(BACKUP, n, { MEDIA_DIR: n.media });
    expect(r.status, r.stderr).toBe(0);
    expect(norm(files(n))).toEqual(norm(files(d)));
    const sumLine = (e: E) => files(e).filter((x) => x.endsWith(".sha256")).map((x) => readFileSync(path.join(e.backups, x), "utf8").replace(/[0-9a-f]{64}/, "<HASH>").replace(/\d{8}T\d{6}Z/, "<STAMP>"));
    expect(sumLine(n)).toEqual(sumLine(d));
    // isi dump identik secara byte pada kedua mode (aliran yang sama dienkripsi); arsip media memuat berkas yang sama
    const dd = files(d).find((x) => x.endsWith(".dump.gpg")) as string; const nn = files(n).find((x) => x.endsWith(".dump.gpg")) as string;
    expect(gpgDecrypt(d, dd).stdout.toString()).toBe(gpgDecrypt(n, nn).stdout.toString());
    const lst = (e: E) => spawnSync("tar", ["-t", "-f", "-"], { input: gpgDecrypt(e, files(e).find((x) => x.endsWith(".media.tar.gpg")) as string).stdout, encoding: "utf8" }).stdout;
    expect(lst(d)).toBe(lst(n));
  });

  it("backup-rotate.sh bekerja apa adanya pada mode Docker (env diteruskan); salinan di luar VPS tetap wajib kecuali BACKUP_OFFSITE_OPTIONAL=1", () => {
    const e = env();
    const refused = run(ROTATE, e, DOCKER());
    expect(refused.status).toBe(5); // BACKUP_OFFSITE_CMD kosong = GAGAL (D-12) — lokal tetap ada
    const e2 = env();
    const ok = run(ROTATE, e2, DOCKER({ BACKUP_OFFSITE_OPTIONAL: "1" }));
    expect(ok.status, ok.stderr).toBe(0);
    expect(norm(files(e2).filter((f) => !f.startsWith(".")))).toEqual(["teone-<STAMP>.dump.gpg", "teone-<STAMP>.dump.gpg.sha256", "teone-<STAMP>.media.tar.gpg", "teone-<STAMP>.media.tar.gpg.sha256"]);
  });
});

describe("@tahap-2 F2-01 backup.sh mode Docker: gagal-aman (tanpa set parsial, tanpa melewatkan media diam-diam)", () => {
  it("kontainer DB tidak berjalan → kode ≠ 0 dan TIDAK ada berkas tertinggal (set parsial akan menggeser backup lama saat rotasi)", () => {
    const e = env();
    const r = run(BACKUP, e, DOCKER({ BACKUP_DB_CONTAINER: "down" }));
    expect(r.status).not.toBe(0);
    expect(files(e)).toEqual([]); // arsip media yang sempat dibuat juga dibersihkan
  });
  it("kontainer aplikasi tidak berjalan + media diwajibkan → kode ≠ 0, tanpa berkas; tanpa BACKUP_REQUIRE_MEDIA → media dilewati DENGAN peringatan (dump tetap dibuat)", () => {
    const e = env();
    const r = run(BACKUP, e, DOCKER({ BACKUP_APP_CONTAINER: "down", BACKUP_REQUIRE_MEDIA: "1" }));
    expect(r.status).toBe(1);
    expect(files(e)).toEqual([]);
    const e2 = env();
    const r2 = run(BACKUP, e2, DOCKER({ BACKUP_APP_CONTAINER: "down" }));
    expect(r2.status).toBe(0);
    expect(r2.stderr).toMatch(/PERINGATAN: media TIDAK dicadangkan/);
    expect(norm(files(e2))).toEqual(["teone-<STAMP>.dump.gpg", "teone-<STAMP>.dump.gpg.sha256"]);
  });
  it("konfigurasi salah → kode 2 SEBELUM menyentuh apa pun: nilai flag tak sah, nama kontainer tak valid (injeksi opsi), kontainer DB kosong, MEDIA_DIR tanpa kontainer aplikasi", () => {
    const bad: Record<string, string>[] = [
      { BACKUP_VIA_DOCKER: "yes" }, { BACKUP_VIA_DOCKER: "2" },
      { BACKUP_DB_CONTAINER: "--privileged" }, { BACKUP_DB_CONTAINER: "db; rm -rf /" }, { BACKUP_DB_CONTAINER: "a b" }, { BACKUP_DB_CONTAINER: "-v/:/host" },
      { BACKUP_APP_CONTAINER: "--pid=host" }, { BACKUP_APP_CONTAINER: "app$(id)" },
      { BACKUP_DB_CONTAINER: "" }, { BACKUP_APP_CONTAINER: "" },
    ];
    for (const o of bad) {
      const e = env();
      const r = run(BACKUP, e, DOCKER(o));
      expect([JSON.stringify(o), r.status], r.stderr).toEqual([JSON.stringify(o), 2]);
      expect(files(e), JSON.stringify(o)).toEqual([]);
      expect(readFileSync(e.log, "utf8"), JSON.stringify(o)).toBe(""); // docker tidak dipanggil sama sekali
    }
  });
  it("perintah docker tidak ada di PATH → kode 2 dengan pesan jelas (bukan gagal diam-diam)", () => {
    const e = env();
    const only = path.join(e.dir, "tools");
    mkdirSync(only);
    for (const t of ["bash", "env", "stat", "mkdir", "chmod", "date", "basename", "sha256sum", "gpg", "tar", "rm", "cat", "dirname"]) {
      const p = spawnSync("bash", ["-c", `command -v ${t}`], { encoding: "utf8" }).stdout.trim();
      if (p) symlinkSync(p, path.join(only, t));
    }
    const r = run(BACKUP, e, DOCKER(), only);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/perintah 'docker' tidak ditemukan/);
    expect(files(e)).toEqual([]);
  });
  it("mode biasa TIDAK berubah: BACKUP_VIA_DOCKER tidak diatur → docker tidak dipanggil; kegagalan pg_dump membersihkan berkas parsial", () => {
    const e = env();
    expect(run(BACKUP, e, { MEDIA_DIR: e.media }).status).toBe(0);
    expect(readFileSync(e.log, "utf8")).toBe("");
    const bad = path.join(base, "bin-gagal");
    mkdirSync(bad, { recursive: true });
    writeFileSync(path.join(bad, "pg_dump"), "#!/usr/bin/env bash\nexit 1\n", { mode: 0o755 });
    const e2 = env();
    const r = run(BACKUP, e2, { MEDIA_DIR: e2.media }, `${bad}:${process.env.PATH ?? ""}`);
    expect(r.status).not.toBe(0);
    expect(files(e2)).toEqual([]);
  });
});
