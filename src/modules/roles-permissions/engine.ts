import { PERMISSION_META } from "./registry";

export type GrantInput = { permission: string; scopeAll: boolean; channelIds: string[] };
type Acc = { all: boolean; ids: Set<string> };

const add = (m: Map<string, Acc>, g: GrantInput) => {
  const a = m.get(g.permission) ?? { all: false, ids: new Set<string>() };
  if (g.scopeAll) a.all = true;
  for (const id of g.channelIds) a.ids.add(id);
  m.set(g.permission, a);
};

/**
 * Mesin keputusan izin — fungsi murni tanpa akses database.
 * Aturan (AGENTS.md §6.1): default MENOLAK; penolakan spesifik pengguna mengalahkan izin dari peran;
 * izin untuk aksi bercakupan channel hanya berlaku untuk channel yang tercakup.
 */
export class PermissionSet {
  private readonly allows = new Map<string, Acc>();
  private readonly denies = new Map<string, Acc>();

  constructor(readonly isSuperAdmin: boolean, allows: GrantInput[] = [], denies: GrantInput[] = []) {
    allows.forEach((g) => add(this.allows, g));
    denies.forEach((g) => add(this.denies, g));
  }

  /**
   * - Aksi global (tidak bercakupan channel): perlu izin 'semua' dan tidak ada penolakan.
   * - Aksi bercakupan channel TANPA channelId: berarti "di semua channel" → perlu izin 'semua' dan tidak ada penolakan sama sekali.
   * - Aksi bercakupan channel DENGAN channelId: channel itu harus tercakup dan tidak ditolak.
   */
  can(permission: string, channelId?: string): boolean {
    if (this.isSuperAdmin) return true;
    const meta = PERMISSION_META[permission];
    if (!meta) return false;
    const allow = this.allows.get(permission);
    if (!allow) return false;
    const deny = this.denies.get(permission);
    if (!meta.channelScoped || channelId === undefined) {
      return allow.all && !deny?.all && (deny?.ids.size ?? 0) === 0;
    }
    if (deny?.all || deny?.ids.has(channelId)) return false;
    return allow.all || allow.ids.has(channelId);
  }

  /** Apakah pengguna memiliki izin ini di setidaknya satu channel (untuk menampilkan menu). */
  canAny(permission: string): boolean {
    if (this.isSuperAdmin) return true;
    const meta = PERMISSION_META[permission];
    const allow = this.allows.get(permission);
    if (!meta || !allow) return false;
    if (!meta.channelScoped) return this.can(permission);
    const deny = this.denies.get(permission);
    if (deny?.all) return false;
    if (allow.all) return true;
    return [...allow.ids].some((id) => !deny?.ids.has(id));
  }

  /**
   * Apakah pengguna secara EKSPLISIT ditolak (penolakan spesifik pengguna) untuk izin ini pada channel itu?
   * Dipakai agar akses percakapan yang dialihkan antartim tidak mengalahkan penolakan per pengguna (kontrak inti #1).
   */
  deniesChannel(permission: string, channelId: string): boolean {
    if (this.isSuperAdmin) return false;
    const deny = this.denies.get(permission);
    return !!(deny?.all || deny?.ids.has(channelId));
  }

  /** Saring daftar channel menjadi yang boleh diakses untuk izin tertentu. */
  filterChannels<T extends { id: string }>(permission: string, channels: T[]): T[] {
    return channels.filter((c) => this.can(permission, c.id));
  }
}

/**
 * Anti-eskalasi: pemberi izin hanya boleh memberikan apa yang ia sendiri miliki (termasuk cakupannya).
 * Super Admin tidak dibatasi, kecuali izin yang hanya boleh diberikan oleh Super Admin.
 */
export function canDelegate(actor: PermissionSet, g: GrantInput): boolean {
  const meta = PERMISSION_META[g.permission];
  if (!meta) return false;
  if (meta.superAdminOnlyGrant) return actor.isSuperAdmin;
  if (actor.isSuperAdmin) return true;
  if (!meta.channelScoped || g.scopeAll) return actor.can(g.permission);
  return g.channelIds.every((id) => actor.can(g.permission, id));
}
