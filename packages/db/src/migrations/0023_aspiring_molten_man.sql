CREATE TABLE "commercial_experiment_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"arm" text NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"frozen_context" json NOT NULL,
	"treatment_applied_at" timestamp,
	"treatment_applied_by_id" text,
	CONSTRAINT "commercial_experiment_assignments_arm_check" CHECK ("commercial_experiment_assignments"."arm" IN ('control', 'treatment'))
);
--> statement-breakpoint
CREATE TABLE "commercial_experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text NOT NULL,
	"intervention_type" text NOT NULL,
	"primary_metric" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"eligibility" json,
	"treatment_config" json DEFAULT '{}'::json NOT NULL,
	"treatment_instructions" json DEFAULT '{}'::json NOT NULL,
	"allocation_percent" integer NOT NULL,
	"minimum_sample_per_arm" integer NOT NULL,
	"maturation_days" integer NOT NULL,
	"guardrail_tolerance_pp" integer NOT NULL,
	"created_by_id" text NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"final_decision" text,
	"final_decision_by_id" text,
	"final_decision_at" timestamp,
	"final_decision_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_experiments_allocation_percent_check" CHECK ("commercial_experiments"."allocation_percent" BETWEEN 0 AND 100),
	CONSTRAINT "commercial_experiments_minimum_sample_per_arm_check" CHECK ("commercial_experiments"."minimum_sample_per_arm" >= 1),
	CONSTRAINT "commercial_experiments_maturation_days_check" CHECK ("commercial_experiments"."maturation_days" >= 0),
	CONSTRAINT "commercial_experiments_guardrail_tolerance_pp_check" CHECK ("commercial_experiments"."guardrail_tolerance_pp" >= 0),
	CONSTRAINT "commercial_experiments_intervention_type_check" CHECK ("commercial_experiments"."intervention_type" IN ('assignment_routing', 'speed_priority', 'follow_up_cadence', 'next_best_action')),
	CONSTRAINT "commercial_experiments_primary_metric_check" CHECK ("commercial_experiments"."primary_metric" IN ('contacted', 'appointment', 'show', 'sale')),
	CONSTRAINT "commercial_experiments_status_check" CHECK ("commercial_experiments"."status" IN ('draft', 'active', 'stopped', 'completed')),
	CONSTRAINT "commercial_experiments_final_decision_check" CHECK ("commercial_experiments"."final_decision" IN ('inconclusive', 'rejected', 'approved'))
);
--> statement-breakpoint
ALTER TABLE "commercial_experiment_assignments" ADD CONSTRAINT "commercial_experiment_assignments_experiment_id_commercial_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."commercial_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_experiment_assignments" ADD CONSTRAINT "commercial_experiment_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_experiment_assignments" ADD CONSTRAINT "commercial_experiment_assignments_treatment_applied_by_id_user_id_fk" FOREIGN KEY ("treatment_applied_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_experiments" ADD CONSTRAINT "commercial_experiments_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_experiments" ADD CONSTRAINT "commercial_experiments_final_decision_by_id_user_id_fk" FOREIGN KEY ("final_decision_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_experiment_assignments_experiment_lead_unique" ON "commercial_experiment_assignments" USING btree ("experiment_id","lead_id");--> statement-breakpoint
CREATE INDEX "commercial_experiment_assignments_experiment_arm_enrolled_idx" ON "commercial_experiment_assignments" USING btree ("experiment_id","arm","enrolled_at");--> statement-breakpoint
CREATE INDEX "commercial_experiment_assignments_lead_idx" ON "commercial_experiment_assignments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "commercial_experiments_status_intervention_idx" ON "commercial_experiments" USING btree ("status","intervention_type");--> statement-breakpoint
CREATE INDEX "commercial_experiments_created_by_idx" ON "commercial_experiments" USING btree ("created_by_id");