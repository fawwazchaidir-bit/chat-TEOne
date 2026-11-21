import { and, eq, or } from "drizzle-orm";
import { killSwitches } from "@/db/schema";
import { getDb, type Executor } from "@/db/client";
import { badRequest, forbidden } from "@/lib/errors";
import { auditFor, writeAudit } from "@/modules/audit";
import type { Ctx } from "@/modules/shared/context";

/** Fitur otomatisasi yang dapat dihentikan. Daftar ini bertambah seiring tahap; di Tahap 1 hanya fungsi contoh yang nyata. */
export const AUTOMATION_FEATURES = [
  { key: "ai_reply", label: "Balasan AI (Tahap 4)" },
  { key: "follow_up", label: "Follow-up otomatis (Tahap 6)" },
  { key: "template_send", label: "Kirim template otomatis (Tahap 6)" },
  { key: "auto_label", label: "Label otomatis (Tahap 5)" },
  { key: "sample_automation", label: "Otomatisasi contoh (khusus uji mekanisme)" },
] as const;
const FEATURE_KEYS = new Set<string>(AUTOMATION_FEATURES.map((f) => f.key));

export type KillScope = { type: "global" } | { type: "channel" | "feature" | "chat"; ref: string };

const refOf = (s: KillScope) => (s.type === "global" ? "" : s.ref);

export type AutomationTarget = { channelId?: string; feature?: string; chatId?: string };
export type KillCheck = { blocked: false } | { blocked: true; by: string };

/**
 * Pemeriksaan kill switch — WAJIB dipanggil tepat sebelum setiap pengiriman otomatis (AGENTS.md §6.6–6.7).
 * - Tanpa cache: perubahan berlaku pada pemeriksaan berikutnya (jauh < 1 menit, CCP 3.6/8.2).
 * - Fail-closed: jika status tidak dapat dibaca, otomatisasi DIBLOKIR.
 */
export async function checkAutomation(target: AutomationTarget, ex: Executor = getDb()): Promise<KillCheck> {
  try {
    const clauses = [eq(killSwitches.scopeType, "global")];
    const scoped = [
      ["channel", target.channelId], ["feature", target.feature], ["chat", target.chatId],
    ] as const;
    for (const [type, ref] of scoped) if (ref) clauses.push(and(eq(killSwitches.scopeType, type), eq(killSwitches.scopeRef, ref))!);
    const rows = await ex.select().from(killSwitches).where(and(eq(killSwitches.engaged, true), or(...clauses)));
    const hit = rows[0];
    return hit ? { blocked: true, by: hit.scopeType === "global" ? "global" : `${hit.scopeType}:${hit.scopeRef}` } : { blocked: false };
  } catch {
    return { blocked: true, by: "pemeriksaan_gagal" };
  }
}

/**
 * Fungsi contoh (Tahap 1): membungkus aksi otomatis dengan pemeriksaan kill switch di saat terakhir.
 * Tahap berikutnya memakai pola yang sama untuk pengiriman nyata.
 */
export async function guardedAutomation<T>(target: AutomationTarget, action: () => Promise<T>): Promise<{ executed: true; result: T } | { executed: false; blockedBy: string }> {
  const check = await checkAutomation(target);
  if (check.blocked) return { executed: false, blockedBy: check.by };
  return { executed: true, result: await action() };
}

export async function listKillSwitches(ctx: Ctx) {
  if (!ctx.perms.can("killswitch.manage")) throw forbidden();
  return getDb().select().from(killSwitches).orderBy(killSwitches.scopeType, killSwitches.scopeRef);
}

/**
 * Satu-satunya jalur yang mengubah status kill switch. Tidak ada kedaluwarsa, penjadwal, atau pemulihan otomatis:
 * kill switch yang menyala TIDAK PERNAH menyala kembali (melepas) sendiri — harus tindakan manusia yang teraudit.
 */
async function applyKillSwitch(ctx: Ctx, scope: KillScope, engaged: boolean, reason: string) {
  if (scope.type === "feature" && !FEATURE_KEYS.has(scope.ref)) throw badRequest("Fitur otomatisasi tidak dikenal.", undefined, "UNKNOWN_FEATURE");
  if (engaged && !reason.trim()) throw badRequest("Alasan wajib diisi saat mengaktifkan kill switch.", undefined, "REASON_REQUIRED");
  const ref = refOf(scope);
  const now = new Date();
  await getDb().transaction(async (tx) => {
    const values = engaged
      ? { engaged: true, reason: reason.trim(), engagedBy: ctx.user.id, engagedAt: now, updatedAt: now }
      : { engaged: false, releasedBy: ctx.user.id, releasedAt: now, updatedAt: now };
    await tx.insert(killSwitches).values({ scopeType: scope.type, scopeRef: ref, ...values }).onConflictDoUpdate({ target: [killSwitches.scopeType, killSwitches.scopeRef], set: values });
    await writeAudit(tx, { ...auditFor(ctx), action: engaged ? "kill_switch.engaged" : "kill_switch.released", objectType: "kill_switch", objectId: `${scope.type}:${ref}`, metadata: { reason: reason.trim() } });
  });
}

export async function setKillSwitch(ctx: Ctx, scope: KillScope, engaged: boolean, reason: string) {
  if (!ctx.perms.can("killswitch.manage")) throw forbidden();
  await applyKillSwitch(ctx, scope, engaged, reason);
}

/**
 * "Jeda otomatisasi channel" (Tahap 3): menghentikan SEMUA pengiriman otomatis pada satu channel. Izin `killswitch.channel` pada channel itu
 * (cakupan channel) atau `killswitch.manage`. Berlaku untuk pemeriksaan berikutnya (tanpa cache); tidak pernah melepas sendiri.
 */
export async function setChannelKillSwitch(ctx: Ctx, channelId: string, engaged: boolean, reason: string) {
  if (!ctx.perms.can("killswitch.channel", channelId) && !ctx.perms.can("killswitch.manage")) throw forbidden();
  await applyKillSwitch(ctx, { type: "channel", ref: channelId }, engaged, reason);
}

/** Status yang tampil di UI inbox (global, channel yang terlihat, fitur). Tanpa cache; hanya yang MENYALA. */
export async function getEngagedKillSwitches(channelIds: string[]) {
  const rows = await getDb().select().from(killSwitches).where(eq(killSwitches.engaged, true));
  const set = new Set(channelIds);
  return rows
    .filter((r) => r.scopeType === "global" || r.scopeType === "feature" || (r.scopeType === "channel" && set.has(r.scopeRef)))
    .map((r) => ({ scopeType: r.scopeType, scopeRef: r.scopeRef, reason: r.reason, engagedAt: r.engagedAt?.toISOString() ?? null }));
}
