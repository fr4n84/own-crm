CREATE TABLE "commercial_library_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"lineage_key" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"targeting" json DEFAULT '{}'::json NOT NULL,
	"evidence" json DEFAULT '{}'::json NOT NULL,
	"actor_id" text NOT NULL,
	"approved_by_id" text,
	"approved_at" timestamp,
	"origin_experiment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_library_status_check" CHECK ("commercial_library_versions"."status" IN ('draft','published','archived')),
	CONSTRAINT "commercial_library_type_check" CHECK ("commercial_library_versions"."type" IN ('script','objection_response','playbook','case_study')),
	CONSTRAINT "commercial_library_version_check" CHECK ("commercial_library_versions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD CONSTRAINT "commercial_library_versions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD CONSTRAINT "commercial_library_versions_approved_by_id_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_library_versions" ADD CONSTRAINT "commercial_library_versions_origin_experiment_id_commercial_experiments_id_fk" FOREIGN KEY ("origin_experiment_id") REFERENCES "public"."commercial_experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_library_lineage_version_uidx" ON "commercial_library_versions" USING btree ("lineage_key","version");--> statement-breakpoint
CREATE INDEX "commercial_library_status_type_idx" ON "commercial_library_versions" USING btree ("status","type");
--> statement-breakpoint
CREATE FUNCTION prevent_commercial_library_version_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'commercial_library_versions is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER commercial_library_versions_append_only
BEFORE UPDATE OR DELETE ON "commercial_library_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_library_version_mutation();
