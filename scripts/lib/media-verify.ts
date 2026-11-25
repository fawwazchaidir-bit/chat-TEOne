/**
 * Verifikasi konsistensi media hasil restore (audit ulang Gate 1, G1-A05): setiap baris `media` berstatus `tersimpan` HARUS punya berkas
 * di direktori media dengan ukuran dan SHA-256 yang sama dengan catatan database. Modul MURNI (tanpa database) agar dapat diuji unit.
 * Berkas tanpa baris database ("yatim") hanya dilaporkan — mis. berkas yang tertulis setelah dump database; bukan kegagalan.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type MediaRow = { id: string; storagePath: string; sha256: string; sizeBytes: number | null };
export type MediaVerifyResult = { checked: number; problems: string[]; orphans: number };

/** Kunci penyimpanan harus relatif dan tetap di dalam direktori (menolak `..`, absolut, NUL). */
export function resolveInside(dir: string, key: string): string | null {
  if (!key || key.includes("\0") || path.isAbsolute(key)) return null;
  const root = path.resolve(dir);
  const full = path.resolve(root, key);
  return full === root || !full.startsWith(root + path.sep) ? null : full;
}

const sha256File = (file: string) => new Promise<string>((resolve, reject) => {
  const h = createHash("sha256");
  createReadStream(file).on("data", (c) => h.update(c)).on("error", reject).on("end", () => resolve(h.digest("hex")));
});

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

export async function verifyMediaFiles(rows: MediaRow[], dir: string): Promise<MediaVerifyResult> {
  const problems: string[] = [];
  const known = new Set<string>();
  for (const r of rows) {
    const full = resolveInside(dir, r.storagePath);
    if (!full) { problems.push(`${r.id}: kunci penyimpanan tidak sah (di luar direktori media)`); continue; }
    known.add(r.storagePath.split(path.sep).join("/"));
    const st = await stat(full).catch(() => null);
    if (!st || !st.isFile()) { problems.push(`${r.id}: berkas HILANG (${r.storagePath})`); continue; }
    if (r.sizeBytes != null && st.size !== r.sizeBytes) { problems.push(`${r.id}: ukuran beda (db ${r.sizeBytes}, berkas ${st.size})`); continue; }
    const digest = await sha256File(full);
    if (digest !== r.sha256) problems.push(`${r.id}: SHA-256 beda — isi berkas berubah/rusak`);
  }
  const present = await listFiles(path.resolve(dir)).catch(() => [] as string[]);
  return { checked: rows.length, problems, orphans: present.filter((f) => !known.has(f)).length };
}
