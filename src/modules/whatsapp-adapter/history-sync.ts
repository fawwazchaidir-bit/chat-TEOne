/**
 * S-12 — pemicu sinkronisasi kontak & riwayat coexistence (SMB App Data API).
 *
 * Fakta resmi Meta (halaman *Onboarding WhatsApp Business app users*, dibaca 26 Nov 2026): setelah onboarding, partner hanya punya 24 JAM untuk
 * sinkronisasi kontak (Step 1, `sync_type="smb_app_state_sync"`) lalu riwayat (Step 2, `sync_type="history"`); tiap langkah HANYA SEKALI — mengulang
 * berarti offboarding + Embedded Signup ulang. Karena tidak dapat diulang, SEMUA penjagaan ditegakkan di SERVER dan database (bukan di UI):
 *  - baris `smb_sync_requests` dibuat DALAM TRANSAKSI (dengan kunci baris koneksi) SEBELUM Meta dipanggil; UNIQUE(channel, jenis, versi pemetaan);
 *  - timeout/jaringan/5xx = `belum_pasti`: TIDAK ada percobaan ulang otomatis; hanya penyelesaian manual teraudit yang dapat membuka kunci;
 *  - jendela 24 jam dihitung dengan jam DATABASE; waktu onboarding tidak diketahui → ditolak.
 * Setiap percobaan (diterima/gagal/ditolak) diaudit TANPA payload.
 */
import { and, eq, sql } from "drizzle-orm";
import { channelConnections, channels, inboundEvents, messages, smbSyncRequests } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { getEnv } from "@/lib/env";
import { AppError, badRequest, conflict, notFound } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import { getChannel } from "@/modules/channels/service";
import { isFeatureEnabled } from "@/modules/feature-flags";
import { checkAutomation } from "@/modules/kill-switch";
import type { Ctx } from "@/modules/shared/context";
import { isRealMetaEndpoint } from "./config";
import { isSmbSyncType, metaCallProblem, requestSmbSync, type SmbSyncType } from "./client";
import { HISTORY_DECLINED_LABEL, HISTORY_SHARING_DECLINED_CODE, classifySmbSyncResult } from "./errors";

export const HISTORY_SYNC_PERMISSION = "integration.history_sync";
export const SYNC_WINDOW_HOURS = 24;
/** Batas aman: permintaan ditolak bila sisa jendela < 30 menit (jam kerja Meta dan jam kita tidak identik; satu permintaan tidak dapat diulang). */
export const SYNC_MARGIN_MINUTES = 30;
/** Baris `diminta` lebih tua dari ini = proses terhenti di tengah panggilan → hasil tidak pasti; boleh diselesaikan manual. */
export const SYNC_STUCK_MINUTES = 5;
/** Isian jam onboarding dari perangkat admin boleh sedikit lebih maju dari jam database (selisih jam); lebih dari ini = salah isi. */
export const ONBOARDING_FUTURE_TOLERANCE_MINUTES = 2;

export const SYNC_TYPE_LABEL: Record<SmbSyncType, string> = { smb_app_state_sync: "Step 1 — sinkronisasi kontak", history: "Step 2 — sinkronisasi riwayat" };
export const SYNC_STATUS_LABEL: Record<string, string> = {
  diminta: "Sedang diminta (belum ada jawaban Meta)",
  diterima_meta: "Permintaan diterima Meta (hasil menyusul lewat webhook)",
  gagal: "Ditolak/gagal — Meta menjawab galat",
  belum_pasti: "BELUM PASTI — jawaban Meta tidak diterima; permintaan mungkin sudah diproses. Jangan diulang",
};

// ───────────── Prasyarat (murni; dipakai server DAN tampilan) ─────────────
export type SyncCheckKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";
/** `ok: null` = baru dapat diperiksa saat pengiriman (mis. konfirmasi admin). */
export type SyncCheck = { key: SyncCheckKey; ok: boolean | null; label: string; detail: string | null };

export type SyncFacts = {
  flagConnector: boolean;
  flagHistorySync: boolean;
  actor: { isSuperAdmin: boolean; totpEnabled: boolean; scoped: boolean };
  kill: { blocked: boolean; by?: string };
  conn: { verificationStatus: string; verificationMode: string | null; testMode: boolean; onboardedAt: Date | null };
  /** Sisa jendela (detik) menurut JAM DATABASE; null = waktu onboarding tidak diketahui. */
  remainingSec: number | null;
  channel: { isOperational: boolean; archived: boolean; integrationKind: string };
  realEndpoint: boolean;
  appEnv: string;
  tokenProblem: string | null;
  existing: { status: string; failureKind: string | null; resolution: string | null } | null;
  step1Accepted: boolean;
  confirm: { subscribed: boolean; once: boolean } | null;
};

/** Baris yang TERBUKTI tidak pernah sampai ke Meta (dibatalkan sebelum kirim) atau dinyatakan admin "tidak diproses" boleh dipakai ulang. */
export const isReusableRequest = (r: { status: string; failureKind: string | null; resolution: string | null } | null | undefined) =>
  !!r && r.status === "gagal" && (r.failureKind === "tidak_dikirim" || r.resolution === "tidak_diproses");

export const fmtRemaining = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)} j ${Math.floor((s % 3600) / 60)} m`;
};

export function evaluateSyncPrerequisites(syncType: SmbSyncType, f: SyncFacts): SyncCheck[] {
  const out: SyncCheck[] = [];
  const add = (key: SyncCheckKey, ok: boolean | null, label: string, detail: string | null = null) => out.push({ key, ok, label, detail });

  add("a", f.flagConnector && f.flagHistorySync, "Fitur menyala: flag whatsapp_connector dan history_sync",
    f.flagConnector && f.flagHistorySync ? null : `Flag mati: ${[!f.flagConnector && "whatsapp_connector", !f.flagHistorySync && "history_sync"].filter(Boolean).join(", ")}`);

  const actorOk = f.actor.isSuperAdmin && f.actor.totpEnabled && f.actor.scoped;
  add("b", actorOk, "Izin: Super Admin dengan sesi 2FA penuh + izin integration.history_sync pada channel ini",
    actorOk ? null : !f.actor.isSuperAdmin ? "Hanya Super Admin" : !f.actor.totpEnabled ? "2FA belum aktif" : "Tidak memiliki izin pada channel ini");

  add("c", !f.kill.blocked, "Kill switch global/channel tidak menyala", f.kill.blocked ? `Kill switch menyala (${f.kill.by ?? "tidak dapat diperiksa"})` : null);

  const expectedMode = f.realEndpoint ? "nyata" : "simulasi";
  const mapped = f.conn.verificationStatus === "terverifikasi" && f.conn.verificationMode === expectedMode;
  add("d", mapped, "Pemetaan nomor terverifikasi pada versi pemetaan saat ini (mode sama dengan endpoint yang dipanggil)",
    mapped ? (f.realEndpoint ? null : "SIMULASI — endpoint adalah mock, bukan Meta") : f.conn.verificationStatus !== "terverifikasi" ? "Pemetaan belum terverifikasi — jalankan Periksa koneksi" : `Terverifikasi pada mode ${f.conn.verificationMode ?? "?"}, endpoint sekarang ${f.realEndpoint ? "Meta asli" : "mock"}`);

  const marginSec = SYNC_MARGIN_MINUTES * 60;
  const windowOk = f.conn.onboardedAt !== null && f.remainingSec !== null && f.remainingSec >= marginSec;
  add("e", windowOk, `Dalam jendela ${SYNC_WINDOW_HOURS} jam sejak onboarding (berhenti ${SYNC_MARGIN_MINUTES} menit sebelum habis; jam database)`,
    f.conn.onboardedAt === null || f.remainingSec === null ? "Jam onboarding TIDAK DIKETAHUI — nyatakan jam onboarding (isian admin, bukan bukti Meta)" : windowOk ? `Sisa ${fmtRemaining(f.remainingSec)}` : f.remainingSec <= 0 ? "Jendela sudah habis" : `Sisa ${fmtRemaining(f.remainingSec)} — di bawah batas aman`);

  const reusable = isReusableRequest(f.existing);
  const notYet = !f.existing || reusable;
  add("f", notYet, "Belum pernah diminta untuk channel + jenis + versi pemetaan ini (hanya sekali)",
    !f.existing ? null : reusable ? "Percobaan sebelumnya terbukti tidak sampai ke Meta — boleh diulang sekali" : `Sudah ada permintaan: ${SYNC_STATUS_LABEL[f.existing.status] ?? f.existing.status}`);

  add("g", syncType === "history" ? f.step1Accepted : true, "Urutan resmi: Step 2 (riwayat) hanya setelah Step 1 (kontak) diterima Meta",
    syncType !== "history" ? "Tidak berlaku untuk Step 1" : f.step1Accepted ? null : "Step 1 belum berstatus 'diterima Meta'");

  const c = f.confirm;
  add("h", c === null ? null : c.subscribed && c.once, "Konfirmasi admin (teraudit): field history & smb_app_state_sync SUDAH di-subscribe di aplikasi TE One, dan paham permintaan ini hanya sekali",
    c === null ? "Diperiksa saat pengiriman" : c.subscribed && c.once ? null : "Konfirmasi belum dicentang lengkap");

  const operational = f.channel.isOperational;
  const testOk = f.appEnv === "production" || f.conn.testMode;
  add("i", !operational && testOk, "Channel bukan operasional (Admisi/Hotline: dilarang sebelum Tahap 9 + GO tertulis) dan, di non-production, mode uji aktif",
    operational ? "Channel bertanda operasional (AGENTS.md §3.1)" : !testOk ? "Di non-production mode uji WAJIB aktif" : null);

  const kindOk = f.channel.integrationKind === "cloud_api_coexistence" && !f.channel.archived && f.tokenProblem === null;
  add("j", kindOk, "Channel berjenis coexistence, tidak diarsipkan, dan token Meta tersedia",
    kindOk ? null : f.channel.archived ? "Channel diarsipkan" : f.channel.integrationKind !== "cloud_api_coexistence" ? "Bukan channel coexistence (SMB App Data API hanya untuk coexistence)" : `Konfigurasi Meta: ${f.tokenProblem}`);
  return out;
}

const failed = (checks: SyncCheck[]) => checks.filter((c) => c.ok === false);
/** Kode HTTP penolakan: flag mati → 404 (fitur seolah tidak ada), izin → 403, prasyarat lain → 409. */
export function rejectionFor(checks: SyncCheck[]): AppError {
  const f = failed(checks);
  const details = { failed: f.map((c) => ({ key: c.key, label: c.label, detail: c.detail })) };
  if (f.some((c) => c.key === "a")) return new AppError(404, "FEATURE_DISABLED", "Fitur ini belum tersedia.");
  if (f.some((c) => c.key === "b")) return new AppError(403, "FORBIDDEN", "Hanya Super Admin dengan sesi 2FA penuh dan izin sinkronisasi pada channel ini yang dapat memicu sinkronisasi.", details);
  return conflict("SYNC_PREREQUISITE_FAILED", "Prasyarat sinkronisasi belum terpenuhi — Meta TIDAK dipanggil.", details);
}

// ───────────── Pengumpulan fakta (jam DATABASE; kunci baris koneksi bila `lock`) ─────────────
async function loadFacts(ex: Executor, ctx: Ctx, channelId: string, syncType: SmbSyncType, confirm: SyncFacts["confirm"], lock: boolean) {
  const q = ex
    .select({ conn: channelConnections, ch: channels, remaining: sql<number | null>`extract(epoch from (${channelConnections.coexistenceOnboardedAt} + (${SYNC_WINDOW_HOURS} * interval '1 hour') - clock_timestamp()))::float8` })
    .from(channelConnections)
    .innerJoin(channels, eq(channels.id, channelConnections.channelId))
    .where(eq(channelConnections.channelId, channelId));
  const [row] = lock ? await q.for("update", { of: channelConnections }) : await q;
  if (!row) return null;
  const [existing] = await ex.select().from(smbSyncRequests).where(and(eq(smbSyncRequests.channelId, channelId), eq(smbSyncRequests.syncType, syncType), eq(smbSyncRequests.mappingVersion, row.conn.mappingVersion)));
  const [step1] = await ex.select({ id: smbSyncRequests.id }).from(smbSyncRequests).where(and(eq(smbSyncRequests.channelId, channelId), eq(smbSyncRequests.syncType, "smb_app_state_sync"), eq(smbSyncRequests.mappingVersion, row.conn.mappingVersion), eq(smbSyncRequests.status, "diterima_meta")));
  const [flagConnector, flagHistorySync] = await Promise.all([isFeatureEnabled("whatsapp_connector"), isFeatureEnabled("history_sync")]);
  const kill = await checkAutomation({ channelId }, ex);
  const facts: SyncFacts = {
    flagConnector, flagHistorySync,
    actor: { isSuperAdmin: ctx.user.isSuperAdmin, totpEnabled: ctx.user.totpEnabled && ctx.stage === "full", scoped: ctx.perms.can(HISTORY_SYNC_PERMISSION, channelId) },
    kill,
    conn: { verificationStatus: row.conn.verificationStatus, verificationMode: row.conn.verificationMode, testMode: row.conn.testMode, onboardedAt: row.conn.coexistenceOnboardedAt },
    remainingSec: row.conn.coexistenceOnboardedAt ? Number(row.remaining) : null,
    channel: { isOperational: row.ch.isOperational, archived: row.ch.archivedAt !== null, integrationKind: row.ch.integrationKind },
    realEndpoint: isRealMetaEndpoint(),
    appEnv: getEnv().APP_ENV,
    tokenProblem: metaCallProblem(),
    existing: existing ? { status: existing.status, failureKind: existing.failureKind, resolution: existing.resolution } : null,
    step1Accepted: !!step1,
    confirm,
  };
  return { facts, conn: row.conn, existing: existing ?? null };
}

/** Audit penolakan sebelum transaksi (channel di luar cakupan / tak ada) — tidak membocorkan keberadaan channel. */
async function auditDenied(ctx: Ctx, action: string, channelId: string, metadata: Record<string, unknown>) {
  await writeAudit(getDb(), { ...auditFor(ctx), action, objectType: "channel", objectId: channelId, result: "denied", metadata });
}
async function channelOrDeny(ctx: Ctx, channelId: string, action: string, metadata: Record<string, unknown>) {
  try {
    return await getChannel(ctx, channelId);
  } catch (e) {
    await auditDenied(ctx, action, channelId, { ...metadata, alasan: "channel_di_luar_cakupan_atau_tidak_ada" });
    throw e;
  }
}

// ───────────── Menyatakan jam onboarding ─────────────
/**
 * Jam onboarding = isian ADMIN ("dinyatakan admin"), bukan bukti Meta: webhook `account_update` yang dibaca (26 Nov 2026) tidak memuat waktu onboarding.
 * Setelah ada permintaan untuk pemetaan ini, jam tidak boleh diubah (mencegah memperpanjang jendela). Onboarding ulang (offboarding + Embedded Signup
 * lagi) dinyatakan dengan `reonboarded: true`: harus SESUDAH permintaan terakhir, menaikkan versi pemetaan (verifikasi harus diulang) dan membuka satu
 * siklus sinkronisasi baru.
 */
export async function declareOnboarding(ctx: Ctx, channelId: string, input: { onboardedAt: string; reonboarded?: boolean }) {
  const auditAction = "integration.onboarding_declared";
  await channelOrDeny(ctx, channelId, auditAction, {});
  const at = new Date(input.onboardedAt);
  if (Number.isNaN(at.getTime())) throw badRequest("Waktu onboarding tidak valid.", undefined, "VALIDATION_ERROR");
  const res = await getDb().transaction(async (tx) => {
    const facts = await loadFacts(tx, ctx, channelId, "smb_app_state_sync", null, true);
    if (!facts) return { error: notFound("Koneksi channel belum dikonfigurasi.") };
    const must = evaluateSyncPrerequisites("smb_app_state_sync", facts.facts).filter((c) => ["a", "b", "i", "j"].includes(c.key));
    const bad = failed(must);
    const fail = async (err: AppError, reason: string) => {
      await writeAudit(tx, { ...auditFor(ctx), action: auditAction, objectType: "channel", objectId: channelId, result: "denied", metadata: { alasan: reason, gagal: bad.map((c) => c.key) } });
      return { error: err };
    };
    if (bad.length) return fail(rejectionFor(must), "prasyarat");
    const futureRes = await tx.execute(sql`select (${at.toISOString()}::timestamptz > clock_timestamp() + (${ONBOARDING_FUTURE_TOLERANCE_MINUTES} * interval '1 minute')) as future`);
    const future = (futureRes.rows as { future: boolean }[])[0]?.future === true;
    if (future) return fail(badRequest("Waktu onboarding tidak boleh di masa depan (jam server).", undefined, "VALIDATION_ERROR"), "di_masa_depan");
    const prior = await tx.select({ requestedAt: smbSyncRequests.requestedAt }).from(smbSyncRequests).where(and(eq(smbSyncRequests.channelId, channelId), eq(smbSyncRequests.mappingVersion, facts.conn.mappingVersion)));
    const reonboard = input.reonboarded === true;
    if (prior.length > 0 && !reonboard) return fail(conflict("SYNC_ALREADY_REQUESTED", "Sudah ada permintaan sinkronisasi untuk pemetaan ini; jam onboarding tidak dapat diubah. Bila nomor di-onboard ULANG, nyatakan onboarding ulang."), "sudah_ada_permintaan");
    if (reonboard) {
      if (prior.length === 0) return fail(badRequest("Onboarding ulang hanya berlaku setelah ada permintaan sinkronisasi sebelumnya.", undefined, "VALIDATION_ERROR"), "tidak_ada_permintaan_sebelumnya");
      const last = Math.max(...prior.map((p) => p.requestedAt.getTime()));
      if (at.getTime() <= last) return fail(badRequest("Onboarding ulang harus SESUDAH permintaan sinkronisasi terakhir.", undefined, "VALIDATION_ERROR"), "tidak_setelah_permintaan_terakhir");
    }
    const base = { coexistenceOnboardedAt: at, coexistenceOnboardedSource: "dinyatakan_admin", coexistenceOnboardedBy: ctx.user.id, updatedAt: new Date(), updatedBy: ctx.user.id };
    await tx.update(channelConnections).set(reonboard
      ? { ...base, mappingVersion: sql`${channelConnections.mappingVersion} + 1`, mappingChangedAt: new Date(), verificationStatus: "belum_diperiksa", verificationMode: null, verifiedAt: null, verificationDetail: {}, historyProgress: {} }
      : base).where(eq(channelConnections.channelId, channelId));
    await writeAudit(tx, { ...auditFor(ctx), action: auditAction, objectType: "channel", objectId: channelId, metadata: { onboardedAt: at.toISOString(), sumber: "dinyatakan_admin", onboardingUlang: reonboard } });
    return { ok: true as const };
  });
  if ("error" in res && res.error) throw res.error;
  return { ok: true, source: "dinyatakan_admin" as const };
}

// ───────────── Meminta sinkronisasi ─────────────
/** Kait KHUSUS UJI (diabaikan di production): dijalankan setelah baris permintaan dipesan dan SEBELUM pemeriksaan ulang kill switch + panggilan Meta. */
export const syncTestHooks: { afterReserve?: () => Promise<void> } = {};
export type SyncRequestResult = { syncType: SmbSyncType; status: "diterima_meta" | "gagal" | "belum_pasti"; label: string; httpStatus: number | null; metaCode: number | null };

export async function requestHistorySync(ctx: Ctx, channelId: string, input: { syncType: string; confirmSubscribed: boolean; confirmOnce: boolean }): Promise<SyncRequestResult> {
  const action = "integration.history_sync_requested";
  const syncType = input.syncType;
  if (!isSmbSyncType(syncType)) throw badRequest("Jenis sinkronisasi tidak dikenal.", undefined, "VALIDATION_ERROR");
  await channelOrDeny(ctx, channelId, action, { syncType });

  // 1) Transaksi: kunci baris koneksi → periksa SEMUA prasyarat (jam database) → buat/pakai-ulang baris permintaan. Meta belum dipanggil.
  const tx1 = await getDb().transaction(async (tx) => {
    const loaded = await loadFacts(tx, ctx, channelId, syncType, { subscribed: input.confirmSubscribed === true, once: input.confirmOnce === true }, true);
    if (!loaded) {
      await writeAudit(tx, { ...auditFor(ctx), action, objectType: "channel", objectId: channelId, result: "denied", metadata: { syncType, alasan: "koneksi_belum_dikonfigurasi" } });
      return { error: notFound("Koneksi channel belum dikonfigurasi.") };
    }
    const checks = evaluateSyncPrerequisites(syncType, loaded.facts);
    const bad = failed(checks);
    if (bad.length) {
      await writeAudit(tx, { ...auditFor(ctx), action, objectType: "channel", objectId: channelId, result: "denied", metadata: { syncType, mappingVersion: loaded.conn.mappingVersion, gagal: bad.map((c) => c.key) } });
      return { error: rejectionFor(checks) };
    }
    const now = sql`clock_timestamp()`;
    let row: { id: string; attempts: number } | undefined;
    if (loaded.existing) {
      // Lolos (f) hanya bila baris dapat dipakai ulang (terbukti tidak sampai ke Meta / dinyatakan "tidak diproses").
      [row] = await tx.update(smbSyncRequests).set({ status: "diminta", requestedBy: ctx.user.id, requestedAt: now, attempts: sql`${smbSyncRequests.attempts} + 1`, completedAt: null, httpStatus: null, metaCode: null, metaSubcode: null, failureKind: null, metaRequestId: null, resolution: null })
        .where(and(eq(smbSyncRequests.id, loaded.existing.id), eq(smbSyncRequests.status, "gagal"))).returning({ id: smbSyncRequests.id, attempts: smbSyncRequests.attempts });
    } else {
      [row] = await tx.insert(smbSyncRequests).values({ channelId, syncType, mappingVersion: loaded.conn.mappingVersion, status: "diminta", requestedBy: ctx.user.id, requestedAt: now })
        .onConflictDoNothing().returning({ id: smbSyncRequests.id, attempts: smbSyncRequests.attempts });
    }
    if (!row) {
      await writeAudit(tx, { ...auditFor(ctx), action, objectType: "channel", objectId: channelId, result: "denied", metadata: { syncType, mappingVersion: loaded.conn.mappingVersion, gagal: ["f"] } });
      return { error: conflict("SYNC_PREREQUISITE_FAILED", "Sudah ada permintaan untuk jenis ini — Meta TIDAK dipanggil.", { failed: [{ key: "f", label: "Hanya sekali", detail: null }] }) };
    }
    return { rowId: row.id, attempts: row.attempts, phoneNumberId: loaded.conn.phoneNumberId, mappingVersion: loaded.conn.mappingVersion };
  });
  if ("error" in tx1 && tx1.error) throw tx1.error;
  const run = tx1 as { rowId: string; attempts: number; phoneNumberId: string; mappingVersion: number };

  if (syncTestHooks.afterReserve && getEnv().APP_ENV !== "production") await syncTestHooks.afterReserve();

  // 2) Pemeriksaan ulang kill switch TEPAT sebelum memanggil Meta (kontrak inti #7). Bila menyala → batal; baris ditandai "tidak dikirim" (boleh dipakai ulang).
  const kill = await checkAutomation({ channelId });
  if (kill.blocked) {
    await getDb().transaction(async (tx) => {
      await tx.update(smbSyncRequests).set({ status: "gagal", failureKind: "tidak_dikirim", completedAt: sql`clock_timestamp()` }).where(and(eq(smbSyncRequests.id, run.rowId), eq(smbSyncRequests.status, "diminta")));
      await writeAudit(tx, { ...auditFor(ctx), action, objectType: "channel", objectId: channelId, result: "denied", metadata: { syncType, mappingVersion: run.mappingVersion, gagal: ["c"], alasan: "kill_switch_sebelum_kirim" } });
    });
    throw conflict("SYNC_PREREQUISITE_FAILED", "Kill switch menyala — Meta TIDAK dipanggil.", { failed: [{ key: "c", label: "Kill switch", detail: `Kill switch menyala (${kill.by})` }] });
  }

  // 3) SATU panggilan ke Meta. Tidak ada percobaan ulang.
  const res = classifySmbSyncResult(await requestSmbSync(run.phoneNumberId, syncType));

  // 4) Catat hasil + audit (tanpa payload). Bila penulisan ini gagal, baris tetap `diminta` → tampil sebagai "belum pasti" dan dapat diselesaikan manual.
  await getDb().transaction(async (tx) => {
    await tx.update(smbSyncRequests).set({
      status: res.status, completedAt: sql`clock_timestamp()`,
      httpStatus: res.status === "diterima_meta" ? 200 : res.httpStatus, metaCode: res.status === "diterima_meta" ? null : res.metaCode, metaSubcode: res.status === "diterima_meta" ? null : res.metaSubcode,
      failureKind: res.status === "diterima_meta" ? null : res.failureKind, metaRequestId: res.status === "diterima_meta" ? res.requestId : null,
    }).where(and(eq(smbSyncRequests.id, run.rowId), eq(smbSyncRequests.status, "diminta")));
    await writeAudit(tx, {
      ...auditFor(ctx), action, objectType: "channel", objectId: channelId, result: res.status === "diterima_meta" ? "success" : "failure",
      metadata: { syncType, mappingVersion: run.mappingVersion, hasil: res.status, percobaanKe: run.attempts, konfirmasiSubscribe: true, ...(res.status === "diterima_meta" ? {} : { jenisGalat: res.failureKind, httpStatus: res.httpStatus, kodeMeta: res.metaCode }) },
    });
  });
  return res.status === "diterima_meta"
    ? { syncType, status: res.status, label: SYNC_STATUS_LABEL.diterima_meta as string, httpStatus: 200, metaCode: null }
    : { syncType, status: res.status, label: res.label, httpStatus: res.httpStatus, metaCode: res.metaCode };
}

// ───────────── Penyelesaian manual (teraudit) ─────────────
/**
 * Hasil `belum_pasti`/`gagal`/`diminta`-macet tidak dapat dipastikan oleh sistem. Admin menyatakan, berdasarkan bukti di luar sistem (mis. webhook
 * kontak/riwayat sudah tiba, atau jawaban dukungan Meta), bahwa Meta (a) MENERIMA → status `diterima_meta`; atau (b) TIDAK memproses → baris boleh dipakai
 * ulang SEKALI. Catatan alasan wajib. Tidak pernah otomatis.
 */
export async function resolveSyncRequest(ctx: Ctx, channelId: string, input: { syncType: string; outcome: string; note: string }) {
  const action = "integration.history_sync_resolved";
  if (!isSmbSyncType(input.syncType)) throw badRequest("Jenis sinkronisasi tidak dikenal.", undefined, "VALIDATION_ERROR");
  if (input.outcome !== "diterima" && input.outcome !== "tidak_diproses") throw badRequest("Hasil penyelesaian tidak dikenal.", undefined, "VALIDATION_ERROR");
  const note = input.note.trim();
  if (note.length < 10 || note.length > 500) throw badRequest("Catatan alasan wajib diisi (10–500 karakter).", undefined, "VALIDATION_ERROR");
  const syncType = input.syncType;
  await channelOrDeny(ctx, channelId, action, { syncType });
  const res = await getDb().transaction(async (tx) => {
    const loaded = await loadFacts(tx, ctx, channelId, syncType, null, true);
    if (!loaded) return { error: notFound("Koneksi channel belum dikonfigurasi.") };
    const must = evaluateSyncPrerequisites(syncType, loaded.facts).filter((c) => ["a", "b"].includes(c.key));
    if (failed(must).length) {
      await writeAudit(tx, { ...auditFor(ctx), action, objectType: "channel", objectId: channelId, result: "denied", metadata: { syncType, gagal: failed(must).map((c) => c.key) } });
      return { error: rejectionFor(must) };
    }
    const [r] = await tx.select({ row: smbSyncRequests, stuck: sql<boolean>`${smbSyncRequests.requestedAt} < clock_timestamp() - (${SYNC_STUCK_MINUTES} * interval '1 minute')` }).from(smbSyncRequests)
      .where(and(eq(smbSyncRequests.channelId, channelId), eq(smbSyncRequests.syncType, syncType), eq(smbSyncRequests.mappingVersion, loaded.conn.mappingVersion)));
    const denied = async (err: AppError, alasan: string) => {
      await writeAudit(tx, { ...auditFor(ctx), action, objectType: "channel", objectId: channelId, result: "denied", metadata: { syncType, alasan } });
      return { error: err };
    };
    if (!r) return denied(notFound("Belum ada permintaan untuk jenis ini."), "tidak_ada_permintaan");
    const st = r.row.status;
    const resolvable = st === "belum_pasti" || st === "gagal" || (st === "diminta" && r.stuck);
    if (!resolvable) return denied(conflict("SYNC_NOT_RESOLVABLE", st === "diminta" ? "Permintaan masih berjalan (belum melewati batas waktu)." : "Permintaan sudah diterima Meta; tidak perlu diselesaikan."), "tidak_dapat_diselesaikan");
    const accepted = input.outcome === "diterima";
    await tx.update(smbSyncRequests).set({
      status: accepted ? "diterima_meta" : "gagal", resolution: accepted ? "diterima" : "tidak_diproses", resolvedBy: ctx.user.id, resolvedAt: sql`clock_timestamp()`, resolutionNote: note,
      completedAt: r.row.completedAt ?? sql`clock_timestamp()`,
    }).where(eq(smbSyncRequests.id, r.row.id));
    await writeAudit(tx, { ...auditFor(ctx), action, objectType: "channel", objectId: channelId, metadata: { syncType, mappingVersion: loaded.conn.mappingVersion, dari: st, hasil: input.outcome, catatan: note } });
    return { ok: true as const };
  });
  if ("error" in res && res.error) throw res.error;
  return { ok: true };
}

// ───────────── Tampilan (jujur: tanpa label "berhasil" tanpa respons Meta) ─────────────
export type HistoryProgress = {
  phase: number | null; chunk: number | null; progress: number | null; errorCode: number | null; errorTitle: string | null;
  declined: boolean; complete: boolean; phasesSeen: number[]; updatedAt: string | null;
};

/** Penggabungan progres history (murni). Potongan tiba TIDAK berurutan: progres tidak boleh turun, fase = fase terjauh yang pernah tiba. */
export function mergeHistoryProgress(prevRaw: unknown, e: { phase: number | null; chunk: number | null; progress: number | null; errorCode: number | null; errorTitle: string | null }, nowIso: string): HistoryProgress {
  const p = (typeof prevRaw === "object" && prevRaw !== null ? prevRaw : {}) as Partial<HistoryProgress>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const prevProgress = num(p.progress);
  const progress = e.progress === null ? prevProgress : Math.max(prevProgress ?? 0, clamp(e.progress));
  const declined = p.declined === true || e.errorCode === HISTORY_SHARING_DECLINED_CODE;
  const phases = new Set<number>((Array.isArray(p.phasesSeen) ? p.phasesSeen : []).filter((x): x is number => typeof x === "number"));
  if (e.phase !== null && [0, 1, 2].includes(e.phase)) phases.add(e.phase);
  return {
    phase: phases.size ? Math.max(...phases) : null,
    chunk: e.chunk ?? num(p.chunk),
    progress,
    errorCode: e.errorCode ?? num(p.errorCode),
    errorTitle: e.errorTitle ?? (typeof p.errorTitle === "string" ? p.errorTitle : null),
    declined,
    complete: !declined && progress === 100,
    phasesSeen: [...phases].sort(),
    updatedAt: nowIso,
  };
}

export async function getHistorySyncView(ctx: Ctx, channelId: string) {
  const ch = await getChannel(ctx, channelId);
  const [flagConnector, flagHistorySync] = await Promise.all([isFeatureEnabled("whatsapp_connector"), isFeatureEnabled("history_sync")]);
  if (!flagConnector || !flagHistorySync) return { available: false as const };
  const db = getDb();
  const loaded = await loadFacts(db, ctx, channelId, "smb_app_state_sync", null, false);
  if (!loaded) return { available: true as const, configured: false as const, channelName: ch.name };
  const { facts, conn } = loaded;
  const checksFor = async (t: SmbSyncType) => (t === "smb_app_state_sync" ? evaluateSyncPrerequisites(t, facts) : evaluateSyncPrerequisites(t, (await loadFacts(db, ctx, channelId, t, null, false))!.facts));
  const rows = await db.select({ row: smbSyncRequests, stuck: sql<boolean>`${smbSyncRequests.requestedAt} < clock_timestamp() - (${SYNC_STUCK_MINUTES} * interval '1 minute')` }).from(smbSyncRequests)
    .where(and(eq(smbSyncRequests.channelId, channelId), eq(smbSyncRequests.mappingVersion, conn.mappingVersion)));
  const [c1] = await db.select({ n: sql<number>`count(*)::int` }).from(inboundEvents).where(and(eq(inboundEvents.channelId, channelId), eq(inboundEvents.kind, "contact_sync"), eq(inboundEvents.status, "processed")));
  const [c2] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.channelId, channelId), eq(messages.isHistory, true)));
  const prog = mergeHistoryProgress(conn.historyProgress, { phase: null, chunk: null, progress: null, errorCode: null, errorTitle: null }, "");
  return {
    available: true as const, configured: true as const, channelName: ch.name, realEndpoint: facts.realEndpoint,
    onboarding: { at: conn.coexistenceOnboardedAt?.toISOString() ?? null, source: conn.coexistenceOnboardedSource, remainingSec: facts.remainingSec, label: conn.coexistenceOnboardedAt ? "Dinyatakan admin (bukan bukti Meta)" : "Tidak diketahui" },
    requests: rows.map(({ row, stuck }) => ({
      syncType: row.syncType as SmbSyncType, status: row.status, stuck: row.status === "diminta" && stuck,
      label: row.status === "diminta" && stuck ? "Proses terhenti sebelum jawaban Meta tercatat — hasil BELUM PASTI" : (SYNC_STATUS_LABEL[row.status] ?? row.status),
      requestedAt: row.requestedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, attempts: row.attempts,
      httpStatus: row.httpStatus, metaCode: row.metaCode, failureKind: row.failureKind, resolution: row.resolution, hasRequestId: row.metaRequestId !== null,
    })),
    checks: { smb_app_state_sync: await checksFor("smb_app_state_sync"), history: await checksFor("history") },
    progress: { ...prog, updatedAt: ((conn.historyProgress ?? {}) as { updatedAt?: string }).updatedAt ?? null, label: prog.declined ? HISTORY_DECLINED_LABEL : null },
    stats: { contactEvents: c1?.n ?? 0, historyMessages: c2?.n ?? 0 },
    canAct: facts.actor.isSuperAdmin && facts.actor.totpEnabled && facts.actor.scoped,
  };
}
