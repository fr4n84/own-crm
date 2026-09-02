CREATE TABLE "call_feedback_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"processed_duration_ms" integer NOT NULL,
	"transcription_model" text NOT NULL,
	"summary_model" text NOT NULL,
	"estimated_cost_micro_usd" integer NOT NULL,
	"pricing_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_feedback_usage" ADD CONSTRAINT "call_feedback_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_feedback_usage" ADD CONSTRAINT "call_feedback_usage_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_feedback_usage_created_at_idx" ON "call_feedback_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "call_feedback_usage_user_created_at_idx" ON "call_feedback_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "call_feedback_usage_lead_idx" ON "call_feedback_usage" USING btree ("lead_id");