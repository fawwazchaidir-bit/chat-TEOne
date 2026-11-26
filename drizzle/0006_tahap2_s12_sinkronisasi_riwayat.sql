CREATE TABLE "smb_sync_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"sync_type" text NOT NULL,
	"mapping_version" integer NOT NULL,
	"status" text DEFAULT 'diminta' NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"http_status" integer,
	"meta_code" integer,
	"meta_subcode" integer,
	"failure_kind" text,
	"meta_request_id" text,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	CONSTRAINT "smb_sync_requests_type" CHECK ("smb_sync_requests"."sync_type" IN ('smb_app_state_sync','history')),
	CONSTRAINT "smb_sync_requests_status" CHECK ("smb_sync_requests"."status" IN ('diminta','diterima_meta','gagal','belum_pasti')),
	CONSTRAINT "smb_sync_requests_resolution" CHECK ("smb_sync_requests"."resolution" IS NULL OR "smb_sync_requests"."resolution" IN ('diterima','tidak_diproses')),
	CONSTRAINT "smb_sync_requests_failure_kind" CHECK ("smb_sync_requests"."failure_kind" IS NULL OR "smb_sync_requests"."failure_kind" IN ('tidak_dikirim','timeout','jaringan','http','respons_tak_dikenal'))
);
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "coexistence_onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "coexistence_onboarded_source" text;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "coexistence_onboarded_by" uuid;--> statement-breakpoint
ALTER TABLE "smb_sync_requests" ADD CONSTRAINT "smb_sync_requests_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "smb_sync_requests_once" ON "smb_sync_requests" USING btree ("channel_id","sync_type","mapping_version");--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_onboarded_source" CHECK (("channel_connections"."coexistence_onboarded_at" IS NULL AND "channel_connections"."coexistence_onboarded_source" IS NULL) OR ("channel_connections"."coexistence_onboarded_at" IS NOT NULL AND "channel_connections"."coexistence_onboarded_source" IS NOT NULL AND "channel_connections"."coexistence_onboarded_source" IN ('dinyatakan_admin')));