/**
 * Alat bantu drill backup/restore.
 *   tsx scripts/restore-verify.ts counts            → cetak JSON jumlah baris per tabel (koneksi pemilik)
 *   tsx scripts/restore-verify.ts verify <file.json> → bandingkan dengan jumlah awal + uji fungsional database hasil restore
 * Env: DATABASE_MIGRATION_URL (pemilik), DATABASE_URL (role aplikasi), DRILL_ADMIN_EMAIL, DRILL_ADMIN_PASSWORD.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { verifyPassword } from "../src/modules/auth/password";

async function counts(url: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const t = await c.query("select tablename from pg_tables where schemaname = 'public' order by 1");
    const out: Record<string, number> = {};
    for (const { tablename } of t.rows) out[tablename] = (await c.query(`select count(*)::int n from "${tablename}"`)).rows[0].n;
    return out;
  } finally {
    await c.end();
  }
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  const owner = process.env.DATABASE_MIGRATION_URL!;
  if (mode === "counts") return console.log(JSON.stringify(await counts(owner)));
  if (mode !== "verify" || !file) throw new Error("pemakaian: counts | verify <file.json>");

  const before = JSON.parse(readFileSync(file, "utf8")) as Record<string, number>;
  const after = await counts(owner);
  const checks: [string, boolean, string][] = [];
  const diff = Object.keys(before).filter((k) => before[k] !== after[k]);
  checks.push(["jumlah baris semua tabel sama", diff.length === 0, diff.length ? `beda: ${diff.map((k) => `${k} ${before[k]}→${after[k]}`).join(", ")}` : `${Object.keys(before).length} tabel, ${Object.values(after).reduce((a, b) => a + b, 0)} baris`]);

  const app = new Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  try {
    const u = await app.query("select password_hash, is_super_admin, totp_enabled from users where email = $1", [process.env.DRILL_ADMIN_EMAIL]);
    checks.push(["data terbaca oleh role aplikasi", u.rowCount === 1, `pengguna uji ditemukan: ${u.rowCount}`]);
    checks.push(["hash sandi Argon2id masih valid (login akan berhasil)", u.rowCount === 1 && (await verifyPassword(u.rows[0].password_hash, process.env.DRILL_ADMIN_PASSWORD!)), "verifikasi hash terhadap sandi drill"]);
    const ins = await app.query("insert into audit_log(actor_label, action, result) values ('drill','drill.restore_check','success') returning id");
    // bigserial dikembalikan sebagai string oleh driver → ubah ke angka. ID baru harus MELANJUTKAN urutan sumber (sekuens ikut terpulihkan).
    const newId = Number(ins.rows[0].id);
    checks.push(["audit_log menerima INSERT & urutan ID berlanjut dari data sumber", newId === (before.audit_log ?? 0) + 1, `id baru=${newId}, baris sumber=${before.audit_log}`]);
    const upd = await app.query("update audit_log set action='x' where id=$1", [ins.rows[0].id]).then(() => null, (e: { code?: string }) => e.code);
    checks.push(["audit_log tetap append-only untuk aplikasi setelah restore", upd === "42501", `kode=${upd}`]);
  } finally {
    await app.end();
  }
  const o = new Client({ connectionString: owner });
  await o.connect();
  try {
    const trg = await o.query("select count(*)::int n from pg_trigger where not tgisinternal");
    checks.push(["trigger integritas (audit, batas channel, super admin) ikut terpulihkan", trg.rows[0].n >= 5, `${trg.rows[0].n} trigger`]);
    const ow = await o.query("update audit_log set action='x' where action='drill.restore_check'").then(() => null, (e: { code?: string }) => e.code);
    checks.push(["trigger menolak UPDATE audit_log bahkan oleh pemilik", ow === "42501", `kode=${ow}`]);
    const mig = await o.query("select count(*)::int n from drizzle.__drizzle_migrations");
    checks.push(["riwayat migrasi ikut terpulihkan", mig.rows[0].n >= 2, `${mig.rows[0].n} migrasi`]);
  } finally {
    await o.end();
  }
  for (const [name, ok, detail] of checks) console.log(`${ok ? "✔" : "✘"} ${name} — ${detail}`);
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
