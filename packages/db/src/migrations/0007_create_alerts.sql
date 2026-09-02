CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"target_user_id" text,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"severity" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dismissed_at" timestamp,
	"dismissed_by" text,
	"resolved_at" timestamp,
	"interval_minutes" integer NOT NULL,
	"next_show_at" timestamp NOT NULL,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"max_occurrences" integer
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_dismissed_by_user_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_targetUserId_idx" ON "alerts" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "alerts_nextShowAt_idx" ON "alerts" USING btree ("next_show_at");--> statement-breakpoint
CREATE INDEX "alerts_resolvedAt_idx" ON "alerts" USING btree ("resolved_at");