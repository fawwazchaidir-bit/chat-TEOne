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

// ═════════════════════════ TAHAP 2 — Konektor WhatsApp (ADR-0002, ADR-0003, ADR-0004) ═════════════════════════
// Seluruh fitur di balik feature flag `whatsapp_connector` (default mati).

// ───────────── Kontak & identitas (identitas dari provider, BUKAN nomor tampil) ─────────────
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Pengenal opak yang stabil untuk integrasi masa depan (Internal Portal / Training & Operations). Bukan nomor telepon. */
    publicRef: uuid("public_ref").notNull().defaultRandom(),
    displayName: text("display_name"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contacts_public_ref_unique").on(t.publicRef)],
);

export const contactIdentities = pgTable(
  "contact_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("whatsapp"),
    identityType: text("identity_type").notNull(),
    identityValue: text("identity_value").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contact_identities_unique").on(t.provider, t.identityType, t.identityValue), index("contact_identities_contact_idx").on(t.contactId)],
);

// ───────────── Koneksi channel ↔ Meta (pemetaan WABA ↔ phone_number_id ↔ channel) ─────────────
export const channelConnections = pgTable(
  "channel_connections",
  {
    channelId: uuid("channel_id").primaryKey().references(() => channels.id),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    /** Mode uji: pesan keluar hanya ke daftar penerima uji; pengirim di luar daftar tidak diproses (D-03). */
    testMode: boolean("test_mode").notNull().default(true),
    rateLimitPerSec: integer("rate_limit_per_sec").notNull().default(5),
    /** Naik setiap pemetaan (WABA/phone_number_id) berubah. Hasil verifikasi hanya boleh ditulis bila versi masih sama (G2-A04). */
    mappingVersion: integer("mapping_version").notNull().default(0),
    /** Waktu pemetaan terakhir berubah: bukti "event diterima" hanya dihitung sesudahnya (G2-A05). */
    mappingChangedAt: ts("mapping_changed_at").notNull().defaultNow(),
    /** 'terverifikasi' HANYA hasil pemeriksaan ke Graph API; `verificationMode` membedakan Meta asli vs mock. */
    verificationStatus: text("verification_status").notNull().default("belum_diperiksa"),
    verificationMode: text("verification_mode"),
    verifiedAt: ts("verified_at"),
    verificationDetail: jsonb("verification_detail").notNull().default(sql`'{}'::jsonb`),
    historyProgress: jsonb("history_progress").notNull().default(sql`'{}'::jsonb`),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (t) => [
    uniqueIndex("channel_connections_phone_unique").on(t.phoneNumberId),
    check("channel_connections_status", sql`${t.verificationStatus} IN ('belum_diperiksa','terverifikasi','gagal')`),
    check("channel_connections_mode", sql`${t.verificationMode} IS NULL OR ${t.verificationMode} IN ('nyata','simulasi')`),
    check("channel_connections_verified_has_mode", sql`${t.verificationStatus} <> 'terverifikasi' OR (${t.verificationMode} IS NOT NULL AND ${t.verifiedAt} IS NOT NULL)`),
    check("channel_connections_rate", sql`${t.rateLimitPerSec} >= 1 AND ${t.rateLimitPerSec} <= 100`),
  ],
);

// ───────────── Antrean event masuk (ADR-0002): disimpan SEBELUM respons sukses, diproses idempoten ─────────────
export const inboundEvents = pgTable(
  "inbound_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: text("provider").notNull().default("whatsapp"),
    eventKey: text("event_key").notNull(),
    kind: text("kind").notNull(),
    channelId: uuid("channel_id").references(() => channels.id),
    wabaId: text("waba_id"),
    phoneNumberId: text("phone_number_id"),
    /** Fragmen event mentah. Dibatasi retensinya (D-18: ≤ 30 hari, di-NULL-kan) dan TIDAK PERNAH masuk log. */
    payload: jsonb("payload"),
    status: text("status").notNull().default("pending"),
    quarantineReason: text("quarantine_reason"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: ts("run_after").notNull().defaultNow(),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    providerTs: ts("provider_ts"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [
    uniqueIndex("inbound_events_key_unique").on(t.provider, t.eventKey),
    index("inbound_events_queue_idx").on(t.status, t.runAfter),
    check("inbound_events_status", sql`${t.status} IN ('pending','processing','processed','failed','quarantined')`),
    check("inbound_events_kind", sql`${t.kind} IN ('message','status','echo','history','contact_sync','unknown')`),
    check("inbound_events_quarantine_reason", sql`${t.status} <> 'quarantined' OR ${t.quarantineReason} IS NOT NULL`),
  ],
);

// ───────────── Percakapan & pesan ─────────────
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    channelId: uuid("channel_id").notNull().references(() => channels.id),
    /** Dasar jendela layanan 24 jam: HANYA dari pesan pelanggan yang terbukti. Echo & history TIDAK memperbarui kolom ini. */
    lastCustomerMessageAt: ts("last_customer_message_at"),
    lastMessageAt: ts("last_message_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversations_contact_channel_unique").on(t.contactId, t.channelId), index("conversations_channel_idx").on(t.channelId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
    channelId: uuid("channel_id").notNull().references(() => channels.id),
    direction: text("direction").notNull(),
    source: text("source").notNull(),
    type: text("type").notNull(),
    rawType: text("raw_type"),
    body: text("body"),
    providerMessageId: text("provider_message_id"),
    providerTs: ts("provider_ts"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    status: text("status"),
    statusRank: integer("status_rank").notNull().default(0),
    statusUpdatedAt: ts("status_updated_at"),
    errorCategory: text("error_category"),
    errorCode: text("error_code"),
    idempotencyKey: text("idempotency_key"),
    isHistory: boolean("is_history").notNull().default(false),
    createdBy: uuid("created_by"),
  },
  (t) => [
    // NULL dianggap berbeda oleh PostgreSQL → indeks biasa sudah benar dan kompatibel dengan ON CONFLICT.
    uniqueIndex("messages_provider_unique").on(t.channelId, t.providerMessageId),
    uniqueIndex("messages_idempotency_unique").on(t.idempotencyKey),
    index("messages_conversation_idx").on(t.conversationId, t.receivedAt),
    check("messages_direction", sql`${t.direction} IN ('masuk','keluar')`),
    check("messages_source", sql`${t.source} IN ('pelanggan','te_one','whatsapp_business_app','history')`),
    check("messages_type", sql`${t.type} IN ('text','image','document','unsupported')`),
    check("messages_status", sql`${t.status} IS NULL OR ${t.status} IN ('diproses','diterima_api','terkirim','diterima','dibaca','gagal','belum_pasti')`),
    // History tidak pernah berasal dari sumber lain, dan sebaliknya.
    check("messages_history_consistent", sql`(${t.source} = 'history') = ${t.isHistory}`),
    // Pesan masuk hanya dari pelanggan atau history; pesan keluar dari TE One / WhatsApp Business App / history.
    check("messages_direction_source", sql`(${t.direction} = 'masuk' AND ${t.source} IN ('pelanggan','history')) OR (${t.direction} = 'keluar' AND ${t.source} IN ('te_one','whatsapp_business_app','history'))`),
  ],
);

/** Log status dari provider. Status dapat datang berulang, tidak berurutan, atau SEBELUM pesan dicatat — semuanya disimpan lalu diterapkan. */
export const messageStatusEvents = pgTable(
  "message_status_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    channelId: uuid("channel_id").notNull().references(() => channels.id),
    providerMessageId: text("provider_message_id").notNull(),
    status: text("status").notNull(),
    providerTs: ts("provider_ts"),
    errorCode: text("error_code"),
    opaque: text("opaque"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("message_status_events_unique").on(t.channelId, t.providerMessageId, t.status), index("message_status_events_opaque_idx").on(t.opaque)],
);

export const leadSources = pgTable(
  "lead_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
    messageId: uuid("message_id").notNull().references(() => messages.id),
    channelId: uuid("channel_id").notNull().references(() => channels.id),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    sourceUrl: text("source_url"),
    headline: text("headline"),
    clickId: text("click_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lead_sources_message_unique").on(t.messageId), index("lead_sources_conversation_idx").on(t.conversationId)],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => messages.id),
    channelId: uuid("channel_id").notNull().references(() => channels.id),
    providerMediaId: text("provider_media_id"),
    mime: text("mime"),
    declaredSha256: text("declared_sha256"),
    sha256: text("sha256"),
    sizeBytes: integer("size_bytes"),
    storagePath: text("storage_path"),
    status: text("status").notNull().default("menunggu"),
    errorCategory: text("error_category"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("media_message_unique").on(t.messageId),
    check("media_status", sql`${t.status} IN ('menunggu','tersimpan','gagal','tidak_tersedia')`),
    check("media_stored_has_path", sql`${t.status} <> 'tersimpan' OR (${t.storagePath} IS NOT NULL AND ${t.sha256} IS NOT NULL)`),
  ],
);

/** Daftar penerima uji — ditegakkan di server untuk SEMUA pengiriman (AGENTS.md §3.6). Nilai = identitas WhatsApp (digit). */
export const testRecipients = pgTable(
  "test_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    identityValue: text("identity_value").notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("test_recipients_identity_unique").on(t.identityValue), check("test_recipients_digits", sql`${t.identityValue} ~ '^[0-9]{7,16}$'`)],
);
