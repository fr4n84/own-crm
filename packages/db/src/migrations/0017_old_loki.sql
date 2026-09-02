CREATE TABLE "quality_control_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"caller_abandoned_hours" integer DEFAULT 24 NOT NULL,
	"closer_abandoned_hours" integer DEFAULT 24 NOT NULL,
	"caller_follow_up_grace_hours" integer DEFAULT 0 NOT NULL,
	"closer_follow_up_grace_hours" integer DEFAULT 0 NOT NULL,
	"caller_low_conversion_percent" integer DEFAULT 20 NOT NULL,
	"closer_low_conversion_percent" integer DEFAULT 20 NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quality_control_settings_non_negative_check" CHECK ("quality_control_settings"."caller_abandoned_hours" >= 0 AND "quality_control_settings"."closer_abandoned_hours" >= 0 AND "quality_control_settings"."caller_follow_up_grace_hours" >= 0 AND "quality_control_settings"."closer_follow_up_grace_hours" >= 0),
	CONSTRAINT "quality_control_settings_percentage_check" CHECK ("quality_control_settings"."caller_low_conversion_percent" BETWEEN 0 AND 100 AND "quality_control_settings"."closer_low_conversion_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "quality_control_settings" ADD CONSTRAINT "quality_control_settings_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;