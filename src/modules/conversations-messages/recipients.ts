/**
 * Daftar penerima uji — ditegakkan DI SERVER untuk semua pengiriman (AGENTS.md §3.6, CCP 2.5).
 * Identitas = identitas WhatsApp dalam digit internasional. Nomor lokal "08…" otomatis menjadi "628…" (konteks Indonesia).
 * Nilai lengkap tidak pernah dikembalikan ke UI/audit — hanya disamarkan.
 */
import { and, eq, inArray } from "drizzle-orm";
import { contactIdentities, testRecipients } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import { requireFeature } from "@/modules/feature-flags";
import type { Ctx } from "@/modules/shared/context";
import { mapDbError } from "@/modules/shared/db-errors";

export function normalizeIdentity(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = `62${d.slice(1)}`;
  if (!/^\d{7,16}$/.test(d)) throw badRequest("Nomor penerima tidak valid (7–16 digit, format internasional).", undefined, "VALIDATION_ERROR");
  return d;
}
export const maskIdentity = (d: string) => `••••${d.slice(-4)}`;

export async function isListedRecipient(ex: Executor, identity: string): Promise<boolean> {
  const [r] = await ex.select({ active: testRecipients.active }).from(testRecipients).where(eq(testRecipients.identityValue, identity));
  return r?.active === true;
}

/**
 * Penerima yang HANYA dikenal lewat BSUID (Meta menghilangkan nomor bila tidak tersedia): terdaftar bila kontak yang SUDAH dikenal dengan
 * BSUID itu memiliki nomor (wa_id) yang ada di daftar uji. BSUID tak dikenal → tidak terdaftar (daftar uji berbasis nomor; tidak menebak).
 */
export async function isListedByKnownUserId(ex: Executor, userId: string): Promise<boolean> {
  const owners = await ex.select({ contactId: contactIdentities.contactId }).from(contactIdentities)
    .where(and(eq(contactIdentities.provider, "whatsapp"), eq(contactIdentities.identityType, "user_id"), eq(contactIdentities.identityValue, userId)));
  if (owners.length === 0) return false;
  const phones = await ex.select({ value: contactIdentities.identityValue }).from(contactIdentities)
    .where(and(eq(contactIdentities.provider, "whatsapp"), eq(contactIdentities.identityType, "wa_id"), inArray(contactIdentities.contactId, owners.map((o) => o.contactId))));
  for (const ph of phones) if (await isListedRecipient(ex, ph.value)) return true;
  return false;
}

/**
 * Kebijakan penerima untuk pengiriman dari INBOX/otomatisasi (AGENTS.md §3.6): di lingkungan NON-production, atau selama channel berada
 * di MODE UJI (D-03), penerima WAJIB ada di daftar penerima uji — ditegakkan di server. Hanya production dengan mode uji dimatikan
 * (go-live nomor = Tahap 9, di luar lingkup) yang mengizinkan penerima lain. Alat uji Tahap 2 tetap selalu wajib daftar.
 */
export async function recipientAllowed(ex: Executor, conn: { testMode: boolean }, identity: string): Promise<boolean> {
  const { getEnv } = await import("@/lib/env");
  if (getEnv().APP_ENV === "production" && !conn.testMode) return true;
  return isListedRecipient(ex, identity);
}

const need = (ctx: Ctx) => { if (!ctx.perms.can("integration.test")) throw forbidden("Mengelola penerima uji memerlukan izin alat uji di semua channel."); };

export async function listRecipients(ctx: Ctx) {
  await requireFeature("whatsapp_connector");
  if (!ctx.perms.canAny("integration.test")) throw forbidden(); // melihat daftar (tersamarkan) cukup izin di satu channel; mengubah tetap global
  const rows = await getDb().select().from(testRecipients).orderBy(testRecipients.createdAt);
  return rows.map((r) => ({ id: r.id, label: r.label, identity: maskIdentity(r.identityValue), active: r.active, createdAt: r.createdAt.toISOString() }));
}

export async function addRecipient(ctx: Ctx, input: { label: string; identity: string }) {
  await requireFeature("whatsapp_connector");
  need(ctx);
  const identity = normalizeIdentity(input.identity);
  try {
    return await getDb().transaction(async (tx) => {
      const [r] = await tx.insert(testRecipients).values({ label: input.label.trim().slice(0, 80), identityValue: identity, createdBy: ctx.user.id }).returning({ id: testRecipients.id });
      await writeAudit(tx, { ...auditFor(ctx), action: "integration.recipient_added", objectType: "test_recipient", objectId: (r as { id: string }).id, metadata: { label: input.label.trim().slice(0, 80), identity: maskIdentity(identity) } });
      return { id: (r as { id: string }).id };
    });
  } catch (e) {
    return mapDbError(e, { unique: { test_recipients_identity_unique: ["RECIPIENT_EXISTS", "Penerima uji itu sudah terdaftar."] } });
  }
}

export async function removeRecipient(ctx: Ctx, id: string) {
  await requireFeature("whatsapp_connector");
  need(ctx);
  await getDb().transaction(async (tx) => {
    const [r] = await tx.select().from(testRecipients).where(eq(testRecipients.id, id));
    if (!r) throw notFound("Penerima uji tidak ditemukan.");
    await tx.delete(testRecipients).where(eq(testRecipients.id, id));
    await writeAudit(tx, { ...auditFor(ctx), action: "integration.recipient_removed", objectType: "test_recipient", objectId: id, metadata: { label: r.label, identity: maskIdentity(r.identityValue) } });
  });
}

/** Menerjemahkan ID penerima → identitas (digit) DI SERVER agar UI tidak perlu menampung nomor utuh. Hanya yang aktif. */
export async function resolveRecipientId(ctx: Ctx, id: string): Promise<string> {
  if (!ctx.perms.canAny("integration.test")) throw forbidden();
  const [r] = await getDb().select().from(testRecipients).where(eq(testRecipients.id, id));
  if (!r || !r.active) throw notFound("Penerima uji tidak ditemukan.");
  return r.identityValue;
}
