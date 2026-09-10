CREATE TABLE "closer_meet_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"closer_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"calendar_event_id" text NOT NULL,
	"calendar_event_url" text NOT NULL,
	"meeting_code" text NOT NULL,
	"meeting_uri" text NOT NULL,
	"conference_record_name" text,
	"recording_resource_name" text,
	"drive_file_name" text,
	"drive_export_uri" text,
	"transcript_resource_name" text,
	"transcript_language_code" text,
	"transcript_ciphertext" text,
	"transcript_nonce" text,
	"transcript_auth_tag" text,
	"transcript_encryption_version" text,
	"transcript_key_id" text,
	"transcript_sha256" text,
	"transcript_character_count" integer,
	"transcript_synced_at" timestamp with time zone,
	"transcript_error_code" text,
	"transcript_error_at" timestamp with time zone,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"recording_discovered_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closer_meet_sessions_status_check" CHECK ("closer_meet_sessions"."status" IN ('scheduled','recording_ready','failed')),
	CONSTRAINT "closer_meet_sessions_schedule_check" CHECK ("closer_meet_sessions"."scheduled_end" > "closer_meet_sessions"."scheduled_start"),
	CONSTRAINT "closer_meet_sessions_recording_metadata_check" CHECK (("closer_meet_sessions"."recording_resource_name" IS NULL AND "closer_meet_sessions"."drive_file_name" IS NULL AND "closer_meet_sessions"."drive_export_uri" IS NULL) OR ("closer_meet_sessions"."recording_resource_name" IS NOT NULL AND "closer_meet_sessions"."drive_file_name" IS NOT NULL AND "closer_meet_sessions"."drive_export_uri" IS NOT NULL)),
	CONSTRAINT "closer_meet_sessions_transcript_encryption_check" CHECK (("closer_meet_sessions"."transcript_resource_name" IS NULL AND "closer_meet_sessions"."transcript_ciphertext" IS NULL AND "closer_meet_sessions"."transcript_nonce" IS NULL AND "closer_meet_sessions"."transcript_auth_tag" IS NULL AND "closer_meet_sessions"."transcript_encryption_version" IS NULL AND "closer_meet_sessions"."transcript_key_id" IS NULL AND "closer_meet_sessions"."transcript_sha256" IS NULL AND "closer_meet_sessions"."transcript_character_count" IS NULL AND "closer_meet_sessions"."transcript_synced_at" IS NULL) OR ("closer_meet_sessions"."transcript_resource_name" IS NOT NULL AND "closer_meet_sessions"."transcript_ciphertext" IS NOT NULL AND "closer_meet_sessions"."transcript_nonce" IS NOT NULL AND "closer_meet_sessions"."transcript_auth_tag" IS NOT NULL AND "closer_meet_sessions"."transcript_encryption_version" IS NOT NULL AND "closer_meet_sessions"."transcript_key_id" IS NOT NULL AND "closer_meet_sessions"."transcript_sha256" IS NOT NULL AND "closer_meet_sessions"."transcript_character_count" >= 0 AND "closer_meet_sessions"."transcript_synced_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "closer_meet_sessions" ADD CONSTRAINT "closer_meet_sessions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_meet_sessions" ADD CONSTRAINT "closer_meet_sessions_closer_id_user_id_fk" FOREIGN KEY ("closer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_meet_sessions" ADD CONSTRAINT "closer_meet_sessions_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "closer_meet_sessions_calendar_event_idx" ON "closer_meet_sessions" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "closer_meet_sessions_meeting_code_idx" ON "closer_meet_sessions" USING btree ("meeting_code");--> statement-breakpoint
CREATE INDEX "closer_meet_sessions_lead_idx" ON "closer_meet_sessions" USING btree ("lead_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "closer_meet_sessions_closer_idx" ON "closer_meet_sessions" USING btree ("closer_id","scheduled_start");