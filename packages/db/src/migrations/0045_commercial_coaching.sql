CREATE TABLE "commercial_coaching_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"rubric_id" text NOT NULL,
	"rubric_version" text NOT NULL,
	"lead_id" text NOT NULL,
	"analyzed_user_id" text NOT NULL,
	"role" text NOT NULL,
	"product" text,
	"campaign" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"criteria" json NOT NULL,
	"summary" text NOT NULL,
	"requires_personal_review" boolean DEFAULT false NOT NULL,
	"review_reasons" json DEFAULT '[]'::json NOT NULL,
	"excluded_from_compensation" boolean DEFAULT true NOT NULL,
	"excluded_from_automatic_assignment" boolean DEFAULT true NOT NULL,
	"disciplinary_use_prohibited" boolean DEFAULT true NOT NULL,
	"created_by_id" text NOT NULL,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_coaching_analyses_role_check" CHECK ("commercial_coaching_analyses"."role" IN ('caller','closer')),
	CONSTRAINT "commercial_coaching_analyses_status_check" CHECK ("commercial_coaching_analyses"."status" IN ('draft','confirmed','discarded')),
	CONSTRAINT "commercial_coaching_non_punitive_check" CHECK ("commercial_coaching_analyses"."excluded_from_compensation" AND "commercial_coaching_analyses"."excluded_from_automatic_assignment" AND "commercial_coaching_analyses"."disciplinary_use_prohibited")
);
--> statement-breakpoint
CREATE TABLE "commercial_coaching_rubrics" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"role" text NOT NULL,
	"product" text,
	"campaign" text,
	"criteria" json NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_coaching_rubrics_role_check" CHECK ("commercial_coaching_rubrics"."role" IN ('caller','closer'))
);
--> statement-breakpoint
ALTER TABLE "commercial_coaching_analyses" ADD CONSTRAINT "commercial_coaching_analyses_rubric_id_commercial_coaching_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."commercial_coaching_rubrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_coaching_analyses" ADD CONSTRAINT "commercial_coaching_analyses_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_coaching_analyses" ADD CONSTRAINT "commercial_coaching_analyses_analyzed_user_id_user_id_fk" FOREIGN KEY ("analyzed_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_coaching_analyses" ADD CONSTRAINT "commercial_coaching_analyses_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_coaching_analyses" ADD CONSTRAINT "commercial_coaching_analyses_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_coaching_rubrics" ADD CONSTRAINT "commercial_coaching_rubrics_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commercial_coaching_analyses_user_idx" ON "commercial_coaching_analyses" USING btree ("analyzed_user_id","created_at");--> statement-breakpoint
CREATE INDEX "commercial_coaching_analyses_status_idx" ON "commercial_coaching_analyses" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "commercial_coaching_rubrics_scope_idx" ON "commercial_coaching_rubrics" USING btree ("role","product","campaign","active");
--> statement-breakpoint
INSERT INTO "commercial_coaching_rubrics" ("id", "version", "role", "product", "campaign", "criteria", "active") VALUES
('coaching-rubric-caller-v1', 'caller-v1', 'caller', NULL, NULL, '[{"key":"discovery","label":"Descubrimiento"},{"key":"objection_handling","label":"Gestión de objeciones"},{"key":"next_step","label":"Siguiente paso"}]'::json, true),
('coaching-rubric-closer-v1', 'closer-v1', 'closer', NULL, NULL, '[{"key":"diagnosis","label":"Diagnóstico"},{"key":"value_clarity","label":"Claridad de valor"},{"key":"commitment","label":"Compromiso y siguiente paso"}]'::json, true)
ON CONFLICT ("id") DO NOTHING;
