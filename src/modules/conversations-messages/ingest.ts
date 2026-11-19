/**
 * Pemrosesan event masuk menjadi kontak → percakapan → pesan (ADR-0003). Dijalankan DI DALAM satu transaksi bersama
 * penandaan event `processed` ⇒ atomik; idempoten (UNIQUE provider_message_id / event_key) ⇒ aman diulang.
 *
 * Kontrak inti #3: `history` dan `echo` ditandai, TIDAK memperbarui jendela layanan, dan TIDAK memicu hook otomatisasi.
 * D-03 (ASUMSI): pada channel mode-uji, pengirim/penerima di luar daftar uji → event dikarantina seminimal mungkin
 * (payload dibuang, tidak ada kontak/pesan), tidak diproses otomatisasi, dan DILAPORKAN (audit + hitungan di alat uji).
 */
import { and, eq, sql } from "drizzle-orm";
import { channelConnections, conversations, leadSources, media, messages } from "@/db/schema";
import type { Executor } from "@/db/client";
import { writeAudit } from "@/modules/audit";
import { upsertContact, type IdentityInput } from "@/modules/contacts/service";
import type { ClaimedEvent, MessageFragment, NormalizedEvent } from "@/modules/whatsapp-adapter";
import { upsertConversation } from "./conversations";
import { emitCustomerMessage } from "./events";
import { fetchInboundMedia } from "./media";
import { isListedRecipient } from "./recipients";
import { applyStatusesToMessage, recordStatusEvent } from "./status";

export type IngestOutcome =
  | { kind: "processed"; dropPayload?: boolean; after: (() => Promise<void>)[] }
  | { kind: "quarantined"; reason: string };

const noop: IngestOutcome = { kind: "processed", after: [] };

function classify(m: MessageFragment): { type: "text" | "image" | "document" | "unsupported"; downloadable: boolean } {
  if (m.type === "text") return { type: "text", downloadable: false };
  if (m.type === "image" && m.media) return { type: "image", downloadable: true };
  if (m.type === "document" && m.media && (m.media.mime ?? "").toLowerCase().split(";")[0]?.trim() === "application/pdf") return { type: "document", downloadable: true };
  return { type: "unsupported", downloadable: false }; // jenis lain: metadata tersimpan, ditampilkan "belum didukung", tidak menggagalkan percakapan
}

type InsertArgs = { conversationId: string; channelId: string; direction: "masuk" | "keluar"; source: "pelanggan" | "whatsapp_business_app" | "history"; msg: MessageFragment; status: string | null };
async function insertMessage(tx: Executor, a: InsertArgs): Promise<{ id: string; inserted: boolean; type: ReturnType<typeof classify>["type"]; downloadable: boolean }> {
  const cls = classify(a.msg);
  const providerTs = a.msg.ts ? new Date(a.msg.ts) : null;
  const values = {
    conversationId: a.conversationId, channelId: a.channelId, direction: a.direction, source: a.source, type: cls.type, rawType: a.msg.rawType,
    body: a.msg.text ?? a.msg.media?.caption ?? null, providerMessageId: a.msg.id, providerTs, status: a.status, isHistory: a.source === "history",
  };
  const ins = await tx.insert(messages).values(values).onConflictDoNothing({ target: [messages.channelId, messages.providerMessageId] }).returning({ id: messages.id });
  if (ins.length) return { id: (ins[0] as { id: string }).id, inserted: true, ...cls };
  const [ex] = await tx.select().from(messages).where(and(eq(messages.channelId, a.channelId), eq(messages.providerMessageId, a.msg.id)));
  // Event langsung yang tiba SETELAH salinan history-nya: event langsung dipercaya (pesan itu memang baru).
  if (ex && ex.isHistory && a.source === "pelanggan" && ex.direction === "masuk") {
    await tx.update(messages).set({ source: "pelanggan", isHistory: false, body: values.body, providerTs }).where(eq(messages.id, ex.id));
    return { id: ex.id, inserted: true, ...cls };
  }
  return { id: (ex as { id: string }).id, inserted: false, ...cls };
}

async function touchConversation(tx: Executor, conversationId: string, ts: Date, customer: boolean) {
  await tx.update(conversations).set({
    lastMessageAt: sql`GREATEST(COALESCE(${conversations.lastMessageAt}, 'epoch'::timestamptz), ${ts})`,
    ...(customer ? { lastCustomerMessageAt: sql`GREATEST(COALESCE(${conversations.lastCustomerMessageAt}, 'epoch'::timestamptz), ${ts})` } : {}),
  }).where(eq(conversations.id, conversationId));
}

async function attachMedia(tx: Executor, messageId: string, channelId: string, m: MessageFragment["media"], mode: "download" | "history"): Promise<(() => Promise<void>) | null> {
  if (!m) return null;
  const [row] = await tx.insert(media).values({
    messageId, channelId, providerMediaId: m.id, mime: m.mime?.toLowerCase().split(";")[0]?.trim() ?? null, declaredSha256: m.sha256,
    status: mode === "history" ? "tidak_tersedia" : "menunggu", errorCategory: mode === "history" ? "riwayat_tidak_diunduh" : null,
  }).onConflictDoNothing().returning({ id: media.id });
  if (!row || mode === "history") return null;
  return async () => { await fetchInboundMedia(row.id); };
}

const idsOf = (waId: string | null, userId: string | null): IdentityInput[] => [...(waId ? [{ type: "wa_id" as const, value: waId }] : []), ...(userId ? [{ type: "user_id" as const, value: userId }] : [])];

async function quarantineUnlisted(tx: Executor, channelId: string, kind: string): Promise<IngestOutcome> {
  await writeAudit(tx, { actorLabel: "sistem:webhook", action: "integration.unlisted_sender", objectType: "channel", objectId: channelId, result: "denied", metadata: { kind } });
  return { kind: "quarantined", reason: "pengirim_di_luar_daftar_uji" };
}

export async function ingestEvent(tx: Executor, ev: ClaimedEvent): Promise<IngestOutcome> {
  const p = ev.payload as NormalizedEvent;
  const channelId = ev.channelId;
  if (!channelId) return { kind: "quarantined", reason: "channel_tidak_dikenal" };
  const [conn] = await tx.select().from(channelConnections).where(eq(channelConnections.channelId, channelId));
  if (!conn) return { kind: "quarantined", reason: "channel_tidak_dikenal" };

  switch (p.kind) {
    case "status": {
      await recordStatusEvent(tx, channelId, { id: p.status.id, status: p.status.status, ts: p.status.ts, errorCode: p.status.errorCode, opaque: p.status.opaque });
      return { kind: "processed", after: [] };
    }

    case "message": {
      const m = p.message;
      const identities = idsOf(m.from ?? p.contact?.waId ?? null, m.userId ?? p.contact?.userId ?? null);
      if (identities.length === 0) return { kind: "quarantined", reason: "pengirim_tanpa_identitas" };
      const waId = identities.find((i) => i.type === "wa_id")?.value;
      if (conn.testMode && !(waId && (await isListedRecipient(tx, waId)))) return quarantineUnlisted(tx, channelId, "message");
      const contact = await upsertContact(tx, identities, p.contact?.name ?? null);
      const conversationId = await upsertConversation(tx, contact.id, channelId);
      const r = await insertMessage(tx, { conversationId, channelId, direction: "masuk", source: "pelanggan", msg: m, status: null });
      if (!r.inserted) return noop; // event ganda: tidak ada efek samping
      const received = m.ts ? new Date(m.ts) : new Date(); // waktu provider; bila tak ada → waktu server
      await touchConversation(tx, conversationId, received, true);
      const after: (() => Promise<void>)[] = [];
      if (m.referral) {
        await tx.insert(leadSources).values({ conversationId, messageId: r.id, channelId, sourceType: m.referral.sourceType, sourceId: m.referral.sourceId, sourceUrl: m.referral.sourceUrl, headline: m.referral.headline, clickId: m.referral.clickId }).onConflictDoNothing();
      }
      if (r.downloadable) { const job = await attachMedia(tx, r.id, channelId, m.media, "download"); if (job) after.push(job); }
      after.push(() => emitCustomerMessage({ channelId, conversationId, messageId: r.id, contactId: contact.id })); // satu-satunya pemicu otomatisasi
      return { kind: "processed", after };
    }

    case "echo": {
      const m = p.message;
      const to = p.to;
      if (!to) return { kind: "quarantined", reason: "echo_tanpa_penerima" };
      if (conn.testMode && !(await isListedRecipient(tx, to))) return quarantineUnlisted(tx, channelId, "echo");
      const contact = await upsertContact(tx, [{ type: "wa_id", value: to }], null);
      const conversationId = await upsertConversation(tx, contact.id, channelId);
      const r = await insertMessage(tx, { conversationId, channelId, direction: "keluar", source: "whatsapp_business_app", msg: m, status: "terkirim" });
      if (!r.inserted) return noop;
      await applyStatusesToMessage(tx, channelId, m.id); // status yang datang LEBIH DULU dari pesannya diterapkan sekarang
      await touchConversation(tx, conversationId, m.ts ? new Date(m.ts) : new Date(), false); // BUKAN pesan pelanggan → jendela tidak berubah
      const after: (() => Promise<void>)[] = [];
      if (r.downloadable) { const job = await attachMedia(tx, r.id, channelId, m.media, "download"); if (job) after.push(job); }
      return { kind: "processed", after };
    }

    case "history": {
      if (!p.message) {
        // Event progres/penolakan sinkronisasi riwayat: hanya dicatat pada koneksi.
        await tx.update(channelConnections).set({ historyProgress: { ...p.progress, updatedAt: new Date().toISOString() } }).where(eq(channelConnections.channelId, channelId));
        return noop;
      }
      const customer = p.customer;
      if (!customer) return { kind: "quarantined", reason: "history_tanpa_pelanggan" };
      if (conn.testMode && !(await isListedRecipient(tx, customer))) return quarantineUnlisted(tx, channelId, "history");
      const contact = await upsertContact(tx, [{ type: "wa_id", value: customer }], null);
      const conversationId = await upsertConversation(tx, contact.id, channelId);
      const r = await insertMessage(tx, { conversationId, channelId, direction: p.direction, source: "history", msg: p.message, status: null });
      if (!r.inserted) return noop; // dideduplikasi terhadap event langsung
      await touchConversation(tx, conversationId, p.message.ts ? new Date(p.message.ts) : new Date(), false);
      if (r.downloadable) await attachMedia(tx, r.id, channelId, p.message.media, "history"); // media riwayat tidak diunduh (Tahap 2)
      return { kind: "processed", after: [] }; // TIDAK ada hook: history tidak memicu apa pun
    }

    case "contact_sync":
      return noop; // sinkronisasi kontak Business App: tidak disimpan (minimalisasi data)

    default:
      return { kind: "quarantined", reason: "bentuk_tidak_dikenal" };
  }
}
