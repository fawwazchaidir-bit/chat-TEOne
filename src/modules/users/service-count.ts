import { and, eq, sql } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDb } from "@/db/client";

export async function countActiveSuperAdmins() {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.isSuperAdmin, true), eq(users.status, "active")));
  return r?.n ?? 0;
}
