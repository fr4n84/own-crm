ALTER TABLE "alert_preferences" ADD COLUMN "no_contact_urgent_threshold_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "no_contact_warning_threshold_hours" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "follow_up_urgent_threshold_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "follow_up_warning_threshold_hours" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "future_call_urgent_threshold_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "future_call_warning_threshold_hours" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "appointment_urgent_threshold_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "appointment_warning_threshold_hours" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "rescheduled_urgent_threshold_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD COLUMN "rescheduled_warning_threshold_hours" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
UPDATE "alert_preferences" SET
  "no_contact_urgent_threshold_hours" = "urgent_threshold_hours",
  "no_contact_warning_threshold_hours" = "warning_threshold_hours",
  "follow_up_urgent_threshold_hours" = "urgent_threshold_hours",
  "follow_up_warning_threshold_hours" = "warning_threshold_hours",
  "future_call_urgent_threshold_hours" = "urgent_threshold_hours",
  "future_call_warning_threshold_hours" = "warning_threshold_hours",
  "appointment_urgent_threshold_hours" = "urgent_threshold_hours",
  "appointment_warning_threshold_hours" = "warning_threshold_hours",
  "rescheduled_urgent_threshold_hours" = "urgent_threshold_hours",
  "rescheduled_warning_threshold_hours" = "warning_threshold_hours";--> statement-breakpointALTER TABLE "leads" ADD COLUMN "whatsapp_caller_id" text;--> statement-breakpoint
UPDATE "leads" AS "lead" SET "whatsapp_caller_id" = (
  SELECT "candidate"."caller_id" FROM (
    SELECT NULLIF("event"."metadata"->>'previousCallerId', '') AS "caller_id", "event"."occurred_at"
    FROM "lead_activity_events" AS "event"
    WHERE "event"."lead_id" = "lead"."id" AND "event"."kind" = 'lead_discarded'
    UNION ALL
    SELECT "event"."actor_id" AS "caller_id", "event"."occurred_at"
    FROM "lead_activity_events" AS "event"
    WHERE "event"."lead_id" = "lead"."id" AND "event"."kind" = 'caller_assigned'
  ) AS "candidate"
  INNER JOIN "user" AS "caller" ON "caller"."id" = "candidate"."caller_id"
  WHERE "candidate"."caller_id" IS NOT NULL
  ORDER BY "candidate"."occurred_at" DESC
  LIMIT 1
)
WHERE "lead"."pool_status" = 'discarded' AND "lead"."whatsapp_caller_id" IS NULL;--> statement-breakpointALTER TABLE "leads" ADD CONSTRAINT "leads_whatsapp_caller_id_user_id_fk" FOREIGN KEY ("whatsapp_caller_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_whatsapp_caller_idx" ON "leads" USING btree ("whatsapp_caller_id");--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_no_contact_time_check" CHECK ("alert_preferences"."no_contact_urgent_threshold_hours" >= 0 AND "alert_preferences"."no_contact_warning_threshold_hours" > "alert_preferences"."no_contact_urgent_threshold_hours");--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_follow_up_time_check" CHECK ("alert_preferences"."follow_up_urgent_threshold_hours" >= 0 AND "alert_preferences"."follow_up_warning_threshold_hours" > "alert_preferences"."follow_up_urgent_threshold_hours");--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_future_call_time_check" CHECK ("alert_preferences"."future_call_urgent_threshold_hours" >= 0 AND "alert_preferences"."future_call_warning_threshold_hours" > "alert_preferences"."future_call_urgent_threshold_hours");--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_appointment_time_check" CHECK ("alert_preferences"."appointment_urgent_threshold_hours" >= 0 AND "alert_preferences"."appointment_warning_threshold_hours" > "alert_preferences"."appointment_urgent_threshold_hours");--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_rescheduled_time_check" CHECK ("alert_preferences"."rescheduled_urgent_threshold_hours" >= 0 AND "alert_preferences"."rescheduled_warning_threshold_hours" > "alert_preferences"."rescheduled_urgent_threshold_hours");
