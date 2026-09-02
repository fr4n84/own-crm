CREATE TABLE "alert_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"relevance_mode" text DEFAULT 'condition' NOT NULL,
	"urgent_threshold_hours" integer DEFAULT 2 NOT NULL,
	"warning_threshold_hours" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alert_preferences_relevance_mode_check" CHECK ("relevance_mode" IN ('condition', 'time')),
	CONSTRAINT "alert_preferences_urgent_threshold_check" CHECK ("urgent_threshold_hours" >= 0),
	CONSTRAINT "alert_preferences_warning_threshold_check" CHECK ("warning_threshold_hours" > "urgent_threshold_hours")
);
--> statement-breakpoint
ALTER TABLE "alert_preferences"
	ADD CONSTRAINT "alert_preferences_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
	ON DELETE cascade ON UPDATE no action;
