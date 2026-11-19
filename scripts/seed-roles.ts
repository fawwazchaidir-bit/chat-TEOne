/** Menyemai peran awal (idempoten). Tanpa channel → izin bercakupan channel diatur Super Admin atau seed contoh. */
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db/client";
import { roles } from "../src/db/schema";
import { DEFAULT_ROLES } from "../src/modules/roles-permissions/registry";
import { writeAudit } from "../src/modules/audit";

export async function seedRoles() {
  const db = getDb();
  let created = 0;
  for (const r of DEFAULT_ROLES) {
    const [exists] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, r.name));
    if (exists) continue;
    await db.insert(roles).values({ name: r.name, description: r.description, isSystem: true });
    created++;
  }
  if (created) await writeAudit(db, { actorLabel: "cli:seed-roles", action: "role.seeded", objectType: "role", metadata: { created } });
  return created;
}

if (process.argv[1]?.endsWith("seed-roles.ts")) {
  seedRoles().then((n) => console.log(`Peran awal disemai (${n} baru).`)).catch((e) => { console.error(e.message); process.exit(1); }).finally(closeDb);
}
