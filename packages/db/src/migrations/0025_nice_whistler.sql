CREATE TABLE "commercial_decision_events" (
	"id" text PRIMARY KEY NOT NULL,
	"decision_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_id" text NOT NULL,
	"note" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_decision_weeks" (
	"week_start" timestamp with time zone PRIMARY KEY NOT NULL,
	"materialized_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"source_type" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"priority" text NOT NULL,
	"rank" integer NOT NULL,
	"evidence" json NOT NULL,
	"estimated_impact_cents" integer,
	"confidence_percent" integer,
	"sample_size" integer,
	"assigned_to_id" text,
	"due_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_decisions_rank_check" CHECK ("commercial_decisions"."rank" BETWEEN 1 AND 5),
	CONSTRAINT "commercial_decisions_status_check" CHECK ("commercial_decisions"."status" IN ('proposed', 'approved', 'rejected', 'in_progress', 'completed')),
	CONSTRAINT "commercial_decisions_priority_check" CHECK ("commercial_decisions"."priority" IN ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "commercial_decisions_confidence_check" CHECK ("commercial_decisions"."confidence_percent" IS NULL OR "commercial_decisions"."confidence_percent" BETWEEN 0 AND 100),
	CONSTRAINT "commercial_decisions_sample_size_check" CHECK ("commercial_decisions"."sample_size" IS NULL OR "commercial_decisions"."sample_size" >= 0)
);
--> statement-breakpoint
ALTER TABLE "commercial_decision_events" ADD CONSTRAINT "commercial_decision_events_decision_id_commercial_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."commercial_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decision_events" ADD CONSTRAINT "commercial_decision_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decisions" ADD CONSTRAINT "commercial_decisions_assigned_to_id_user_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commercial_decision_events_decision_time_idx" ON "commercial_decision_events" USING btree ("decision_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_decisions_week_source_unique" ON "commercial_decisions" USING btree ("week_start","source_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_decisions_week_rank_unique" ON "commercial_decisions" USING btree ("week_start","rank");--> statement-breakpoint
CREATE INDEX "commercial_decisions_week_priority_idx" ON "commercial_decisions" USING btree ("week_start","priority");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_commercial_decision_event_mutation()
RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'commercial decision events are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "commercial_decision_events_immutable"
BEFORE UPDATE OR DELETE ON "commercial_decision_events"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_decision_event_mutation();
