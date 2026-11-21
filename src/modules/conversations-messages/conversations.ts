import { eq } from "drizzle-orm";
import { channels, conversations } from "@/db/schema";
import type { Executor } from "@/db/client";

/**
 * Satu percakapan per pasangan (kontak, channel) — dijamin UNIQUE di database; aman dipanggil paralel.
 * Percakapan BARU masuk ke antrian tim default channel (Tahap 3); percakapan yang sudah ada tidak diubah.
 */
export async function upsertConversation(tx: Executor, contactId: string, channelId: string): Promise<string> {
  const [ch] = await tx.select({ t: channels.defaultTeamId }).from(channels).where(eq(channels.id, channelId));
  const [c] = await tx.insert(conversations).values({ contactId, channelId, teamId: ch?.t ?? null }).onConflictDoUpdate({ target: [conversations.contactId, conversations.channelId], set: { contactId } }).returning({ id: conversations.id });
  return (c as { id: string }).id;
}
