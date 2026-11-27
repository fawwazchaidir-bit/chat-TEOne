CREATE TABLE "ai_agent_version_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"program_card_id" uuid,
	"knowledge_source_id" uuid,
	CONSTRAINT "ai_agent_version_sources_one" CHECK (("ai_agent_version_sources"."program_card_id" IS NOT NULL AND "ai_agent_version_sources"."knowledge_source_id" IS NULL) OR ("ai_agent_version_sources"."program_card_id" IS NULL AND "ai_agent_version_sources"."knowledge_source_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "ai_agent_versions_no" CHECK ("ai_agent_versions"."version_no" >= 1),
	CONSTRAINT "ai_agent_versions_status" CHECK ("ai_agent_versions"."status" IN ('draft','terbit','diganti')),
	CONSTRAINT "ai_agent_versions_published_meta" CHECK (("ai_agent_versions"."status" = 'draft' AND "ai_agent_versions"."published_at" IS NULL) OR ("ai_agent_versions"."status" <> 'draft' AND "ai_agent_versions"."published_at" IS NOT NULL AND "ai_agent_versions"."published_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'aktif' NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_agents_name_len" CHECK (length(btrim("ai_agents"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "ai_agents_status" CHECK ("ai_agents"."status" IN ('aktif','nonaktif'))
);
--> statement-breakpoint
CREATE TABLE "ai_channel_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_by" uuid,
	"ended_at" timestamp with time zone,
	CONSTRAINT "ai_channel_agents_end_order" CHECK ("ai_channel_agents"."ended_at" IS NULL OR "ai_channel_agents"."ended_at" >= "ai_channel_agents"."assigned_at")
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_agents" (
	"source_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_source_agents_source_id_agent_id_pk" PRIMARY KEY("source_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content_text" text,
	"content_sha256" text,
	"byte_size" integer,
	"error_category" text,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "knowledge_source_versions_no" CHECK ("knowledge_source_versions"."version_no" >= 1),
	CONSTRAINT "knowledge_source_versions_status" CHECK ("knowledge_source_versions"."status" IN ('draft','terbit','diganti')),
	CONSTRAINT "knowledge_source_versions_published_meta" CHECK (("knowledge_source_versions"."status" = 'draft' AND "knowledge_source_versions"."published_at" IS NULL) OR ("knowledge_source_versions"."status" <> 'draft' AND "knowledge_source_versions"."published_at" IS NOT NULL AND "knowledge_source_versions"."published_by" IS NOT NULL)),
	CONSTRAINT "knowledge_source_versions_sha" CHECK ("knowledge_source_versions"."content_sha256" IS NULL OR "knowledge_source_versions"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "knowledge_source_versions_size" CHECK ("knowledge_source_versions"."byte_size" IS NULL OR "knowledge_source_versions"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"owner_agent_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sources_title_len" CHECK (length(btrim("knowledge_sources"."title")) BETWEEN 1 AND 160),
	CONSTRAINT "knowledge_sources_scope" CHECK ("knowledge_sources"."scope" IN ('shared','agent')),
	CONSTRAINT "knowledge_sources_owner_rule" CHECK (("knowledge_sources"."scope" = 'agent' AND "knowledge_sources"."owner_agent_id" IS NOT NULL) OR ("knowledge_sources"."scope" = 'shared' AND "knowledge_sources"."owner_agent_id" IS NULL)),
	CONSTRAINT "knowledge_sources_kind" CHECK ("knowledge_sources"."kind" IN ('teks','txt','pdf','docx')),
	CONSTRAINT "knowledge_sources_status" CHECK ("knowledge_sources"."status" IN ('draft','diproses','siap_ditinjau','aktif','gagal','diarsipkan'))
);
--> statement-breakpoint
CREATE TABLE "program_card_agents" (
	"program_card_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_card_agents_program_card_id_agent_id_pk" PRIMARY KEY("program_card_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "program_card_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_card_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text,
	"category" text,
	"mode" text,
	"location" text,
	"schedule_start" date,
	"schedule_end" date,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"registration_close_at" timestamp with time zone,
	"price_text" text,
	"requirements" text,
	"registration_url" text,
	"brief_text" text,
	"flow_text" text,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "program_card_versions_no" CHECK ("program_card_versions"."version_no" >= 1),
	CONSTRAINT "program_card_versions_status" CHECK ("program_card_versions"."status" IN ('draft','terbit','diganti')),
	CONSTRAINT "program_card_versions_published_meta" CHECK (("program_card_versions"."status" = 'draft' AND "program_card_versions"."published_at" IS NULL) OR ("program_card_versions"."status" <> 'draft' AND "program_card_versions"."published_at" IS NOT NULL AND "program_card_versions"."published_by" IS NOT NULL)),
	CONSTRAINT "program_card_versions_mode" CHECK ("program_card_versions"."mode" IS NULL OR "program_card_versions"."mode" IN ('online','offline')),
	CONSTRAINT "program_card_versions_dates" CHECK ("program_card_versions"."schedule_start" IS NULL OR "program_card_versions"."schedule_end" IS NULL OR "program_card_versions"."schedule_end" >= "program_card_versions"."schedule_start"),
	CONSTRAINT "program_card_versions_url" CHECK ("program_card_versions"."registration_url" IS NULL OR ("program_card_versions"."registration_url" ~ '^https://[^[:space:]]+$' AND length("program_card_versions"."registration_url") <= 2000)),
	CONSTRAINT "program_card_versions_tz" CHECK (length("program_card_versions"."timezone") BETWEEN 3 AND 64)
);
--> statement-breakpoint
CREATE TABLE "program_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_cards_code_fmt" CHECK ("program_cards"."code" ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{1,39}$'),
	CONSTRAINT "program_cards_status" CHECK ("program_cards"."status" IN ('draft','aktif','diarsipkan'))
);
--> statement-breakpoint
ALTER TABLE "ai_agent_version_sources" ADD CONSTRAINT "ai_agent_version_sources_version_id_ai_agent_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_version_sources" ADD CONSTRAINT "ai_agent_version_sources_program_card_id_program_cards_id_fk" FOREIGN KEY ("program_card_id") REFERENCES "public"."program_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_version_sources" ADD CONSTRAINT "ai_agent_version_sources_knowledge_source_id_knowledge_sources_id_fk" FOREIGN KEY ("knowledge_source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_channel_agents" ADD CONSTRAINT "ai_channel_agents_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_channel_agents" ADD CONSTRAINT "ai_channel_agents_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_agents" ADD CONSTRAINT "knowledge_source_agents_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_agents" ADD CONSTRAINT "knowledge_source_agents_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_versions" ADD CONSTRAINT "knowledge_source_versions_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_owner_agent_id_ai_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_card_agents" ADD CONSTRAINT "program_card_agents_program_card_id_program_cards_id_fk" FOREIGN KEY ("program_card_id") REFERENCES "public"."program_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_card_agents" ADD CONSTRAINT "program_card_agents_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_card_versions" ADD CONSTRAINT "program_card_versions_program_card_id_program_cards_id_fk" FOREIGN KEY ("program_card_id") REFERENCES "public"."program_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_version_sources_card_unique" ON "ai_agent_version_sources" USING btree ("version_id","program_card_id") WHERE "ai_agent_version_sources"."program_card_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_version_sources_knowledge_unique" ON "ai_agent_version_sources" USING btree ("version_id","knowledge_source_id") WHERE "ai_agent_version_sources"."knowledge_source_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_versions_no_unique" ON "ai_agent_versions" USING btree ("agent_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_versions_one_draft" ON "ai_agent_versions" USING btree ("agent_id") WHERE "ai_agent_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_versions_one_published" ON "ai_agent_versions" USING btree ("agent_id") WHERE "ai_agent_versions"."status" = 'terbit';--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agents_name_unique" ON "ai_agents" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ai_channel_agents_one_active" ON "ai_channel_agents" USING btree ("channel_id") WHERE "ai_channel_agents"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ai_channel_agents_agent_idx" ON "ai_channel_agents" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_versions_no_unique" ON "knowledge_source_versions" USING btree ("source_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_versions_one_draft" ON "knowledge_source_versions" USING btree ("source_id") WHERE "knowledge_source_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_versions_one_published" ON "knowledge_source_versions" USING btree ("source_id") WHERE "knowledge_source_versions"."status" = 'terbit';--> statement-breakpoint
CREATE INDEX "knowledge_sources_owner_idx" ON "knowledge_sources" USING btree ("owner_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_card_versions_no_unique" ON "program_card_versions" USING btree ("program_card_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "program_card_versions_one_draft" ON "program_card_versions" USING btree ("program_card_id") WHERE "program_card_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "program_card_versions_one_published" ON "program_card_versions" USING btree ("program_card_id") WHERE "program_card_versions"."status" = 'terbit';--> statement-breakpoint
CREATE UNIQUE INDEX "program_cards_code_unique" ON "program_cards" USING btree (lower("code"));