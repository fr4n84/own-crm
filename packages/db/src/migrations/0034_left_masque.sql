ALTER TABLE "closer_sale_records" ADD COLUMN "sale_amount_cents" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD COLUMN "amount_paid_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD COLUMN "currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD COLUMN "sold_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD COLUMN "contracted_sale_event_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD COLUMN "payment_received_event_id" text;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD COLUMN "last_financial_operation_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD CONSTRAINT "closer_sale_records_contracted_sale_event_id_lead_financial_events_id_fk" FOREIGN KEY ("contracted_sale_event_id") REFERENCES "public"."lead_financial_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD CONSTRAINT "closer_sale_records_payment_received_event_id_lead_financial_events_id_fk" FOREIGN KEY ("payment_received_event_id") REFERENCES "public"."lead_financial_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD CONSTRAINT "closer_sale_records_amounts_check" CHECK ("closer_sale_records"."sale_amount_cents" > 0 AND "closer_sale_records"."amount_paid_cents" >= 0 AND "closer_sale_records"."amount_paid_cents" <= "closer_sale_records"."sale_amount_cents");--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD CONSTRAINT "closer_sale_records_currency_check" CHECK ("closer_sale_records"."currency" ~ '^[A-Z]{3}$');