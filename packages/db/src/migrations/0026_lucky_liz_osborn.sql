CREATE TABLE "lead_financial_events" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_by_id" text NOT NULL,
	"note" text,
	"external_reference" text,
	"idempotency_key" text NOT NULL,
	"reversal_of_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_financial_events_kind_check" CHECK ("lead_financial_events"."kind" IN ('contracted_sale', 'discount', 'payment_received', 'refund', 'chargeback', 'commission', 'cost', 'reversal')),
	CONSTRAINT "lead_financial_events_amount_check" CHECK ("lead_financial_events"."amount_cents" > 0),
	CONSTRAINT "lead_financial_events_currency_check" CHECK ("lead_financial_events"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "lead_financial_events_reversal_shape_check" CHECK (("lead_financial_events"."kind" = 'reversal') = ("lead_financial_events"."reversal_of_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "campaign_spend_periods" ADD COLUMN "currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_financial_events" ADD CONSTRAINT "lead_financial_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_financial_events" ADD CONSTRAINT "lead_financial_events_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_financial_events" ADD CONSTRAINT "lead_financial_events_reversal_of_id_lead_financial_events_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."lead_financial_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_financial_events_actor_idempotency_uidx" ON "lead_financial_events" USING btree ("created_by_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_financial_events_reversal_of_uidx" ON "lead_financial_events" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "lead_financial_events_lead_occurred_idx" ON "lead_financial_events" USING btree ("lead_id","occurred_at");--> statement-breakpoint
ALTER TABLE "campaign_spend_periods" ADD CONSTRAINT "campaign_spend_periods_currency_check" CHECK ("campaign_spend_periods"."currency" ~ '^[A-Z]{3}$');
--> statement-breakpoint
CREATE FUNCTION prevent_lead_financial_event_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'lead_financial_events is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lead_financial_events_append_only
BEFORE UPDATE OR DELETE ON "lead_financial_events"
FOR EACH ROW EXECUTE FUNCTION prevent_lead_financial_event_mutation();
--> statement-breakpoint
CREATE FUNCTION validate_lead_financial_event_reversal() RETURNS trigger AS $$
DECLARE
	source_event "lead_financial_events"%ROWTYPE;
BEGIN
	IF NEW.kind <> 'reversal' THEN
		RETURN NEW;
	END IF;
	SELECT * INTO source_event
	FROM "lead_financial_events"
	WHERE id = NEW.reversal_of_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'reversal source event does not exist';
	END IF;
	IF source_event.kind = 'reversal' THEN
		RAISE EXCEPTION 'a reversal cannot reverse another reversal';
	END IF;
	IF source_event.lead_id <> NEW.lead_id THEN
		RAISE EXCEPTION 'reversal and source must belong to the same lead';
	END IF;
	IF source_event.amount_cents <> NEW.amount_cents OR source_event.currency <> NEW.currency THEN
		RAISE EXCEPTION 'reversal must copy source amount and currency';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lead_financial_events_validate_reversal
BEFORE INSERT ON "lead_financial_events"
FOR EACH ROW EXECUTE FUNCTION validate_lead_financial_event_reversal();
