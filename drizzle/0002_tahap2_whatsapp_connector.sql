CREATE TABLE "channel_connections" (
	"channel_id" uuid PRIMARY KEY NOT NULL,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"test_mode" boolean DEFAULT true NOT NULL,
	"rate_limit_per_sec" integer DEFAULT 5 NOT NULL,
	"verification_status" text DEFAULT 'belum_diperiksa' NOT NULL,
	"verification_mode" text,
	"verified_at" timestamp with time zone,
	"verification_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"history_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "channel_connections_status" CHECK ("channel_connections"."verification_status" IN ('belum_diperiksa','terverifikasi','gagal')),
	CONSTRAINT "channel_connections_mode" CHECK ("channel_connections"."verification_mode" IS NULL OR "channel_connections"."verification_mode" IN ('nyata','simulasi')),
	CONSTRAINT "channel_connections_verified_has_mode" CHECK ("channel_connections"."verification_status" <> 'terverifikasi' OR ("channel_connections"."verification_mode" IS NOT NULL AND "channel_connections"."verified_at" IS NOT NULL)),
	CONSTRAINT "channel_connections_rate" CHECK ("channel_connections"."rate_limit_per_sec" >= 1 AND "channel_connections"."rate_limit_per_sec" <= 100)
);
--> statement-breakpoint
CREATE TABLE "contact_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"provider" text DEFAULT 'whatsapp' NOT NULL,
	"identity_type" text NOT NULL,
	"identity_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" uuid DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"last_customer_message_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'whatsapp' NOT NULL,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"channel_id" uuid,
	"waba_id" text,
	"phone_number_id" text,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"quarantine_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"provider_ts" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inbound_events_status" CHECK ("inbound_events"."status" IN ('pending','processing','processed','failed','quarantined')),
	CONSTRAINT "inbound_events_kind" CHECK ("inbound_events"."kind" IN ('message','status','echo','history','contact_sync','unknown')),
	CONSTRAINT "inbound_events_quarantine_reason" CHECK ("inbound_events"."status" <> 'quarantined' OR "inbound_events"."quarantine_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"source_type" text,
	"source_id" text,
	"source_url" text,
	"headline" text,
	"click_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"provider_media_id" text,
	"mime" text,
	"declared_sha256" text,
	"sha256" text,
	"size_bytes" integer,
	"storage_path" text,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"error_category" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_status" CHECK ("media"."status" IN ('menunggu','tersimpan','gagal','tidak_tersedia')),
	CONSTRAINT "media_stored_has_path" CHECK ("media"."status" <> 'tersimpan' OR ("media"."storage_path" IS NOT NULL AND "media"."sha256" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "message_status_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"provider_message_id" text NOT NULL,
	"status" text NOT NULL,
	"provider_ts" timestamp with time zone,
	"error_code" text,
	"opaque" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"raw_type" text,
	"body" text,
	"provider_message_id" text,
	"provider_ts" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text,
	"status_rank" integer DEFAULT 0 NOT NULL,
	"status_updated_at" timestamp with time zone,
	"error_category" text,
	"error_code" text,
	"idempotency_key" text,
	"is_history" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	CONSTRAINT "messages_direction" CHECK ("messages"."direction" IN ('masuk','keluar')),
	CONSTRAINT "messages_source" CHECK ("messages"."source" IN ('pelanggan','te_one','whatsapp_business_app','history')),
	CONSTRAINT "messages_type" CHECK ("messages"."type" IN ('text','image','document','unsupported')),
	CONSTRAINT "messages_status" CHECK ("messages"."status" IS NULL OR "messages"."status" IN ('diproses','diterima_api','terkirim','diterima','dibaca','gagal','belum_pasti')),
	CONSTRAINT "messages_history_consistent" CHECK (("messages"."source" = 'history') = "messages"."is_history"),
	CONSTRAINT "messages_direction_source" CHECK (("messages"."direction" = 'masuk' AND "messages"."source" IN ('pelanggan','history')) OR ("messages"."direction" = 'keluar' AND "messages"."source" IN ('te_one','whatsapp_business_app','history')))
);
--> statement-breakpoint
CREATE TABLE "test_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"identity_value" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_recipients_digits" CHECK ("test_recipients"."identity_value" ~ '^[0-9]{7,16}$')
);
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_events" ADD CONSTRAINT "inbound_events_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_status_events" ADD CONSTRAINT "message_status_events_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_phone_unique" ON "channel_connections" USING btree ("phone_number_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_unique" ON "contact_identities" USING btree ("provider","identity_type","identity_value");--> statement-breakpoint
CREATE INDEX "contact_identities_contact_idx" ON "contact_identities" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_public_ref_unique" ON "contacts" USING btree ("public_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_contact_channel_unique" ON "conversations" USING btree ("contact_id","channel_id");--> statement-breakpoint
CREATE INDEX "conversations_channel_idx" ON "conversations" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_events_key_unique" ON "inbound_events" USING btree ("provider","event_key");--> statement-breakpoint
CREATE INDEX "inbound_events_queue_idx" ON "inbound_events" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_sources_message_unique" ON "lead_sources" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "lead_sources_conversation_idx" ON "lead_sources" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_message_unique" ON "media" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_status_events_unique" ON "message_status_events" USING btree ("channel_id","provider_message_id","status");--> statement-breakpoint
CREATE INDEX "message_status_events_opaque_idx" ON "message_status_events" USING btree ("opaque");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_unique" ON "messages" USING btree ("channel_id","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_unique" ON "messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "test_recipients_identity_unique" ON "test_recipients" USING btree ("identity_value");