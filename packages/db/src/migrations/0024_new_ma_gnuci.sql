CREATE TABLE "campaign_spend_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"campaign" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"spend_cents" integer NOT NULL,
	"reference_sale_value_cents" integer NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_spend_periods_dates_check" CHECK ("campaign_spend_periods"."period_end" >= "campaign_spend_periods"."period_start"),
	CONSTRAINT "campaign_spend_periods_spend_cents_check" CHECK ("campaign_spend_periods"."spend_cents" > 0),
	CONSTRAINT "campaign_spend_periods_sale_value_cents_check" CHECK ("campaign_spend_periods"."reference_sale_value_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_spend_periods" ADD CONSTRAINT "campaign_spend_periods_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_spend_periods_campaign_dates_idx" ON "campaign_spend_periods" USING btree ("source","campaign","period_start","period_end");--> statement-breakpoint
CREATE INDEX "campaign_spend_periods_dates_idx" ON "campaign_spend_periods" USING btree ("period_start","period_end");