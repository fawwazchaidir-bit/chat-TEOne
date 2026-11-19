/**
 * Perintah bootstrap SATU KALI: membuat Super Admin pertama. Tidak ada password bawaan.
 *   npm run admin:bootstrap                      (interaktif; sandi tidak ditampilkan)
 *   echo '<sandi>' | npm run admin:bootstrap -- --email a@b.id --name "Nama" --password-stdin
 * Menolak berjalan bila sudah ada Super Admin (gunakan `npm run admin:recover` untuk pemulihan).
 * 2FA wajib: Super Admin mendaftarkan TOTP pada login pertamanya.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, closeDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { writeAudit } from "../src/modules/audit";
import { assertPasswordPolicy, hashPassword } from "../src/modules/auth/password";
import { normalizeEmail } from "../src/modules/auth/service";
import { countActiveSuperAdmins } from "../src/modules/users/service-count";
import { ask } from "./lib-prompt";

export async function bootstrapSuperAdmin(input: { email: string; name: string; password: string }) {
  const email = normalizeEmail(z.email().parse(input.email));
  if (input.name.trim().length < 2) throw new Error("Nama minimal 2 karakter.");
  assertPasswordPolicy(input.password, email);
  const db = getDb();
  if ((await countActiveSuperAdmins()) > 0) throw new Error("Super Admin sudah ada. Bootstrap hanya berlaku satu kali; gunakan `npm run admin:recover` untuk pemulihan.");
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (dup) throw new Error("Email sudah dipakai pengguna lain.");
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ email, name: input.name.trim(), passwordHash, isSuperAdmin: true, mustChangePassword: false }).returning({ id: users.id });
    await writeAudit(tx, { actorLabel: "cli:bootstrap", action: "user.bootstrap_super_admin", objectType: "user", objectId: u!.id, metadata: { email } });
    return u!.id;
  });
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.endsWith("bootstrap-super-admin.ts")) {
  (async () => {
    const email = arg("email") ?? (await ask("Email Super Admin: "));
    const name = arg("name") ?? (await ask("Nama lengkap: "));
    let password: string;
    if (process.argv.includes("--password-stdin")) {
      const chunks: Buffer[] = [];
      for await (const c of process.stdin) chunks.push(c as Buffer);
      password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
    } else {
      password = await ask("Kata sandi (min. 12 karakter): ", true);
      if (password !== (await ask("Ulangi kata sandi: ", true))) throw new Error("Kata sandi tidak sama.");
    }
    await bootstrapSuperAdmin({ email, name, password });
    console.log("Super Admin dibuat. Login lalu daftarkan 2FA (wajib) pada halaman yang muncul.");
  })().catch((e) => { console.error("Gagal:", e.message); process.exit(1); }).finally(closeDb);
}
