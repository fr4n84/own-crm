CREATE TABLE "personal_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"metric" text NOT NULL,
	"target_value" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "personal_goals_metric_check" CHECK ("personal_goals"."metric" IN ('contacted', 'shows', 'appointments', 'appointment_rate', 'assigned', 'future_calls')),
	CONSTRAINT "personal_goals_target_positive_check" CHECK ("personal_goals"."target_value" > 0),
	CONSTRAINT "personal_goals_interval_check" CHECK ("personal_goals"."start_date" <= "personal_goals"."end_date")
);
--> statement-breakpoint
ALTER TABLE "personal_goals" ADD CONSTRAINT "personal_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_goals_user_interval_idx" ON "personal_goals" USING btree ("user_id","start_date","end_date");