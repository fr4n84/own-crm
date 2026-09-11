CREATE TABLE "email_marketing_export_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"purpose" text NOT NULL,
	"content_hash" text NOT NULL,
	"exported_count" integer NOT NULL,
	"exclusions" json NOT NULL,
	"operation_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_export_purpose_check" CHECK (char_length(btrim("email_marketing_export_audits"."purpose")) BETWEEN 1 AND 500),
	CONSTRAINT "email_marketing_export_count_check" CHECK ("email_marketing_export_audits"."exported_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" DROP CONSTRAINT "email_marketing_audience_member_shape_check";--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" DROP CONSTRAINT "email_marketing_audience_members_lead_id_leads_id_fk";
--> statement-breakpoint
DROP INDEX "email_marketing_audience_member_email_idx";--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_marketing_audience_snapshots" ADD COLUMN "criteria" json;--> statement-breakpoint
ALTER TABLE "email_marketing_content_versions" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_marketing_content_versions" ADD COLUMN "context_hash" text;--> statement-breakpoint
ALTER TABLE "email_marketing_export_audits" ADD CONSTRAINT "email_marketing_export_audits_snapshot_id_email_marketing_audience_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."email_marketing_audience_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_export_audits" ADD CONSTRAINT "email_marketing_export_audits_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_marketing_export_operation_uidx" ON "email_marketing_export_audits" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "email_marketing_export_snapshot_idx" ON "email_marketing_export_audits" USING btree ("snapshot_id","occurred_at");--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" ADD CONSTRAINT "email_marketing_audience_members_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" DROP COLUMN "lead_name";--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" DROP COLUMN "normalized_email";--> statement-breakpoint
DROP TRIGGER "email_marketing_audience_members_immutable" ON "email_marketing_audience_members";--> statement-breakpoint
UPDATE "email_marketing_audience_members"
SET "evidence" = ("evidence"::jsonb - 'selectedLeadId')::json
WHERE "evidence"::jsonb ? 'selectedLeadId';--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" ADD CONSTRAINT "email_marketing_audience_member_shape_check" CHECK (("email_marketing_audience_members"."decision" = 'included' AND "email_marketing_audience_members"."reason" = 'eligible' AND ("email_marketing_audience_members"."lead_id" IS NOT NULL OR "email_marketing_audience_members"."evidence"->>'anonymized' = 'true')) OR ("email_marketing_audience_members"."decision" = 'excluded' AND "email_marketing_audience_members"."reason" <> 'eligible'));--> statement-breakpoint
ALTER TABLE "email_marketing_content_versions" ADD CONSTRAINT "email_marketing_content_origin_check" CHECK ("email_marketing_content_versions"."origin" IN ('manual','ai'));--> statement-breakpoint
ALTER TABLE "email_marketing_content_versions" ADD CONSTRAINT "email_marketing_content_ai_review_check" CHECK ("email_marketing_content_versions"."origin" <> 'ai' OR "email_marketing_content_versions"."approved_by_id" IS NULL OR "email_marketing_content_versions"."approved_by_id" <> "email_marketing_content_versions"."created_by_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_email_marketing_audience_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'email_marketing_audience_members'
     AND TG_OP = 'UPDATE'
     AND OLD.lead_id IS NOT NULL
     AND NEW.lead_id IS NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.snapshot_id IS NOT DISTINCT FROM OLD.snapshot_id
     AND NEW.decision IS NOT DISTINCT FROM OLD.decision
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    NEW.evidence := ((OLD.evidence::jsonb - 'selectedLeadId') || '{"anonymized":true}'::jsonb)::json;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Email marketing audience snapshots are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "email_marketing_audience_members_immutable"
BEFORE UPDATE OR DELETE ON "email_marketing_audience_members"
FOR EACH ROW EXECUTE FUNCTION "prevent_email_marketing_audience_mutation"();--> statement-breakpoint
CREATE TRIGGER "email_marketing_export_audits_immutable"
BEFORE UPDATE OR DELETE ON "email_marketing_export_audits"
FOR EACH ROW EXECUTE FUNCTION "prevent_email_marketing_audience_mutation"();
