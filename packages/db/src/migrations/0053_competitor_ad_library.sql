CREATE TABLE "competitor_ad_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_id" text NOT NULL,
	"sync_operation_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"observation_status" text NOT NULL,
	"public_fields" json NOT NULL,
	"metrics" json NOT NULL,
	"provenance" json NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"coverage" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_ad_snapshots_hash_check" CHECK ("competitor_ad_snapshots"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "competitor_ad_snapshots_status_check" CHECK ("competitor_ad_snapshots"."observation_status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE "competitor_ad_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"meta_page_id" text NOT NULL,
	"display_name" text NOT NULL,
	"countries" json NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_ad_sources_page_id_check" CHECK ("competitor_ad_sources"."meta_page_id" ~ '^[0-9]{1,64}$'),
	CONSTRAINT "competitor_ad_sources_display_name_check" CHECK (NULLIF(BTRIM("competitor_ad_sources"."display_name"), '') IS NOT NULL),
	CONSTRAINT "competitor_ad_sources_countries_check" CHECK (json_typeof("competitor_ad_sources"."countries") = 'array' AND json_array_length("competitor_ad_sources"."countries") BETWEEN 1 AND 25)
);
--> statement-breakpoint
CREATE TABLE "competitor_ad_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_key" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"competitor_count" integer NOT NULL,
	"ads_seen" integer NOT NULL,
	"snapshots_inserted" integer NOT NULL,
	"snapshots_unchanged" integer NOT NULL,
	"ads_marked_inactive" integer NOT NULL,
	"failure_codes" json NOT NULL,
	"coverage" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_ad_sync_runs_provider_check" CHECK ("competitor_ad_sync_runs"."provider" = 'meta_ad_library'),
	CONSTRAINT "competitor_ad_sync_runs_status_check" CHECK ("competitor_ad_sync_runs"."status" IN ('succeeded','partial','failed')),
	CONSTRAINT "competitor_ad_sync_runs_time_check" CHECK ("competitor_ad_sync_runs"."completed_at" >= "competitor_ad_sync_runs"."started_at"),
	CONSTRAINT "competitor_ad_sync_runs_counts_check" CHECK ("competitor_ad_sync_runs"."competitor_count" >= 0 AND "competitor_ad_sync_runs"."ads_seen" >= 0 AND "competitor_ad_sync_runs"."snapshots_inserted" >= 0 AND "competitor_ad_sync_runs"."snapshots_unchanged" >= 0 AND "competitor_ad_sync_runs"."ads_marked_inactive" >= 0)
);
--> statement-breakpoint
CREATE TABLE "competitor_ads" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"provider_ad_id" text NOT NULL,
	"current_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"inactive_observed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_ads_provider_id_check" CHECK (NULLIF(BTRIM("competitor_ads"."provider_ad_id"), '') IS NOT NULL),
	CONSTRAINT "competitor_ads_hash_check" CHECK ("competitor_ads"."current_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "competitor_ads_seen_order_check" CHECK ("competitor_ads"."last_seen_at" >= "competitor_ads"."first_seen_at"),
	CONSTRAINT "competitor_ads_inactive_shape_check" CHECK (("competitor_ads"."is_active" AND "competitor_ads"."inactive_observed_at" IS NULL) OR (NOT "competitor_ads"."is_active" AND "competitor_ads"."inactive_observed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "competitor_ad_snapshots" ADD CONSTRAINT "competitor_ad_snapshots_ad_id_competitor_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."competitor_ads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_ad_sources" ADD CONSTRAINT "competitor_ad_sources_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_ads" ADD CONSTRAINT "competitor_ads_source_id_competitor_ad_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."competitor_ad_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_ad_snapshots_ad_hash_uidx" ON "competitor_ad_snapshots" USING btree ("ad_id","sync_operation_key","content_hash");--> statement-breakpoint
CREATE INDEX "competitor_ad_snapshots_operation_idx" ON "competitor_ad_snapshots" USING btree ("sync_operation_key","retrieved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_ad_sources_meta_page_uidx" ON "competitor_ad_sources" USING btree ("meta_page_id");--> statement-breakpoint
CREATE INDEX "competitor_ad_sources_enabled_idx" ON "competitor_ad_sources" USING btree ("enabled","display_name");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_ad_sync_runs_operation_key_uidx" ON "competitor_ad_sync_runs" USING btree ("operation_key");--> statement-breakpoint
CREATE INDEX "competitor_ad_sync_runs_completed_idx" ON "competitor_ad_sync_runs" USING btree ("completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_ads_source_provider_uidx" ON "competitor_ads" USING btree ("source_id","provider_ad_id");--> statement-breakpoint
CREATE INDEX "competitor_ads_active_idx" ON "competitor_ads" USING btree ("source_id","is_active","last_seen_at");

--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_competitor_ad_audit_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'competitor_ad_snapshots' THEN
    RAISE EXCEPTION 'competitor ad snapshots are append-only';
  END IF;
  RAISE EXCEPTION 'competitor ad sync runs are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "competitor_ad_snapshots_immutable"
BEFORE UPDATE OR DELETE ON "competitor_ad_snapshots"
FOR EACH ROW EXECUTE FUNCTION "prevent_competitor_ad_audit_mutation"();
--> statement-breakpoint
CREATE TRIGGER "competitor_ad_sync_runs_immutable"
BEFORE UPDATE OR DELETE ON "competitor_ad_sync_runs"
FOR EACH ROW EXECUTE FUNCTION "prevent_competitor_ad_audit_mutation"();
