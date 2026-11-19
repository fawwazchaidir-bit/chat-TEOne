/**
 * Pemulihan akun lewat akses server (prosedur darurat saat Super Admin kehilangan 2FA/sandi).
 *   npm run admin:recover -- reset-2fa <email>
 *   npm run admin:recover -- reset-password <email>        (sandi baru ditanyakan; wajib diganti saat login)
 *   npm run admin:recover -- activate <email>
 * Hanya dapat dijalankan oleh orang yang memiliki akses ke server + DATABASE_URL. Setiap tindakan masuk audit log.
 */
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db/client";
import { recoveryCodes, sessions, users } from "../src/db/schema";
import { writeAudit } from "../src/modules/audit";
import { assertPasswordPolicy, hashPassword } from "../src/modules/auth/password";
import { normalizeEmail } from "../src/modules/auth/service";
import { ask } from "./lib-prompt";

export async function recover(cmd: string, emailRaw: string, newPassword?: string) {
  const email = normalizeEmail(emailRaw);
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) throw new Error("Pengguna tidak ditemukan.");
  await db.transaction(async (tx) => {
    if (cmd === "reset-2fa") {
      await tx.update(users).set({ totpEnabled: false, totpSecretEnc: null, totpLastStep: null, updatedAt: new Date() }).where(eq(users.id, u.id));
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, u.id));
    } else if (cmd === "reset-password") {
      if (!newPassword) throw new Error("Sandi baru wajib diisi.");
      assertPasswordPolicy(newPassword, email);
      await tx.update(users).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, u.id));
    } else if (cmd === "activate") {
      await tx.update(users).set({ status: "active", disabledAt: null, updatedAt: new Date() }).where(eq(users.id, u.id));
    } else throw new Error("Perintah tidak dikenal. Gunakan: reset-2fa | reset-password | activate");
    if (cmd !== "activate") await tx.delete(sessions).where(eq(sessions.userId, u.id));
    await writeAudit(tx, { actorLabel: "cli:recover", action: `user.recover_${cmd.replace("-", "_")}`, objectType: "user", objectId: u.id, metadata: { email } });
  });
}

if (process.argv[1]?.endsWith("admin-recover.ts")) {
  (async () => {
    const [cmd, email] = process.argv.slice(2);
    if (!cmd || !email) throw new Error("Pemakaian: admin:recover -- <reset-2fa|reset-password|activate> <email>");
    const pw = cmd === "reset-password" ? await ask("Sandi sementara baru: ", true) : undefined;
    await recover(cmd, email, pw);
    console.log("Selesai. Tindakan dicatat di audit log.");
  })().catch((e) => { console.error("Gagal:", e.message); process.exit(1); }).finally(closeDb);
}
