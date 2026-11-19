import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Health check minimal: tanpa versi, konfigurasi, nama host, atau detail error. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return json({ status: "ok" });
  } catch {
    return json({ status: "degraded" }, 503);
  }
}
