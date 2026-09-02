CREATE TABLE "lead_activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_activity_events_kind_check" CHECK ("lead_activity_events"."kind" IN ('lead_created', 'lead_type_changed', 'caller_assigned', 'closer_assigned', 'state_changed', 'caller_feedback', 'closer_feedback', 'appointment_scheduled', 'appointment_rescheduled', 'alert_created', 'alert_resolved', 'alert_dismissed'))
);
--> statement-breakpoint
ALTER TABLE "lead_activity_events" ADD CONSTRAINT "lead_activity_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activity_events" ADD CONSTRAINT "lead_activity_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_activity_events_dedupe_key_uidx" ON "lead_activity_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "lead_activity_events_lead_occurred_idx" ON "lead_activity_events" USING btree ("lead_id","occurred_at");