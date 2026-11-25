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
import { IdentityConflictError, upsertContact, type IdentityInput } from "@/modules/contacts/service";
import { contactMatchesMessage, type ClaimedEvent, type MessageFragment, type NormalizedEvent } from "@/modules/whatsapp-adapter";
import { upsertConversation } from "./conversations";
import { automationEligible } from "./events";
import { setAiState } from "./ai-state";
import { dispatchOutbox, enqueueCustomerMessage } from "./outbox";
import { fetchInboundMedia } from "./media";
import { isListedByKnownUserId, isListedRecipient } from "./recipients";
import { applyStatusesToMessage, recordStatusEvent } from "./status";
import { provenCustomerTime } from "./window";

export type IngestOutcome =
  | { kind: "processed"; dropPayload?: boolean; after: (() => Promise<void>)[] }
  | { kind: "quarantined"; reason: string; keepPayload?: boolean };

const noop: IngestOutcome = { kind: "processed", after: [] };

function classify(m: MessageFragment): { type: "text" | "image" | "document" | "unsupported"; downloadable: boolean } {
  if (m.type === "text") return { type: "text", downloadable: false };
  if (m.type === "image" && m.media) return { type: "image", downloadable: true };
  if (m.type === "document" && m.media && (m.media.mime ?? "").toLowerCase().split(";")[0]?.trim() === "application/pdf") return { type: "document", downloadable: true };
  return { type: "unsupported", downloadable: false }; // jenis lain: metadata tersimpan, ditampilkan "belum didukung", tidak menggagalkan percakapan
}

type InsertArgs = { conversationId: string; channelId: string; direction: "masuk" | "keluar"; source: "pelanggan" | "whatsapp_business_app" | "history"; msg: MessageFragment; status: string | null };
type InsertResult = { id: string; inserted: boolean; reclassified: boolean; type: ReturnType<typeof classify>["type"]; downloadable: boolean };
async function insertMessage(tx: Executor, a: InsertArgs): Promise<InsertResult> {
  const cls = classify(a.msg);
  const providerTs = a.msg.ts ? new Date(a.msg.ts) : null;
  const values = {
    conversationId: a.conversationId, channelId: a.channelId, direction: a.direction, source: a.source, type: cls.type, rawType: a.msg.rawType,
    body: a.msg.text ?? a.msg.media?.caption ?? null, providerMessageId: a.msg.id, providerTs, status: a.status, isHistory: a.source === "history",
    // D-16: hanya pesan pelanggan LANGSUNG yang baru menambah jumlah belum dibaca (bukan history/echo/duplikat/penggolongan ulang).
    unreadEligible: a.source === "pelanggan" && a.direction === "masuk",
  };
  const ins = await tx.insert(messages).values(values).onConflictDoNothing({ target: [messages.channelId, messages.providerMessageId] }).returning({ id: messages.id });
  if (ins.length) return { id: (ins[0] as { id: string }).id, inserted: true, reclassified: false, ...cls };
  const [ex] = await tx.select().from(messages).where(and(eq(messages.channelId, a.channelId), eq(messages.providerMessageId, a.msg.id)));
  // Event langsung yang tiba SETELAH salinan history-nya: DATA diperbarui (sumber, isi, waktu provider), tetapi ini BUKAN pesan baru —
  // pemanggil memutuskan jendela/otomatisasi dari BUKTI WAKTU, tidak dari urutan kedatangan (G2-A03).
  if (ex && ex.isHistory && a.source === "pelanggan" && ex.direction === "masuk") {
    await tx.update(messages).set({ source: "pelanggan", isHistory: false, body: values.body, providerTs }).where(eq(messages.id, ex.id));
    return { id: ex.id, inserted: false, reclassified: true, ...cls };
  }
  return { id: (ex as { id: string }).id, inserted: false, reclassified: false, ...cls };
}

/**
 * `lastMessageAt` (urutan tampilan) boleh memakai waktu kedatangan bila cap waktu tak ada; `lastCustomerMessageAt` (DASAR JENDELA LAYANAN)
 * hanya diperbarui dengan waktu pesan yang TERBUKTI (`customerProof`, G2-A02) — tidak pernah dengan waktu kedatangan.
 */
async function touchConversation(tx: Executor, conversationId: string, displayTs: Date | null, customerProof: Date | null) {
  if (!displayTs && !customerProof) return;
  await tx.update(conversations).set({
    ...(displayTs ? { lastMessageAt: sql`GREATEST(COALESCE(${conversations.lastMessageAt}, 'epoch'::timestamptz), ${displayTs})` } : {}),
    ...(customerProof ? { lastCustomerMessageAt: sql`GREATEST(COALESCE(${conversations.lastCustomerMessageAt}, 'epoch'::timestamptz), ${customerProof})` } : {}),
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

/**
 * D-05 (ASUMSI, default usulan): pesan keluar BARU dari WhatsApp Business App → AI Off pada chat itu. Event lama/duplikat TIDAK boleh
 * membalik status yang sudah diperbarui: hanya echo baru (bukan duplikat) yang waktunya TERBUKTI dan SETELAH batas aktivasi ulang yang berlaku.
 */
async function echoTurnsAiOff(tx: Executor, conversationId: string, ts: Date | null) {
  const [c] = await tx.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!c || c.aiStatus !== "aktif") return;
  const proven = provenCustomerTime(ts ? ts.toISOString() : null);
  if (!proven || (c.aiBoundaryAt && proven.getTime() <= c.aiBoundaryAt.getTime())) {
    await writeAudit(tx, { actorLabel: "sistem:echo", action: "conversation.echo_ai_ignored", objectType: "conversation", objectId: conversationId, metadata: { reason: proven ? "sebelum_batas" : "waktu_tidak_terbukti" } });
    return;
  }
  await setAiState(tx, conversationId, { to: "off", reason: "balasan_dari_hp" }, { audit: { actorLabel: "sistem:echo" }, actorId: null, label: "sistem:echo (HP)" });
}

const dedupeIds = (ids: IdentityInput[]): IdentityInput[] => ids.filter((i, k) => ids.findIndex((j) => j.type === i.type && j.value === i.value) === k);

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
      // Pengenal HANYA dari pesan itu sendiri + entri contacts yang terbukti miliknya (validasi ulang: event lama di antrean mungkin
      // dinormalisasi oleh versi sebelum perbaikan G2-A01). Entri contacts yang tak terbukti diabaikan seluruhnya (termasuk namanya).
      const ct = p.contact && contactMatchesMessage(m, p.contact) ? p.contact : null;
      const identities = dedupeIds([...idsOf(m.from, m.userId), ...idsOf(ct?.waId ?? null, ct?.userId ?? null)]);
      if (identities.length === 0) return { kind: "quarantined", reason: "pengirim_tanpa_identitas" };
      const waId = identities.find((i) => i.type === "wa_id")?.value;
      if (conn.testMode && !(waId && (await isListedRecipient(tx, waId)))) return quarantineUnlisted(tx, channelId, "message");
      let contact;
      try {
        contact = await upsertContact(tx, identities, ct?.name ?? null);
      } catch (e) {
        if (!(e instanceof IdentityConflictError)) throw e;
        await writeAudit(tx, { actorLabel: "sistem:webhook", action: "integration.identity_conflict", objectType: "channel", objectId: channelId, result: "denied", metadata: { kind: "message", contacts: e.contactIds.length } });
        return { kind: "quarantined", reason: "identitas_bentrok", keepPayload: true }; // tidak ada kontak/pesan ditulis; tidak ada penggabungan otomatis
      }
      const conversationId = await upsertConversation(tx, contact.id, channelId);
      const r = await insertMessage(tx, { conversationId, channelId, direction: "masuk", source: "pelanggan", msg: m, status: null });
      if (!r.inserted && !r.reclassified) return noop; // event ganda: tidak ada efek samping
      const now = new Date();
      const proven = provenCustomerTime(m.ts, now); // bukti waktu: cap provider yang sah, bukan waktu kedatangan
      await touchConversation(tx, conversationId, proven ?? now, proven);
      const after: (() => Promise<void>)[] = [];
      if (r.inserted && m.referral) {
        await tx.insert(leadSources).values({ conversationId, messageId: r.id, channelId, sourceType: m.referral.sourceType, sourceId: m.referral.sourceId, sourceUrl: m.referral.sourceUrl, headline: m.referral.headline, clickId: m.referral.clickId }).onConflictDoNothing();
      }
      if (r.inserted && r.downloadable) { const job = await attachMedia(tx, r.id, channelId, m.media, "download"); if (job) after.push(job); }
      // Pemicu otomatisasi: PEMBARUAN DATA ≠ KELAYAKAN. Hanya bila waktu pesan terbukti dan baru; penggolongan ulang history→langsung
      // yang lama/tak terbukti TIDAK memicu (G2-A03). Event ditulis ke OUTBOX DURABLE dalam transaksi yang sama (T2-F15 tertutup).
      if (automationEligible(proven, now)) {
        await enqueueCustomerMessage(tx, { channelId, conversationId, messageId: r.id, contactId: contact.id, providerTs: (proven as Date).toISOString(), receivedAt: now.toISOString() });
        after.push(() => dispatchOutbox().then(() => undefined));
      } else if (r.inserted && !proven) {
        // Urutan/waktu tak dapat dipastikan saat AI Aktif → tandai untuk ditinjau; JANGAN diproses (Tahap 3 §9).
        await tx.update(conversations).set({ reviewFlag: "urutan_tidak_pasti" }).where(and(eq(conversations.id, conversationId), eq(conversations.aiStatus, "aktif")));
      }
      return { kind: "processed", after };
    }

    case "echo": {
      const m = p.message;
      // Penerima = nomor (`to`) dan/atau BSUID (`to_user_id`), ditambah entri contacts[] HANYA bila terbukti miliknya (validasi ulang: event lama
      // di antrean tidak memuatnya). Dikarantina hanya bila penerima benar-benar tidak dapat ditentukan. Identitas admin pengirim TIDAK ditebak.
      const toUserId = p.toUserId ?? null;
      const ct = p.contact && contactMatchesMessage({ from: p.to, userId: toUserId }, p.contact) ? p.contact : null;
      const identities = dedupeIds([...idsOf(p.to, toUserId), ...idsOf(ct?.waId ?? null, ct?.userId ?? null)]);
      if (identities.length === 0) return { kind: "quarantined", reason: "echo_tanpa_penerima" };
      if (conn.testMode) {
        const phone = identities.find((i) => i.type === "wa_id")?.value;
        const uid = identities.find((i) => i.type === "user_id")?.value;
        const listed = phone ? await isListedRecipient(tx, phone) : uid ? await isListedByKnownUserId(tx, uid) : false;
        if (!listed) return quarantineUnlisted(tx, channelId, "echo");
      }
      let contact;
      try {
        contact = await upsertContact(tx, identities, null);
      } catch (e) {
        if (!(e instanceof IdentityConflictError)) throw e;
        await writeAudit(tx, { actorLabel: "sistem:webhook", action: "integration.identity_conflict", objectType: "channel", objectId: channelId, result: "denied", metadata: { kind: "echo", contacts: e.contactIds.length } });
        return { kind: "quarantined", reason: "identitas_bentrok", keepPayload: true }; // tidak ada kontak/pesan ditulis; tidak ada penggabungan otomatis
      }
      const conversationId = await upsertConversation(tx, contact.id, channelId);
      const r = await insertMessage(tx, { conversationId, channelId, direction: "keluar", source: "whatsapp_business_app", msg: m, status: "terkirim" });
      if (!r.inserted) return noop;
      await applyStatusesToMessage(tx, channelId, m.id); // status yang datang LEBIH DULU dari pesannya diterapkan sekarang
      await echoTurnsAiOff(tx, conversationId, m.ts ? new Date(m.ts) : null); // D-05 (ASUMSI): pesan keluar baru dari HP → AI Off
      await touchConversation(tx, conversationId, m.ts ? new Date(m.ts) : new Date(), null); // BUKAN pesan pelanggan → jendela tidak berubah
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
      await touchConversation(tx, conversationId, p.message.ts ? new Date(p.message.ts) : null, null); // history tanpa waktu TIDAK memindahkan chat ke urutan teratas
      if (r.downloadable) await attachMedia(tx, r.id, channelId, p.message.media, "history"); // media riwayat tidak diunduh (Tahap 2)
      return { kind: "processed", after: [] }; // TIDAK ada hook: history tidak memicu apa pun
    }

    case "contact_sync":
      return noop; // sinkronisasi kontak Business App: tidak disimpan (minimalisasi data)

    default:
      return { kind: "quarantined", reason: "bentuk_tidak_dikenal" };
  }
}
