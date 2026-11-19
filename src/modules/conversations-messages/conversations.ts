import { conversations } from "@/db/schema";
import type { Executor } from "@/db/client";

/** Satu percakapan per pasangan (kontak, channel) — dijamin UNIQUE di database; aman dipanggil paralel. */
export async function upsertConversation(tx: Executor, contactId: string, channelId: string): Promise<string> {
  const [c] = await tx.insert(conversations).values({ contactId, channelId }).onConflictDoUpdate({ target: [conversations.contactId, conversations.channelId], set: { contactId } }).returning({ id: conversations.id });
  return (c as { id: string }).id;
}
