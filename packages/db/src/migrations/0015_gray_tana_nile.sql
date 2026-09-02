CREATE TABLE "ranking_events" (
	"id" text PRIMARY KEY NOT NULL,
	"metric" text NOT NULL,
	"user_id" text NOT NULL,
	"lead_id" text,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_events_metric_check" CHECK ("ranking_events"."metric" IN ('caller_lead_taken', 'caller_appointment', 'caller_show', 'closer_sale', 'closer_follow_up_show'))
);
--> statement-breakpoint
CREATE TABLE "ranking_monthly_results" (
	"id" text PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"points" integer NOT NULL,
	"metrics" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranking_point_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"caller_lead_taken_points" integer DEFAULT 1 NOT NULL,
	"caller_appointment_points" integer DEFAULT 3 NOT NULL,
	"caller_show_points" integer DEFAULT 5 NOT NULL,
	"closer_sale_points" integer DEFAULT 10 NOT NULL,
	"closer_follow_up_show_points" integer DEFAULT 6 NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_point_settings_non_negative_check" CHECK ("ranking_point_settings"."caller_lead_taken_points" >= 0 AND "ranking_point_settings"."caller_appointment_points" >= 0 AND "ranking_point_settings"."caller_show_points" >= 0 AND "ranking_point_settings"."closer_sale_points" >= 0 AND "ranking_point_settings"."closer_follow_up_show_points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_monthly_results" ADD CONSTRAINT "ranking_monthly_results_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_point_settings" ADD CONSTRAINT "ranking_point_settings_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_events_dedupe_key_unique" ON "ranking_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "ranking_events_metric_occurred_at_idx" ON "ranking_events" USING btree ("metric","occurred_at");--> statement-breakpoint
CREATE INDEX "ranking_events_user_occurred_at_idx" ON "ranking_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_monthly_results_month_user_unique" ON "ranking_monthly_results" USING btree ("month","user_id");--> statement-breakpoint
CREATE INDEX "ranking_monthly_results_month_position_idx" ON "ranking_monthly_results" USING btree ("month","position");