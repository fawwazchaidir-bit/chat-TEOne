import type { PermissionSet } from "@/modules/roles-permissions/engine";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  totpRequired: boolean;
  /** Apakah akun ini wajib memakai 2FA (Super Admin, diwajibkan per pengguna, atau per peran). */
  requires2fa: boolean;
};

export type SessionStage = "totp_required" | "totp_setup_required" | "password_change_required" | "full";

/** Konteks untuk sesi yang valid tetapi belum tentu lengkap (mis. belum lolos 2FA). Tidak memuat izin. */
export type SessionCtx = {
  user: AuthUser;
  sessionTokenHash: string;
  csrfToken: string;
  stage: SessionStage;
  correlationId: string;
  ip: string | null;
  userAgent: string | null;
};

/** Konteks sesi lengkap — satu-satunya yang boleh memanggil layanan berizin. */
export type Ctx = SessionCtx & { stage: "full"; perms: PermissionSet };
