/**
 * Kontak = identitas pelanggan lintas channel, berbasis identitas yang DISEDIAKAN provider (bukan nomor tampil).
 * Satu kontak dapat memiliki percakapan di beberapa channel. Penggabungan kontak adalah tindakan eksplisit (bukan di sini).
 * `public_ref` = pengenal opak stabil untuk integrasi masa depan; nomor telepon BUKAN pengenal integrasi.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { contactIdentities, contacts } from "@/db/schema";
import type { Executor } from "@/db/client";

export type IdentityInput = { type: "wa_id" | "user_id"; value: string };

/** Identitas dalam satu permintaan menunjuk ≥ 2 kontak BERBEDA yang sudah ada: tidak ada penggabungan otomatis (G2-A01). */
export class IdentityConflictError extends Error {
  constructor(readonly contactIds: string[]) {
    super("identitas_bentrok");
    this.name = "IdentityConflictError";
  }
}

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
  // Identitas menunjuk kontak BERBEDA → konflik: tidak menulis apa pun dan tidak memilih salah satu (karantina oleh pemanggil).
  const owners = [...new Set(found.map((f) => f.contactId))];
  if (owners.length > 1) throw new IdentityConflictError(owners);
  const hit = found[0];
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

/**
 * Pemulihan terkontrol (G2-A01): memindahkan SATU identitas dari kontak yang salah ke kontak BARU. Hanya untuk operator server
 * (skrip `contacts-repair`), selalu diaudit oleh pemanggil. Batasan jujur: pesan TIDAK menyimpan identitas pengirimnya, sehingga
 * percakapan/pesan yang sudah ada tetap pada kontak asal dan tidak dapat dipisah otomatis.
 */
export async function detachIdentity(tx: Executor, identityId: string): Promise<{ oldContactId: string; newContactId: string }> {
  const [row] = await tx.select().from(contactIdentities).where(eq(contactIdentities.id, identityId));
  if (!row) throw new Error("identitas_tidak_ditemukan");
  const same = await tx.select({ id: contactIdentities.id }).from(contactIdentities).where(eq(contactIdentities.contactId, row.contactId));
  if (same.length < 2) throw new Error("identitas_satu_satunya_pada_kontak");
  const [c] = await tx.insert(contacts).values({ displayName: null }).returning({ id: contacts.id });
  const newContactId = (c as { id: string }).id;
  await tx.update(contactIdentities).set({ contactId: newContactId }).where(eq(contactIdentities.id, identityId));
  return { oldContactId: row.contactId, newContactId };
}
