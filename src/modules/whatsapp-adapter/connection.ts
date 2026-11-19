/**
 * Pemetaan channel ↔ WABA ↔ phone_number_id + status verifikasi. Status "terverifikasi" HANYA berasal dari pemeriksaan
 * nyata ke Graph API (AGENTS.md §3.7); `verification_mode` membedakan Meta asli ('nyata') dari mock ('simulasi').
 */
import { eq } from "drizzle-orm";
import { channelConnections } from "@/db/schema";
import { getDb } from "@/db/client";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import { requireFeature } from "@/modules/feature-flags";
import { getChannel } from "@/modules/channels/service";
import type { Ctx } from "@/modules/shared/context";
import { mapDbError } from "@/modules/shared/db-errors";
import { getMetaConfig, isRealMetaEndpoint } from "./config";
import { getPhoneNumber, listSubscribedApps, listWabaPhoneNumbers, type CallResult } from "./client";
import { CATEGORY_LABEL, categorizeMetaError } from "./errors";

const ID_RE = /^\d{5,30}$/;
const UNIQUE = { channel_connections_phone_unique: ["PHONE_NUMBER_ID_TAKEN", "phone_number_id itu sudah dipetakan ke channel lain."] as [string, string] };

export async function getConnectionRow(channelId: string) {
  const [c] = await getDb().select().from(channelConnections).where(eq(channelConnections.channelId, channelId));
  return c ?? null;
}

/** Tampilan aman (tidak ada rahasia). Wajib punya hak LIHAT channel. */
export async function getConnectionView(ctx: Ctx, channelId: string) {
  await requireFeature("whatsapp_connector");
  await getChannel(ctx, channelId); // 403 / 404 sesuai cakupan
  const c = await getConnectionRow(channelId);
  return c ? { configured: true as const, ...c, verifiedAt: c.verifiedAt?.toISOString() ?? null, updatedAt: c.updatedAt.toISOString(), createdAt: undefined } : { configured: false as const };
}

export async function saveConnection(ctx: Ctx, channelId: string, input: { wabaId: string; phoneNumberId: string }) {
  await requireFeature("whatsapp_connector");
  const ch = await getChannel(ctx, channelId);
  if (!ctx.perms.can("channel.manage", channelId)) throw forbidden();
  if (ch.archivedAt) throw badRequest("Channel yang diarsipkan tidak dapat dikonfigurasi.", undefined, "CHANNEL_ARCHIVED");
  if (!ID_RE.test(input.wabaId) || !ID_RE.test(input.phoneNumberId)) throw badRequest("WABA ID dan phone_number_id harus berupa angka.", undefined, "VALIDATION_ERROR");
  const existing = await getConnectionRow(channelId);
  const changed = !existing || existing.wabaId !== input.wabaId || existing.phoneNumberId !== input.phoneNumberId;
  try {
    await getDb().transaction(async (tx) => {
      await tx
        .insert(channelConnections)
        .values({ channelId, wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, updatedBy: ctx.user.id })
        .onConflictDoUpdate({
          target: channelConnections.channelId,
          // Pemetaan berubah ⇒ verifikasi lama TIDAK berlaku lagi.
          set: { wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, updatedAt: new Date(), updatedBy: ctx.user.id, ...(changed ? { verificationStatus: "belum_diperiksa", verificationMode: null, verifiedAt: null, verificationDetail: {} } : {}) },
        });
      await writeAudit(tx, { ...auditFor(ctx), action: "integration.connection_saved", objectType: "channel", objectId: channelId, metadata: { wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, resetVerification: changed } });
    });
  } catch (e) {
    return mapDbError(e, { unique: UNIQUE });
  }
  return getConnectionView(ctx, channelId);
}

/** Mode uji: mematikannya hanya oleh Super Admin dan hanya di production (go-live nomor = Tahap 9, di luar lingkup). */
export async function setTestMode(ctx: Ctx, channelId: string, testMode: boolean) {
  await requireFeature("whatsapp_connector");
  if (!ctx.user.isSuperAdmin) throw forbidden("Hanya Super Admin yang dapat mengubah mode uji.");
  const c = await getConnectionRow(channelId);
  if (!c) throw notFound("Koneksi channel belum dikonfigurasi.");
  if (!testMode && (await import("@/lib/env")).getEnv().APP_ENV !== "production") throw conflict("TEST_MODE_REQUIRED", "Mode uji hanya dapat dimatikan di production.");
  await getDb().transaction(async (tx) => {
    await tx.update(channelConnections).set({ testMode, updatedAt: new Date(), updatedBy: ctx.user.id }).where(eq(channelConnections.channelId, channelId));
    await writeAudit(tx, { ...auditFor(ctx), action: "integration.test_mode_changed", objectType: "channel", objectId: channelId, metadata: { testMode } });
  });
}

const mask = (s: string | undefined | null) => (s ? `••••${s.replace(/\D/g, "").slice(-4)}` : null);
const brief = (r: CallResult<unknown>) => (r.ok ? { ok: true, status: r.status } : r.kind === "http" ? { ok: false, kategori: categorizeMetaError(r.meta.code, r.status), status: r.status } : { ok: false, kategori: r.kind });

export type VerifyDetail = {
  checkedAt: string; endpoint: "meta" | "mock"; apiVersion: string;
  phone: { ok: boolean; kategori?: string; status?: number; display: string | null; verifiedName: string | null };
  waba: { ok: boolean; kategori?: string; status?: number; memberOfWaba: boolean };
  webhookSubscribed: boolean | null; problems: string[];
};

/** Pemeriksaan NYATA ke Graph API. Hasil dicatat apa adanya; tidak ada klaim "terhubung" di luar ini. */
export async function runVerification(conn: { wabaId: string; phoneNumberId: string }) {
  const cfg = getMetaConfig();
  const mode = isRealMetaEndpoint(cfg) ? "nyata" : "simulasi";
  const [phone, waba, subs] = await Promise.all([getPhoneNumber(conn.phoneNumberId), listWabaPhoneNumbers(conn.wabaId), listSubscribedApps(conn.wabaId)]);
  const member = waba.ok && (waba.data?.data ?? []).some((x) => x.id === conn.phoneNumberId);
  const phoneOk = phone.ok && (!phone.data?.id || phone.data.id === conn.phoneNumberId);
  const problems: string[] = [];
  for (const [nama, r] of [["nomor", phone], ["waba", waba]] as const) {
    if (r.ok) continue;
    if (r.kind === "konfigurasi") problems.push(`${nama}: ${CATEGORY_LABEL.konfigurasi} (${r.detail})`);
    else if (r.kind === "http") problems.push(`${nama}: ${CATEGORY_LABEL[categorizeMetaError(r.meta.code, r.status)]}`);
    else problems.push(`${nama}: ${CATEGORY_LABEL[r.kind]}`);
  }
  if (waba.ok && !member) problems.push("waba: phone_number_id tidak ditemukan di WABA tersebut (pemetaan salah?)");
  const webhookSubscribed = subs.ok ? (subs.data?.data?.length ?? 0) > 0 : null;
  if (webhookSubscribed === false) problems.push("webhook: aplikasi Meta belum berlangganan ke WABA ini (event tidak akan datang)");
  const verified = phoneOk && member;
  const detail: VerifyDetail = {
    checkedAt: new Date().toISOString(), endpoint: mode === "nyata" ? "meta" : "mock", apiVersion: cfg.apiVersion,
    phone: { ok: phoneOk, ...(phone.ok ? {} : { kategori: brief(phone).ok ? undefined : (brief(phone) as { kategori: string }).kategori, status: phone.kind === "http" ? phone.status : undefined }), display: phone.ok ? mask(phone.data?.display_phone_number) : null, verifiedName: phone.ok ? (phone.data?.verified_name ?? null) : null },
    waba: { ok: waba.ok, memberOfWaba: member, ...(waba.ok ? {} : { kategori: (brief(waba) as { kategori: string }).kategori }) },
    webhookSubscribed, problems,
  };
  return { verified, mode, detail };
}

export async function verifyConnection(ctx: Ctx, channelId: string) {
  await requireFeature("whatsapp_connector");
  await getChannel(ctx, channelId);
  if (!ctx.perms.can("channel.manage", channelId)) throw forbidden();
  const conn = await getConnectionRow(channelId);
  if (!conn) throw notFound("Koneksi channel belum dikonfigurasi.");
  const { verified, mode, detail } = await runVerification(conn);
  const problems = detail.problems;
  await getDb().transaction(async (tx) => {
    await tx.update(channelConnections).set(verified
      ? { verificationStatus: "terverifikasi", verificationMode: mode, verifiedAt: new Date(), verificationDetail: detail, updatedAt: new Date() }
      : { verificationStatus: "gagal", verificationMode: mode, verifiedAt: null, verificationDetail: detail, updatedAt: new Date() }).where(eq(channelConnections.channelId, channelId));
    await writeAudit(tx, { ...auditFor(ctx), action: "integration.connection_verified", objectType: "channel", objectId: channelId, result: verified ? "success" : "failure", metadata: { mode, verified, problems } });
  });
  return { verified, mode, detail };
}
