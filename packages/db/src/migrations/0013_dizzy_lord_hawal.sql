CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"caller_id" text,
	"closer_id" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_duration_check" CHECK ("calendar_events"."duration_minutes" BETWEEN 5 AND 720),
	CONSTRAINT "calendar_events_date_check" CHECK ("calendar_events"."date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "calendar_events_start_time_check" CHECK ("calendar_events"."start_time" ~ '^\d{2}:\d{2}$')
);
--> statement-breakpoint
CREATE TABLE "calendar_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"agenda_duration_minutes" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_preferences_agenda_duration_check" CHECK ("calendar_preferences"."agenda_duration_minutes" BETWEEN 5 AND 720)
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_caller_id_user_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_closer_id_user_id_fk" FOREIGN KEY ("closer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_preferences" ADD CONSTRAINT "calendar_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_date_idx" ON "calendar_events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "calendar_events_caller_id_idx" ON "calendar_events" USING btree ("caller_id");--> statement-breakpoint
CREATE INDEX "calendar_events_closer_id_idx" ON "calendar_events" USING btree ("closer_id");