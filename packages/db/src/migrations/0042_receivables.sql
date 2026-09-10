CREATE TABLE "receivable_accounts" (
	"lead_id" text PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"contracted_amount_cents" integer NOT NULL,
	"active_schedule_version" integer DEFAULT 1 NOT NULL,
	"updated_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_accounts_amount_check" CHECK ("receivable_accounts"."contracted_amount_cents" > 0),
	CONSTRAINT "receivable_accounts_currency_check" CHECK ("receivable_accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "receivable_accounts_version_check" CHECK ("receivable_accounts"."active_schedule_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "receivable_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"schedule_version" integer NOT NULL,
	"sequence" integer NOT NULL,
	"due_on" text NOT NULL,
	"expected_amount_cents" integer NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_installments_amount_check" CHECK ("receivable_installments"."expected_amount_cents" > 0),
	CONSTRAINT "receivable_installments_sequence_check" CHECK ("receivable_installments"."schedule_version" >= 1 AND "receivable_installments"."sequence" >= 1),
	CONSTRAINT "receivable_installments_due_check" CHECK ("receivable_installments"."due_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "receivable_payment_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"installment_id" text NOT NULL,
	"financial_event_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_payment_allocations_amount_check" CHECK ("receivable_payment_allocations"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "receivable_accounts" ADD CONSTRAINT "receivable_accounts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_accounts" ADD CONSTRAINT "receivable_accounts_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_installments" ADD CONSTRAINT "receivable_installments_lead_id_receivable_accounts_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."receivable_accounts"("lead_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payment_allocations" ADD CONSTRAINT "receivable_payment_allocations_installment_id_receivable_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."receivable_installments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payment_allocations" ADD CONSTRAINT "receivable_payment_allocations_financial_event_id_lead_financial_events_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."lead_financial_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_installments_schedule_sequence_uidx" ON "receivable_installments" USING btree ("lead_id","schedule_version","sequence");--> statement-breakpoint
CREATE INDEX "receivable_installments_due_idx" ON "receivable_installments" USING btree ("due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_payment_allocations_event_installment_uidx" ON "receivable_payment_allocations" USING btree ("financial_event_id","installment_id");--> statement-breakpoint
CREATE INDEX "receivable_payment_allocations_installment_idx" ON "receivable_payment_allocations" USING btree ("installment_id");
--> statement-breakpoint
INSERT INTO "receivable_accounts" (
	"lead_id",
	"currency",
	"contracted_amount_cents",
	"active_schedule_version",
	"updated_by_id",
	"created_at",
	"updated_at"
)
SELECT
	"lead_id",
	"currency",
	"sale_amount_cents",
	1,
	"updated_by_id",
	"created_at",
	"updated_at"
FROM "closer_sale_records"
ON CONFLICT ("lead_id") DO NOTHING;
--> statement-breakpoint
WITH sale_plans AS (
	SELECT
		s."lead_id",
		s."sale_amount_cents",
		s."sold_at",
		CASE
			WHEN s."payment_method" = 'financed' AND s."installment_months" BETWEEN 1 AND 600
				THEN s."installment_months"
			ELSE 1
		END AS installment_count
	FROM "closer_sale_records" s
), expanded AS (
	SELECT
		p.*,
		series.sequence,
		FLOOR(p."sale_amount_cents"::numeric / p.installment_count)::integer
			+ CASE WHEN series.sequence <= (p."sale_amount_cents" % p.installment_count) THEN 1 ELSE 0 END AS expected_amount_cents
	FROM sale_plans p
	CROSS JOIN LATERAL generate_series(1, p.installment_count) AS series(sequence)
)
INSERT INTO "receivable_installments" (
	"id",
	"lead_id",
	"schedule_version",
	"sequence",
	"due_on",
	"expected_amount_cents",
	"created_at"
)
SELECT
	'recv_inst_' || md5(e."lead_id" || ':1:' || e.sequence::text),
	e."lead_id",
	1,
	e.sequence,
	TO_CHAR((e."sold_at"::date + ((e.sequence - 1)::text || ' months')::interval)::date, 'YYYY-MM-DD'),
	e.expected_amount_cents,
	transaction_timestamp()
FROM expanded e
ON CONFLICT ("lead_id", "schedule_version", "sequence") DO NOTHING;
--> statement-breakpoint
WITH ranked_installments AS (
	SELECT
		i."id" AS installment_id,
		i."lead_id",
		i."expected_amount_cents",
		COALESCE(
			SUM(i."expected_amount_cents") OVER (
				PARTITION BY i."lead_id"
				ORDER BY i."sequence"
				ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
			),
			0
		) AS expected_before
	FROM "receivable_installments" i
	WHERE i."schedule_version" = 1 AND i."superseded_at" IS NULL
), legacy_payments AS (
	SELECT
		s."lead_id",
		s."payment_received_event_id" AS financial_event_id,
		s."amount_paid_cents"
	FROM "closer_sale_records" s
	WHERE s."payment_received_event_id" IS NOT NULL
		AND s."amount_paid_cents" > 0
		AND NOT EXISTS (
			SELECT 1
			FROM "lead_financial_events" reversal
			WHERE reversal."kind" = 'reversal'
				AND reversal."reversal_of_id" = s."payment_received_event_id"
		)
), proposed_allocations AS (
	SELECT
		r.installment_id,
		p.financial_event_id,
		GREATEST(
			LEAST(p."amount_paid_cents" - r.expected_before, r."expected_amount_cents"),
			0
		)::integer AS amount_cents
	FROM ranked_installments r
	JOIN legacy_payments p ON p."lead_id" = r."lead_id"
)
INSERT INTO "receivable_payment_allocations" (
	"id",
	"installment_id",
	"financial_event_id",
	"amount_cents",
	"created_at"
)
SELECT
	'recv_alloc_' || md5(a.financial_event_id || ':' || a.installment_id),
	a.installment_id,
	a.financial_event_id,
	a.amount_cents,
	transaction_timestamp()
FROM proposed_allocations a
WHERE a.amount_cents > 0
ON CONFLICT ("financial_event_id", "installment_id") DO NOTHING;
