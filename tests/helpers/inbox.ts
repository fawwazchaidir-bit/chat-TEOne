/** Fixture Tahap 3: dua channel (Admisi, Hotline), dua tim, pengguna dengan izin berbeda. Semua SINTETIS; tidak ada data pelanggan. */
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { processInboundBatch } from "@/modules/conversations-messages";
import { ownerQuery } from "./db";
import { loginFull, makeChannel, makeRole, makeUser, type Client } from "./fixtures";
import { CUSTOMER, WABA, envelope, listRecipient, messagesChange, postWebhook, secAgo, textMsg } from "./whatsapp";

export const PHONE_ADM = "200000000000101";
export const PHONE_HOT = "200000000000102";
export const CUSTOMER2 = "15550002002";
export const CUSTOMER3 = "15550003003";

export async function enableFlag(key: string, on = true) {
  await ownerQuery("insert into feature_flag_overrides(key, enabled) values($1,$2) on conflict (key) do update set enabled = excluded.enabled", [key, on]);
}

export async function makeTeam(name: string, o: { channelIds?: string[]; userIds?: string[]; active?: boolean } = {}) {
  const [t] = (await ownerQuery("insert into teams(name, is_active) values($1,$2) returning id", [name, o.active ?? true])).rows;
  for (const c of o.channelIds ?? []) await ownerQuery("insert into team_channels(team_id, channel_id) values($1,$2)", [t.id, c]);
  for (const u of o.userIds ?? []) await ownerQuery("insert into team_members(team_id, user_id) values($1,$2)", [t.id, u]);
  return t.id as string;
}

const CHAT_PERMS = ["channel.view", "chat.view", "chat.reply", "chat.note", "ai.toggle", "chat.transfer", "chat.assign", "quickreply.manage", "killswitch.channel"];
export const grants = (perms: string[], channelIds: string[]) => perms.map((permission) => ({ permission, channelIds }));

export type World = Awaited<ReturnType<typeof inboxWorld>>;

/** Channel Admisi + Hotline (terpetakan, mode uji), penerima uji terdaftar, tim, dan pengguna: adminA (Admisi), adminB (Hotline), viewer (hanya lihat Admisi). */
export async function inboxWorld(o: { simulation?: boolean } = {}) {
  await enableFlag("whatsapp_connector");
  await enableFlag("inbox");
  if (o.simulation) await enableFlag("ai_simulation");
  const chA = await makeChannel("Admisi — contoh", "Admisi");
  const chB = await makeChannel("Hotline — contoh", "Hotline");
  await ownerQuery("insert into channel_connections(channel_id, waba_id, phone_number_id) values($1,$2,$3),($4,$2,$5)", [chA.id, WABA, PHONE_ADM, chB.id, PHONE_HOT]);
  for (const c of [CUSTOMER, CUSTOMER2, CUSTOMER3]) await listRecipient(c);
  const roleA = await makeRole("Admin Admisi (uji)", grants(CHAT_PERMS, [chA.id]));
  const roleB = await makeRole("Admin Hotline (uji)", grants(CHAT_PERMS, [chB.id]));
  const roleView = await makeRole("Pelihat Admisi (uji)", grants(["channel.view", "chat.view"], [chA.id]));
  const adminA = await makeUser({ roleIds: [roleA.id], name: "Admin Admisi" });
  const adminA2 = await makeUser({ roleIds: [roleA.id], name: "Admin Admisi 2" });
  const adminB = await makeUser({ roleIds: [roleB.id], name: "Admin Hotline" });
  const viewer = await makeUser({ roleIds: [roleView.id], name: "Pelihat" });
  const teamA = await makeTeam("Tim Admisi", { channelIds: [chA.id], userIds: [adminA.id, adminA2.id] });
  const teamB = await makeTeam("Tim Hotline", { channelIds: [chB.id], userIds: [adminB.id] });
  const login = (u: { email: string; password: string }): Promise<Client> => loginFull(u);
  return { chA, chB, adminA, adminA2, adminB, viewer, teamA, teamB, roleA, roleB, roleView, login };
}

export const drain = async () => {
  for (let tries = 0; tries < 20; tries++) {
    for (;;) { const r = await processInboundBatch({ limit: 50 }); if (!r.claimed) break; }
    if ((await ownerQuery("select count(*)::int n from inbound_events where status in ('pending','processing')")).rows[0].n === 0) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  expect((await ownerQuery("select status, event_key, last_error from inbound_events where status in ('pending','processing','failed')")).rows, "event tersisa di antrean").toEqual([]);
};

/** Pesan pelanggan masuk (webhook sah, diproses). Mengembalikan id percakapan. */
export async function inbound(o: { phone?: string; from?: string; text?: string; ts?: string; id?: string; name?: string } = {}) {
  const from = o.from ?? CUSTOMER;
  const phone = o.phone ?? PHONE_ADM;
  const id = o.id ?? `wamid.uji.${randomUUID().slice(0, 10)}`;
  const r = await postWebhook(envelope([messagesChange({ phoneId: phone, messages: [textMsg(id, from, o.text ?? "Halo", o.ts ?? secAgo(5))], contacts: [{ wa_id: from, profile: { name: o.name ?? "Peserta Uji" } }] })], WABA));
  expect(r.status, `webhook ditolak: ${r.text}`).toBe(200);
  await drain();
  return id;
}

export async function convId(channelId: string, identity = CUSTOMER): Promise<string> {
  const rows = (await ownerQuery(`select c.id from conversations c join contact_identities i on i.contact_id = c.contact_id where c.channel_id = $1 and i.identity_value = $2`, [channelId, identity])).rows;
  expect(rows.length, `percakapan ${identity} di channel`).toBe(1);
  return rows[0].id as string;
}

export const idem = () => `kunci-${randomUUID()}`;

export async function reply(c: Client, conv: string, o: { text?: string; key?: string; kind?: "text" | "image" | "document"; file?: { bytes: Uint8Array; mime: string; name: string } } = {}) {
  const f = new FormData();
  f.set("kind", o.kind ?? "text");
  f.set("idempotencyKey", o.key ?? idem());
  if ((o.kind ?? "text") === "text") f.set("text", o.text ?? "balasan admin");
  if (o.file) f.set("file", new File([o.file.bytes as BlobPart], o.file.name, { type: o.file.mime }));
  return c.postForm(`/api/v1/conversations/${conv}/reply`, f);
}
