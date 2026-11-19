/**
 * Seed CONTOH — hanya development/staging. Menolak berjalan di production.
 * Tidak membuat pengguna (tidak ada password bawaan) dan tidak memuat nomor/identitas asli apa pun.
 */
import { and, eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db/client";
import { channels, roleGrants, roles } from "../src/db/schema";
import { getEnv } from "../src/lib/env";
import { writeAudit } from "../src/modules/audit";
import { seedRoles } from "./seed-roles";
import { currentChannelEnvironment } from "../src/modules/channels/service";

export const SAMPLE_CHANNELS = [
  { name: "Admisi — contoh", functionLabel: "Admisi", description: "CONTOH — bukan nomor operasional." },
  { name: "Hotline — contoh", functionLabel: "Hotline", description: "CONTOH — bukan nomor operasional." },
  { name: "Kemitraan — contoh", functionLabel: "Kemitraan", description: "CONTOH — bukan nomor operasional." },
] as const;

export async function seedSample() {
  if (getEnv().APP_ENV === "production") throw new Error("Seed contoh DITOLAK di production.");
  await seedRoles();
  const db = getDb();
  for (const c of SAMPLE_CHANNELS) {
    const [exists] = await db.select({ id: channels.id }).from(channels).where(and(eq(channels.name, c.name), eq(channels.isSample, true)));
    let id = exists?.id;
    if (!id) {
      const [row] = await db
        .insert(channels)
        .values({ ...c, integrationKind: c.functionLabel === "Kemitraan" ? "cloud_api_coexistence" : "cloud_api_only", environment: currentChannelEnvironment(), isOperational: false, isSample: true })
        .returning({ id: channels.id });
      id = row!.id;
      await writeAudit(db, { actorLabel: "cli:seed-sample", action: "channel.seeded", objectType: "channel", objectId: id, metadata: { name: c.name } });
    }
    // Peran "Admin <fungsi>" hanya mencakup channel contoh sesuai fungsinya.
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, `Admin ${c.functionLabel}`));
    if (!role) continue;
    for (const permission of ["channel.view", "chat.view", "chat.reply", "ai.toggle", "chat.transfer", "quickreply.manage", "label.manage", "pipeline.manage"]) {
      await db.insert(roleGrants).values({ roleId: role.id, permission, scopeAll: false, channelIds: [id] }).onConflictDoNothing();
    }
  }
}

if (process.argv[1]?.endsWith("seed-sample.ts")) {
  seedSample().then(() => console.log("Seed contoh selesai (3 channel CONTOH).")).catch((e) => { console.error(e.message); process.exit(1); }).finally(closeDb);
}
