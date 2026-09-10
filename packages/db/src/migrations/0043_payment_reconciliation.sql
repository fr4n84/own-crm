CREATE TABLE "payment_provider_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_key" text NOT NULL,
	"name" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_profiles_key_check" CHECK ("payment_provider_profiles"."provider_key" ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
	CONSTRAINT "payment_provider_profiles_name_check" CHECK (NULLIF(BTRIM("payment_provider_profiles"."name"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "payment_reconciliation_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"reconciliation_id" text NOT NULL,
	"installment_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reconciliation_allocations_amount_check" CHECK ("payment_reconciliation_allocations"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_reconciliation_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"file_name" text NOT NULL,
	"content_hash" text NOT NULL,
	"row_count" integer NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reconciliation_batches_hash_check" CHECK ("payment_reconciliation_batches"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "payment_reconciliation_batches_rows_check" CHECK ("payment_reconciliation_batches"."row_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"external_reference" text NOT NULL,
	"lead_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"financial_event_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reconciliations_amount_check" CHECK ("payment_reconciliations"."amount_cents" > 0),
	CONSTRAINT "payment_reconciliations_currency_check" CHECK ("payment_reconciliations"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payment_reconciliations_reference_check" CHECK (NULLIF(BTRIM("payment_reconciliations"."external_reference"), '') IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "payment_provider_profiles" ADD CONSTRAINT "payment_provider_profiles_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliation_allocations" ADD CONSTRAINT "payment_reconciliation_allocations_reconciliation_id_payment_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."payment_reconciliations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliation_allocations" ADD CONSTRAINT "payment_reconciliation_allocations_installment_id_receivable_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."receivable_installments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliation_batches" ADD CONSTRAINT "payment_reconciliation_batches_profile_id_payment_provider_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."payment_provider_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliation_batches" ADD CONSTRAINT "payment_reconciliation_batches_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_batch_id_payment_reconciliation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_reconciliation_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_profile_id_payment_provider_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."payment_provider_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_financial_event_id_lead_financial_events_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."lead_financial_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_profiles_key_uidx" ON "payment_provider_profiles" USING btree ("provider_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reconciliation_allocations_reconciliation_installment_uidx" ON "payment_reconciliation_allocations" USING btree ("reconciliation_id","installment_id");--> statement-breakpoint
CREATE INDEX "payment_reconciliation_batches_profile_created_idx" ON "payment_reconciliation_batches" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reconciliations_profile_reference_uidx" ON "payment_reconciliations" USING btree ("profile_id","external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reconciliations_event_uidx" ON "payment_reconciliations" USING btree ("financial_event_id");--> statement-breakpoint
CREATE INDEX "payment_reconciliations_lead_occurred_idx" ON "payment_reconciliations" USING btree ("lead_id","occurred_at");