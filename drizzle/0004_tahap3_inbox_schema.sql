CREATE TABLE "automation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"trigger_message_id" uuid NOT NULL,
	"ai_version" integer NOT NULL,
	"feature" text DEFAULT 'ai_reply' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"status_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"outbound_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_jobs_kind" CHECK ("automation_jobs"."kind" IN ('ai_sim')),
	CONSTRAINT "automation_jobs_status" CHECK ("automation_jobs"."status" IN ('menunggu','diproses','dikirim','belum_pasti','selesai','dibatalkan','ditahan','gagal'))
);
--> statement-breakpoint
CREATE TABLE "conversation_ai_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"reason" text,
	"version" integer NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"boundary_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_notes_body" CHECK (length("conversation_notes"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "conversation_reads" (
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_reads_user_id_conversation_id_pk" PRIMARY KEY("user_id","conversation_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_team_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
CREATE TABLE "domain_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "domain_outbox_status" CHECK ("domain_outbox"."status" IN ('pending','processing','delivered','failed')),
	CONSTRAINT "domain_outbox_kind" CHECK ("domain_outbox"."kind" IN ('customer_message'))
);
--> statement-breakpoint
CREATE TABLE "quick_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"channel_id" uuid,
	"team_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_replies_lengths" CHECK (length("quick_replies"."title") BETWEEN 1 AND 80 AND length("quick_replies"."body") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_source";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_direction_source";--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "default_team_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assign_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_status" text DEFAULT 'aktif' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_off_reason" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_boundary_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "stray_lead" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "review_flag" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "change_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "unread_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_trigger_message_id_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_ai_events" ADD CONSTRAINT "conversation_ai_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_team_access" ADD CONSTRAINT "conversation_team_access_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_team_access" ADD CONSTRAINT "conversation_team_access_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_jobs_trigger_unique" ON "automation_jobs" USING btree ("kind","trigger_message_id");--> statement-breakpoint
CREATE INDEX "automation_jobs_queue_idx" ON "automation_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "automation_jobs_conversation_idx" ON "automation_jobs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_ai_events_conv_idx" ON "conversation_ai_events" USING btree ("conversation_id","version");--> statement-breakpoint
CREATE INDEX "conversation_notes_conversation_idx" ON "conversation_notes" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_team_access_active" ON "conversation_team_access" USING btree ("conversation_id","team_id") WHERE "conversation_team_access"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "conversation_team_access_team_idx" ON "conversation_team_access" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "domain_outbox_queue_idx" ON "domain_outbox" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "quick_replies_channel_idx" ON "quick_replies" USING btree ("channel_id");--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_default_team_id_teams_id_fk" FOREIGN KEY ("default_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_list_idx" ON "conversations" USING btree ("channel_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_team_idx" ON "conversations" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "conversations_assignee_idx" ON "conversations" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "conversations_change_idx" ON "conversations" USING btree ("change_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ai_status" CHECK ("conversations"."ai_status" IN ('aktif','off'));--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ai_off_reason" CHECK (("conversations"."ai_status" = 'aktif' AND "conversations"."ai_off_reason" IS NULL) OR ("conversations"."ai_status" = 'off' AND "conversations"."ai_off_reason" IN ('admin_mengambil_alih','admin_membalas','eskalasi','balasan_dari_hp','kill_switch','manual')));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_source" CHECK ("messages"."source" IN ('pelanggan','te_one','whatsapp_business_app','history','ai'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_direction_source" CHECK (("messages"."direction" = 'masuk' AND "messages"."source" IN ('pelanggan','history')) OR ("messages"."direction" = 'keluar' AND "messages"."source" IN ('te_one','whatsapp_business_app','history','ai')));