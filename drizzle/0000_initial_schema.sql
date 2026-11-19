CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text DEFAULT 'sistem' NOT NULL,
	"action" text NOT NULL,
	"object_type" text DEFAULT '' NOT NULL,
	"object_id" text DEFAULT '' NOT NULL,
	"result" text NOT NULL,
	"correlation_id" text DEFAULT '' NOT NULL,
	"ip" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_log_result" CHECK ("audit_log"."result" IN ('success','failure','denied'))
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"function_label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"integration_kind" text NOT NULL,
	"environment" text NOT NULL,
	"status" text DEFAULT 'belum_dikonfigurasi' NOT NULL,
	"is_operational" boolean DEFAULT false NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "channels_integration_kind" CHECK ("channels"."integration_kind" IN ('cloud_api_coexistence','cloud_api_only')),
	CONSTRAINT "channels_environment" CHECK ("channels"."environment" IN ('development','staging','production')),
	CONSTRAINT "channels_status" CHECK ("channels"."status" IN ('belum_dikonfigurasi','sedang_dikonfigurasi')),
	CONSTRAINT "channels_operational_rules" CHECK (NOT ("channels"."is_operational" AND ("channels"."environment" <> 'production' OR "channels"."is_sample")))
);
--> statement-breakpoint
CREATE TABLE "feature_flag_overrides" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kill_switches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_ref" text DEFAULT '' NOT NULL,
	"engaged" boolean DEFAULT false NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"engaged_by" uuid,
	"engaged_at" timestamp with time zone,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kill_switches_scope_type" CHECK ("kill_switches"."scope_type" IN ('global','channel','feature','chat')),
	CONSTRAINT "kill_switches_global_ref" CHECK (("kill_switches"."scope_type" = 'global' AND "kill_switches"."scope_ref" = '') OR ("kill_switches"."scope_type" <> 'global' AND "kill_switches"."scope_ref" <> ''))
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"ip" text NOT NULL,
	"kind" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"max_channels" integer DEFAULT 5 NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "org_settings_singleton" CHECK ("org_settings"."id" = 1),
	CONSTRAINT "org_settings_max_channels" CHECK ("org_settings"."max_channels" >= 1 AND "org_settings"."max_channels" <= 100)
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"scope_all" boolean DEFAULT false NOT NULL,
	"channel_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	CONSTRAINT "role_grants_scope" CHECK (("role_grants"."scope_all" AND cardinality("role_grants"."channel_ids") = 0) OR (NOT "role_grants"."scope_all" AND cardinality("role_grants"."channel_ids") > 0))
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"require_2fa" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"totp_verified_at" timestamp with time zone,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "team_channels" (
	"team_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	CONSTRAINT "team_channels_team_id_channel_id_pk" PRIMARY KEY("team_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "user_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"effect" text NOT NULL,
	"scope_all" boolean DEFAULT false NOT NULL,
	"channel_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	CONSTRAINT "user_grants_effect" CHECK ("user_grants"."effect" IN ('allow','deny')),
	CONSTRAINT "user_grants_scope" CHECK (("user_grants"."scope_all" AND cardinality("user_grants"."channel_ids") = 0) OR (NOT "user_grants"."scope_all" AND cardinality("user_grants"."channel_ids") > 0))
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"totp_required" boolean DEFAULT false NOT NULL,
	"totp_last_step" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('active','disabled')),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_channels" ADD CONSTRAINT "team_channels_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_channels" ADD CONSTRAINT "team_channels_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_grants" ADD CONSTRAINT "user_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_time_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_active_name_unique" ON "channels" USING btree (lower("name")) WHERE "channels"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kill_switches_scope_unique" ON "kill_switches" USING btree ("scope_type","scope_ref");--> statement-breakpoint
CREATE INDEX "login_attempts_ident_idx" ON "login_attempts" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_codes_hash_unique" ON "recovery_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_idx" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_grants_unique" ON "role_grants" USING btree ("role_id","permission");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_unique" ON "roles" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_unique" ON "teams" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "user_grants_unique" ON "user_grants" USING btree ("user_id","permission","effect");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");