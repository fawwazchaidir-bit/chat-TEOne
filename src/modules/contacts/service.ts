/**
 * Kontak = identitas pelanggan lintas channel, berbasis identitas yang DISEDIAKAN provider (bukan nomor tampil).
 * Satu kontak dapat memiliki percakapan di beberapa channel. Penggabungan kontak adalah tindakan eksplisit (bukan di sini).
 * `public_ref` = pengenal opak stabil untuk integrasi masa depan; nomor telepon BUKAN pengenal integrasi.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { contactIdentities, contacts } from "@/db/schema";
import type { Executor } from "@/db/client";

export type IdentityInput = { type: "wa_id" | "user_id"; value: string };

export async function upsertContact(tx: Executor, identities: IdentityInput[], displayName?: string | null): Promise<{ id: string; publicRef: string; created: boolean }> {
  if (identities.length === 0) throw new Error("Kontak tanpa identitas tidak dapat dibuat");
  // Serialkan pembuatan kontak untuk identitas yang sama (urutan terurut → bebas deadlock).
  for (const i of [...identities].sort((a, b) => `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`))) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`contact:${i.type}:${i.value}`}))`);
  }
  const found = await tx
    .select({ contactId: contactIdentities.contactId, type: contactIdentities.identityType, value: contactIdentities.identityValue })
    .from(contactIdentities)
    .where(and(eq(contactIdentities.provider, "whatsapp"), or(...identities.map((i) => and(eq(contactIdentities.identityType, i.type), eq(contactIdentities.identityValue, i.value))))));
  // Prioritas mengikuti urutan input (identitas utama dulu). Tidak ada penggabungan otomatis bila identitas menunjuk kontak berbeda.
  const hit = identities.map((i) => found.find((f) => f.type === i.type && f.value === i.value)).find(Boolean);
  let contactId = hit?.contactId;
  let created = false;
  if (!contactId) {
    const [c] = await tx.insert(contacts).values({ displayName: displayName ?? null }).returning({ id: contacts.id });
    contactId = (c as { id: string }).id;
    created = true;
  }
  const missing = identities.filter((i) => !found.some((f) => f.type === i.type && f.value === i.value));
  if (missing.length) await tx.insert(contactIdentities).values(missing.map((i) => ({ contactId: contactId as string, provider: "whatsapp", identityType: i.type, identityValue: i.value }))).onConflictDoNothing();
  if (displayName && !created) await tx.update(contacts).set({ displayName }).where(and(eq(contacts.id, contactId), sql`${contacts.displayName} IS NULL`));
  const [row] = await tx.select({ id: contacts.id, publicRef: contacts.publicRef }).from(contacts).where(eq(contacts.id, contactId));
  return { id: (row as { id: string }).id, publicRef: (row as { publicRef: string }).publicRef, created };
}
