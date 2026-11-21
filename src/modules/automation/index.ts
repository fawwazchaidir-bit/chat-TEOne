/**
 * Modul otomatisasi (Tahap 3): subscriber event pelanggan → job SIMULASI → pipeline kirim ber-guard. Tidak ada AI nyata di sini.
 * Mengimpor modul ini MENDAFTARKAN subscriber (sekali per proses). Subscriber idempoten: UNIQUE(kind, trigger_message_id).
 */
import { eq } from "drizzle-orm";
import { conversations, messages } from "@/db/schema";
import { getDb } from "@/db/client";
import { isFeatureEnabled } from "@/modules/feature-flags";
import { evaluateEligibility, onCustomerMessage, type CustomerMessageEvent } from "@/modules/conversations-messages";
import { createSimJob, runAutomationJob } from "./jobs";

export { createSimJob, runAutomationJob, runDueAutomationJobs, SIM_TEXT } from "./jobs";

/** Menangani satu pesan pelanggan yang layak-waktu: membuat job simulasi bila AI Aktif dan pesan SETELAH batas aktivasi. */
export async function handleCustomerMessage(e: CustomerMessageEvent): Promise<void> {
  if (!(await isFeatureEnabled("ai_simulation"))) return;
  const db = getDb();
  const [c] = await db.select().from(conversations).where(eq(conversations.id, e.conversationId));
  const [m] = await db.select().from(messages).where(eq(messages.id, e.messageId));
  if (!c || !m) return;
  const el = evaluateEligibility({ aiStatus: c.aiStatus, aiBoundaryAt: c.aiBoundaryAt, message: { source: m.source, direction: m.direction, isHistory: m.isHistory, providerTs: m.providerTs } });
  if (!el.eligible) return; // AI Off · history · sebelum batas · waktu tak terbukti → TIDAK diproses
  const jobId = await createSimJob({ id: c.id, channelId: c.channelId, aiVersion: c.aiVersion }, m.id);
  if (jobId) await runAutomationJob(jobId); // bila ada jeda, job diambil worker saat jatuh tempo
}

const KEY = Symbol.for("teone.automation.registered");
const g = globalThis as unknown as Record<symbol, boolean>;
if (!g[KEY]) {
  g[KEY] = true;
  onCustomerMessage(handleCustomerMessage);
}
