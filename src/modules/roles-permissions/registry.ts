/**
 * Registri izin. Izin = AKSI + CAKUPAN. `channelScoped` menentukan apakah izin dapat dibatasi ke channel tertentu.
 * `available: false` → fiturnya belum dibuat; UI wajib menandai "Belum tersedia" (AGENTS.md §4).
 */
export const PERMISSIONS = [
  { key: "user.manage", label: "Kelola pengguna", channelScoped: false, available: true },
  { key: "role.manage", label: "Kelola peran & izin", channelScoped: false, available: true },
  { key: "team.manage", label: "Kelola tim", channelScoped: false, available: true },
  { key: "channel.view", label: "Lihat channel", channelScoped: true, available: true },
  { key: "channel.manage", label: "Kelola channel", channelScoped: true, available: true },
  { key: "chat.view", label: "Lihat chat", channelScoped: true, available: false },
  { key: "chat.reply", label: "Balas chat", channelScoped: true, available: false },
  { key: "ai.toggle", label: "Ubah AI On/Off", channelScoped: true, available: false },
  { key: "chat.transfer", label: "Alihkan chat", channelScoped: true, available: false },
  { key: "quickreply.manage", label: "Kelola balasan cepat", channelScoped: true, available: false },
  { key: "agent.manage", label: "Kelola agent", channelScoped: true, available: false },
  { key: "knowledge.manage", label: "Kelola Kartu Program & knowledge", channelScoped: true, available: false },
  { key: "label.manage", label: "Kelola label & aturan", channelScoped: true, available: false },
  { key: "pipeline.manage", label: "Kelola pipeline", channelScoped: true, available: false },
  { key: "template_followup.manage", label: "Kelola template & follow-up", channelScoped: true, available: false },
  { key: "report.view", label: "Lihat laporan", channelScoped: true, available: false },
  { key: "data.export", label: "Ekspor data", channelScoped: true, available: false },
  { key: "audit.view", label: "Lihat audit", channelScoped: false, available: true },
  // Tahap 2 (ADR-0004): alat uji integrasi WhatsApp — izin khusus, bercakupan channel.
  { key: "integration.test", label: "Alat uji integrasi WhatsApp", channelScoped: true, available: true },
  // Hanya Super Admin yang dapat memberikan izin ini (UI kill switch khusus Super Admin — Tahap 1 §12).
  { key: "killswitch.manage", label: "Kelola kill switch", channelScoped: false, available: true, superAdminOnlyGrant: true },
] as const satisfies readonly PermissionMeta[];

export type PermissionMeta = {
  key: string;
  label: string;
  channelScoped: boolean;
  available: boolean;
  superAdminOnlyGrant?: boolean;
};
export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_META: Record<string, PermissionMeta> = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p]));
export const isPermissionKey = (k: string): k is PermissionKey => k in PERMISSION_META;

/** Peran awal (contoh, dapat diubah Super Admin). Super Admin adalah penanda khusus pada pengguna, bukan peran biasa. */
export const DEFAULT_ROLES: { name: string; description: string; function?: string; grants: { permission: PermissionKey; scope: "all" | "function" }[] }[] = [
  {
    name: "Manajer",
    description: "Melihat seluruh channel, pengguna, tim, dan audit; tanpa hak mengubah izin.",
    grants: [
      { permission: "channel.view", scope: "all" }, { permission: "chat.view", scope: "all" }, { permission: "report.view", scope: "all" },
      { permission: "audit.view", scope: "all" }, { permission: "user.manage", scope: "all" }, { permission: "team.manage", scope: "all" },
    ],
  },
  ...(["Admisi", "Hotline", "Kemitraan"] as const).map((fn) => ({
    name: `Admin ${fn}`,
    description: `Menangani channel ${fn} saja.`,
    function: fn,
    grants: (["channel.view", "chat.view", "chat.reply", "ai.toggle", "chat.transfer", "quickreply.manage", "label.manage", "pipeline.manage"] as PermissionKey[]).map(
      (permission) => ({ permission, scope: "function" as const }),
    ),
  })),
];
