import { sql } from "drizzle-orm";
import {
  bigint, bigserial, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ───────────── Pengaturan organisasi (satu baris) ─────────────
export const orgSettings = pgTable(
  "org_settings",
  {
    id: integer("id").primaryKey().default(1),
    maxChannels: integer("max_channels").notNull().default(5),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (t) => [check("org_settings_singleton", sql`${t.id} = 1`), check("org_settings_max_channels", sql`${t.maxChannels} >= 1 AND ${t.maxChannels} <= 100`)],
);

// ───────────── Pengguna, peran, izin ─────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    totpRequired: boolean("totp_required").notNull().default(false),
    totpLastStep: bigint("totp_last_step", { mode: "number" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdBy: uuid("created_by"),
    disabledAt: ts("disabled_at"),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    check("users_status_check", sql`${t.status} IN ('active','disabled')`),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
    require2fa: boolean("require_2fa").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("roles_name_unique").on(sql`lower(${t.name})`)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by"),
    assignedAt: ts("assigned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

/** Izin yang diberikan ke peran (selalu 'allow'). `channelIds` hanya bermakna jika scope_all = false. */
export const roleGrants = pgTable(
  "role_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    scopeAll: boolean("scope_all").notNull().default(false),
    channelIds: uuid("channel_ids").array().notNull().default(sql`'{}'::uuid[]`),
  },
  (t) => [
    uniqueIndex("role_grants_unique").on(t.roleId, t.permission),
    check("role_grants_scope", sql`(${t.scopeAll} AND cardinality(${t.channelIds}) = 0) OR (NOT ${t.scopeAll} AND cardinality(${t.channelIds}) > 0)`),
  ],
);

/** Izin/penolakan spesifik per pengguna. Penolakan ('deny') mengalahkan izin dari peran. */
export const userGrants = pgTable(
  "user_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    effect: text("effect").notNull(),
    scopeAll: boolean("scope_all").notNull().default(false),
    channelIds: uuid("channel_ids").array().notNull().default(sql`'{}'::uuid[]`),
  },
  (t) => [
    uniqueIndex("user_grants_unique").on(t.userId, t.permission, t.effect),
    check("user_grants_effect", sql`${t.effect} IN ('allow','deny')`),
    check("user_grants_scope", sql`(${t.scopeAll} AND cardinality(${t.channelIds}) = 0) OR (NOT ${t.scopeAll} AND cardinality(${t.channelIds}) > 0)`),
  ],
);

// ───────────── Session & keamanan login ─────────────
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    totpVerifiedAt: ts("totp_verified_at"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: ts("used_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("recovery_codes_hash_unique").on(t.codeHash), index("recovery_codes_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    identifier: text("identifier").notNull(),
    ip: text("ip").notNull(),
    kind: text("kind").notNull(),
    success: boolean("success").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_ident_idx").on(t.identifier, t.createdAt), index("login_attempts_ip_idx").on(t.ip, t.createdAt)],
);

// ───────────── Tim ─────────────
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
    createdBy: uuid("created_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (t) => [uniqueIndex("teams_name_unique").on(sql`lower(${t.name})`)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

// ───────────── Channel ─────────────
export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    functionLabel: text("function_label").notNull(),
    description: text("description").notNull().default(""),
    integrationKind: text("integration_kind").notNull(),
    environment: text("environment").notNull(),
    // Hanya nilai di bawah yang sah. Sengaja TIDAK ada "terhubung" — lihat CCP 1.8.
    status: text("status").notNull().default("belum_dikonfigurasi"),
    isOperational: boolean("is_operational").notNull().default(false),
    isSample: boolean("is_sample").notNull().default(false),
    archivedAt: ts("archived_at"),
    archivedBy: uuid("archived_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    createdBy: uuid("created_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (t) => [
    uniqueIndex("channels_active_name_unique").on(sql`lower(${t.name})`).where(sql`${t.archivedAt} IS NULL`),
    check("channels_integration_kind", sql`${t.integrationKind} IN ('cloud_api_coexistence','cloud_api_only')`),
    check("channels_environment", sql`${t.environment} IN ('development','staging','production')`),
    check("channels_status", sql`${t.status} IN ('belum_dikonfigurasi','sedang_dikonfigurasi')`),
    // Penanda operasional hanya sah di lingkungan production dan tidak boleh berupa data contoh.
    check("channels_operational_rules", sql`NOT (${t.isOperational} AND (${t.environment} <> 'production' OR ${t.isSample}))`),
  ],
);

export const teamChannels = pgTable(
  "team_channels",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").notNull().references(() => channels.id),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.channelId] })],
);

// ───────────── Audit (append-only; lihat trigger di migrasi 0001) ─────────────
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    actorLabel: text("actor_label").notNull().default("sistem"),
    action: text("action").notNull(),
    objectType: text("object_type").notNull().default(""),
    objectId: text("object_id").notNull().default(""),
    result: text("result").notNull(),
    correlationId: text("correlation_id").notNull().default(""),
    ip: text("ip"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    check("audit_log_result", sql`${t.result} IN ('success','failure','denied')`),
    index("audit_log_time_idx").on(t.occurredAt),
    index("audit_log_action_idx").on(t.action),
    index("audit_log_actor_idx").on(t.actorUserId),
  ],
);

// ───────────── Feature flag & kill switch ─────────────
export const featureFlagOverrides = pgTable("feature_flag_overrides", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const killSwitches = pgTable(
  "kill_switches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: text("scope_type").notNull(),
    scopeRef: text("scope_ref").notNull().default(""),
    engaged: boolean("engaged").notNull().default(false),
    reason: text("reason").notNull().default(""),
    engagedBy: uuid("engaged_by"),
    engagedAt: ts("engaged_at"),
    releasedBy: uuid("released_by"),
    releasedAt: ts("released_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("kill_switches_scope_unique").on(t.scopeType, t.scopeRef),
    check("kill_switches_scope_type", sql`${t.scopeType} IN ('global','channel','feature','chat')`),
    check("kill_switches_global_ref", sql`(${t.scopeType} = 'global' AND ${t.scopeRef} = '') OR (${t.scopeType} <> 'global' AND ${t.scopeRef} <> '')`),
  ],
);
