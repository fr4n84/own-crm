CREATE TABLE "commercial_playbook_proposal_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"lineage_key" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text NOT NULL,
	"library_lineage_key" text NOT NULL,
	"base_library_version_id" text,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"change_summary" text NOT NULL,
	"targeting" json DEFAULT '{}'::json NOT NULL,
	"evidence_snapshot" json NOT NULL,
	"experiment_source_id" text,
	"published_library_version_id" text,
	"actor_id" text NOT NULL,
	"decision_by_id" text,
	"decision_reason" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_playbook_proposals_status_check" CHECK ("commercial_playbook_proposal_versions"."status" IN ('draft','approved','rejected')),
	CONSTRAINT "commercial_playbook_proposals_source_check" CHECK ("commercial_playbook_proposal_versions"."source" IN ('observational_gap','approved_experiment')),
	CONSTRAINT "commercial_playbook_proposals_version_check" CHECK ("commercial_playbook_proposal_versions"."version" >= 1),
	CONSTRAINT "commercial_playbook_proposals_decision_check" CHECK (("commercial_playbook_proposal_versions"."status" = 'draft' AND "commercial_playbook_proposal_versions"."decision_by_id" IS NULL AND "commercial_playbook_proposal_versions"."decision_reason" IS NULL AND "commercial_playbook_proposal_versions"."decided_at" IS NULL AND "commercial_playbook_proposal_versions"."published_library_version_id" IS NULL) OR ("commercial_playbook_proposal_versions"."status" = 'approved' AND "commercial_playbook_proposal_versions"."decision_by_id" IS NOT NULL AND "commercial_playbook_proposal_versions"."decision_reason" IS NOT NULL AND "commercial_playbook_proposal_versions"."decided_at" IS NOT NULL AND "commercial_playbook_proposal_versions"."published_library_version_id" IS NOT NULL) OR ("commercial_playbook_proposal_versions"."status" = 'rejected' AND "commercial_playbook_proposal_versions"."decision_by_id" IS NOT NULL AND "commercial_playbook_proposal_versions"."decision_reason" IS NOT NULL AND "commercial_playbook_proposal_versions"."decided_at" IS NOT NULL AND "commercial_playbook_proposal_versions"."published_library_version_id" IS NULL)),
	CONSTRAINT "commercial_playbook_proposals_experiment_source_check" CHECK (("commercial_playbook_proposal_versions"."source" = 'approved_experiment' AND "commercial_playbook_proposal_versions"."experiment_source_id" IS NOT NULL) OR ("commercial_playbook_proposal_versions"."source" = 'observational_gap' AND "commercial_playbook_proposal_versions"."experiment_source_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD COLUMN "parent_version_id" text;--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD COLUMN "change_kind" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD COLUMN "change_reason" text;--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD COLUMN "restored_from_version_id" text;--> statement-breakpoint
DROP TRIGGER "commercial_library_versions_append_only" ON "commercial_library_versions";--> statement-breakpoint
UPDATE "commercial_library_versions" AS child
SET "parent_version_id" = parent."id"
FROM "commercial_library_versions" AS parent
WHERE child."version" > 1
	AND parent."lineage_key" = child."lineage_key"
	AND parent."version" = child."version" - 1
	AND child."parent_version_id" IS NULL;--> statement-breakpoint
CREATE TRIGGER commercial_library_versions_append_only
BEFORE UPDATE OR DELETE ON "commercial_library_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_library_version_mutation();--> statement-breakpoint
ALTER TABLE "commercial_playbook_proposal_versions" ADD CONSTRAINT "commercial_playbook_proposal_versions_base_library_version_id_commercial_library_versions_id_fk" FOREIGN KEY ("base_library_version_id") REFERENCES "public"."commercial_library_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_playbook_proposal_versions" ADD CONSTRAINT "commercial_playbook_proposal_versions_experiment_source_id_commercial_experiments_id_fk" FOREIGN KEY ("experiment_source_id") REFERENCES "public"."commercial_experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_playbook_proposal_versions" ADD CONSTRAINT "commercial_playbook_proposal_versions_published_library_version_id_commercial_library_versions_id_fk" FOREIGN KEY ("published_library_version_id") REFERENCES "public"."commercial_library_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_playbook_proposal_versions" ADD CONSTRAINT "commercial_playbook_proposal_versions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_playbook_proposal_versions" ADD CONSTRAINT "commercial_playbook_proposal_versions_decision_by_id_user_id_fk" FOREIGN KEY ("decision_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_playbook_proposals_lineage_version_uidx" ON "commercial_playbook_proposal_versions" USING btree ("lineage_key","version");--> statement-breakpoint
CREATE INDEX "commercial_playbook_proposals_status_source_idx" ON "commercial_playbook_proposal_versions" USING btree ("status","source","created_at");--> statement-breakpoint
CREATE INDEX "commercial_playbook_proposals_library_idx" ON "commercial_playbook_proposal_versions" USING btree ("library_lineage_key","created_at");--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD CONSTRAINT "commercial_library_versions_parent_version_id_commercial_library_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."commercial_library_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD CONSTRAINT "commercial_library_versions_restored_from_version_id_commercial_library_versions_id_fk" FOREIGN KEY ("restored_from_version_id") REFERENCES "public"."commercial_library_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD CONSTRAINT "commercial_library_change_kind_check" CHECK ("commercial_library_versions"."change_kind" IN ('manual','learned','rollback'));--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD CONSTRAINT "commercial_library_rollback_source_check" CHECK (("commercial_library_versions"."change_kind" = 'rollback' AND "commercial_library_versions"."restored_from_version_id" IS NOT NULL) OR ("commercial_library_versions"."change_kind" <> 'rollback' AND "commercial_library_versions"."restored_from_version_id" IS NULL));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_commercial_library_version_append()
RETURNS trigger AS $$
DECLARE
	parent_lineage_key text;
	parent_version integer;
	restored_lineage_key text;
	restored_version integer;
BEGIN
	IF NEW."version" = 1 THEN
		IF NEW."parent_version_id" IS NOT NULL THEN
			RAISE EXCEPTION 'first commercial library version cannot have a parent';
		END IF;
	ELSE
		IF NEW."parent_version_id" IS NULL THEN
			RAISE EXCEPTION 'commercial library version requires its immediate parent';
		END IF;
		SELECT "lineage_key", "version"
		INTO parent_lineage_key, parent_version
		FROM "commercial_library_versions"
		WHERE "id" = NEW."parent_version_id";
		IF parent_lineage_key IS NULL OR parent_lineage_key <> NEW."lineage_key" OR parent_version <> NEW."version" - 1 THEN
			RAISE EXCEPTION 'commercial library parent must be the previous version in the same lineage';
		END IF;
	END IF;

	IF NEW."change_kind" = 'rollback' THEN
		SELECT "lineage_key", "version"
		INTO restored_lineage_key, restored_version
		FROM "commercial_library_versions"
		WHERE "id" = NEW."restored_from_version_id";
		IF restored_lineage_key IS NULL OR restored_lineage_key <> NEW."lineage_key" OR parent_version IS NULL OR restored_version >= parent_version THEN
			RAISE EXCEPTION 'rollback source must be older than the current version in the same lineage';
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER commercial_library_versions_validate_append
BEFORE INSERT ON "commercial_library_versions"
FOR EACH ROW EXECUTE FUNCTION validate_commercial_library_version_append();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_commercial_playbook_proposal_version_mutation()
RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'commercial playbook proposal versions are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER commercial_playbook_proposal_versions_append_only
BEFORE UPDATE OR DELETE ON "commercial_playbook_proposal_versions"
FOR EACH ROW EXECUTE FUNCTION reject_commercial_playbook_proposal_version_mutation();
