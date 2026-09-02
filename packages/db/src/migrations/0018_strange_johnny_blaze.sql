ALTER TABLE "lead_activity_events" DROP CONSTRAINT "lead_activity_events_kind_check";--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "expired_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pool_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "no_contact_impact_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "alerts_expiredAt_idx" ON "alerts" USING btree ("expired_at");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_pool_status_check" CHECK ("leads"."pool_status" IN ('new', 'recovered', 'discarded'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_no_contact_impact_count_check" CHECK ("leads"."no_contact_impact_count" BETWEEN 0 AND 3);--> statement-breakpoint
ALTER TABLE "lead_activity_events" ADD CONSTRAINT "lead_activity_events_kind_check" CHECK ("lead_activity_events"."kind" IN ('lead_created', 'lead_type_changed', 'caller_assigned', 'closer_assigned', 'state_changed', 'caller_feedback', 'closer_feedback', 'appointment_scheduled', 'appointment_rescheduled', 'alert_created', 'alert_resolved', 'alert_dismissed', 'lead_recovered', 'lead_discarded'));