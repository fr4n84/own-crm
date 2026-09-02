CREATE TABLE "lead_marketing_attributions" (
	"lead_id" text PRIMARY KEY NOT NULL,
	"rule_version_id" text NOT NULL,
	"creative_version_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"angle_id" text,
	"source_snapshot" text,
	"utm_content_snapshot" text NOT NULL,
	"match_kind" text NOT NULL,
	"attributed_by_id" text,
	"attributed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_marketing_attribution_match_kind_check" CHECK ("lead_marketing_attributions"."match_kind" IN ('automatic', 'backfill', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "marketing_angles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_attribution_rule_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"lineage_key" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"lead_source" text,
	"source_key" text DEFAULT '' NOT NULL,
	"utm_content" text NOT NULL,
	"utm_content_key" text NOT NULL,
	"creative_version_id" text NOT NULL,
	"valid_from" timestamp,
	"valid_to" timestamp,
	"parent_version_id" text,
	"actor_id" text NOT NULL,
	"approved_by_id" text NOT NULL,
	"approved_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_rule_status_check" CHECK ("marketing_attribution_rule_versions"."status" IN ('published', 'archived')),
	CONSTRAINT "marketing_rule_version_check" CHECK ("marketing_attribution_rule_versions"."version" >= 1),
	CONSTRAINT "marketing_rule_dates_check" CHECK ("marketing_attribution_rule_versions"."valid_from" IS NULL OR "marketing_attribution_rule_versions"."valid_to" IS NULL OR "marketing_attribution_rule_versions"."valid_to" >= "marketing_attribution_rule_versions"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"external_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_campaigns_status_check" CHECK ("marketing_campaigns"."status" IN ('active', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "marketing_creative_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"lineage_key" text NOT NULL,
	"version" integer NOT NULL,
	"campaign_id" text NOT NULL,
	"angle_id" text,
	"status" text DEFAULT 'published' NOT NULL,
	"name" text NOT NULL,
	"format" text DEFAULT 'other' NOT NULL,
	"asset_storage_key" text,
	"asset_file_name" text,
	"asset_mime_type" text,
	"asset_size_bytes" integer,
	"asset_checksum" text,
	"transcript" text,
	"hook" text,
	"promise" text,
	"cta" text,
	"target_profile" text,
	"objections" json DEFAULT '[]'::json NOT NULL,
	"awareness_stage" text,
	"ai_analysis_status" text DEFAULT 'not_requested' NOT NULL,
	"ai_analysis" json DEFAULT '{}'::json NOT NULL,
	"parent_version_id" text,
	"actor_id" text NOT NULL,
	"approved_by_id" text NOT NULL,
	"approved_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_creative_status_check" CHECK ("marketing_creative_versions"."status" IN ('published', 'archived')),
	CONSTRAINT "marketing_creative_format_check" CHECK ("marketing_creative_versions"."format" IN ('video', 'image', 'audio', 'text', 'other')),
	CONSTRAINT "marketing_creative_analysis_status_check" CHECK ("marketing_creative_versions"."ai_analysis_status" IN ('not_requested', 'suggested', 'approved', 'failed')),
	CONSTRAINT "marketing_creative_version_check" CHECK ("marketing_creative_versions"."version" >= 1),
	CONSTRAINT "marketing_creative_asset_size_check" CHECK ("marketing_creative_versions"."asset_size_bytes" IS NULL OR "marketing_creative_versions"."asset_size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "lead_marketing_attributions" ADD CONSTRAINT "lead_marketing_attributions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_marketing_attributions" ADD CONSTRAINT "lead_marketing_attributions_rule_version_id_marketing_attribution_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."marketing_attribution_rule_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_marketing_attributions" ADD CONSTRAINT "lead_marketing_attributions_creative_version_id_marketing_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."marketing_creative_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_marketing_attributions" ADD CONSTRAINT "lead_marketing_attributions_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_marketing_attributions" ADD CONSTRAINT "lead_marketing_attributions_angle_id_marketing_angles_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."marketing_angles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_marketing_attributions" ADD CONSTRAINT "lead_marketing_attributions_attributed_by_id_user_id_fk" FOREIGN KEY ("attributed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_angles" ADD CONSTRAINT "marketing_angles_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_attribution_rule_versions" ADD CONSTRAINT "marketing_attribution_rule_versions_creative_version_id_marketing_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."marketing_creative_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_attribution_rule_versions" ADD CONSTRAINT "marketing_attribution_rule_versions_parent_version_id_marketing_attribution_rule_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."marketing_attribution_rule_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_attribution_rule_versions" ADD CONSTRAINT "marketing_attribution_rule_versions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_attribution_rule_versions" ADD CONSTRAINT "marketing_attribution_rule_versions_approved_by_id_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_creative_versions" ADD CONSTRAINT "marketing_creative_versions_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_creative_versions" ADD CONSTRAINT "marketing_creative_versions_angle_id_marketing_angles_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."marketing_angles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_creative_versions" ADD CONSTRAINT "marketing_creative_versions_parent_version_id_marketing_creative_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."marketing_creative_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_creative_versions" ADD CONSTRAINT "marketing_creative_versions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_creative_versions" ADD CONSTRAINT "marketing_creative_versions_approved_by_id_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_marketing_attribution_rule_idx" ON "lead_marketing_attributions" USING btree ("rule_version_id");--> statement-breakpoint
CREATE INDEX "lead_marketing_attribution_campaign_idx" ON "lead_marketing_attributions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "lead_marketing_attribution_creative_idx" ON "lead_marketing_attributions" USING btree ("creative_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_angles_name_uidx" ON "marketing_angles" USING btree ("name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_rule_lineage_version_uidx" ON "marketing_attribution_rule_versions" USING btree ("lineage_key","version");--> statement-breakpoint
CREATE INDEX "marketing_rule_match_idx" ON "marketing_attribution_rule_versions" USING btree ("source_key","utm_content_key","status","valid_from","valid_to");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_campaigns_source_name_uidx" ON "marketing_campaigns" USING btree ("source_key","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_creative_lineage_version_uidx" ON "marketing_creative_versions" USING btree ("lineage_key","version");--> statement-breakpoint
CREATE INDEX "marketing_creative_campaign_status_idx" ON "marketing_creative_versions" USING btree ("campaign_id","status");