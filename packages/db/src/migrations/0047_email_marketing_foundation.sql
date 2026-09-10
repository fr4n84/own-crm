CREATE TABLE "email_marketing_audience_members" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"lead_name" text NOT NULL,
	"normalized_email" text,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_audience_decision_check" CHECK ("email_marketing_audience_members"."decision" IN ('included','excluded')),
	CONSTRAINT "email_marketing_audience_reason_check" CHECK ("email_marketing_audience_members"."reason" IN ('eligible','missing_normalized_email','no_active_consent','suppressed','duplicate_normalized_email')),
	CONSTRAINT "email_marketing_audience_member_shape_check" CHECK (("email_marketing_audience_members"."decision" = 'included' AND "email_marketing_audience_members"."reason" = 'eligible' AND "email_marketing_audience_members"."normalized_email" IS NOT NULL) OR ("email_marketing_audience_members"."decision" = 'excluded' AND "email_marketing_audience_members"."reason" <> 'eligible'))
);
--> statement-breakpoint
CREATE TABLE "email_marketing_audience_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"version" integer NOT NULL,
	"source_kind" text DEFAULT 'all_unmerged_leads' NOT NULL,
	"policy_version" text DEFAULT 'email-marketing-v1' NOT NULL,
	"candidate_count" integer NOT NULL,
	"included_count" integer NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_audience_source_check" CHECK ("email_marketing_audience_snapshots"."source_kind" = 'all_unmerged_leads'),
	CONSTRAINT "email_marketing_audience_counts_check" CHECK ("email_marketing_audience_snapshots"."candidate_count" >= 0 AND "email_marketing_audience_snapshots"."included_count" >= 0 AND "email_marketing_audience_snapshots"."included_count" <= "email_marketing_audience_snapshots"."candidate_count")
);
--> statement-breakpoint
CREATE TABLE "email_marketing_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_campaign_status_check" CHECK ("email_marketing_campaigns"."status" IN ('draft','ready')),
	CONSTRAINT "email_marketing_campaign_name_check" CHECK (NULLIF(BTRIM("email_marketing_campaigns"."name"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "email_marketing_content_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"version" integer NOT NULL,
	"subject" text NOT NULL,
	"preview_text" text,
	"body_text" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_id" text NOT NULL,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_content_version_check" CHECK ("email_marketing_content_versions"."version" >= 1),
	CONSTRAINT "email_marketing_content_status_check" CHECK ("email_marketing_content_versions"."status" IN ('draft','approved','retired')),
	CONSTRAINT "email_marketing_content_approval_shape_check" CHECK (("email_marketing_content_versions"."status" = 'draft' AND "email_marketing_content_versions"."approved_by_id" IS NULL AND "email_marketing_content_versions"."approved_at" IS NULL) OR ("email_marketing_content_versions"."status" IN ('approved','retired') AND "email_marketing_content_versions"."approved_by_id" IS NOT NULL AND "email_marketing_content_versions"."approved_at" IS NOT NULL)),
	CONSTRAINT "email_marketing_content_subject_check" CHECK (NULLIF(BTRIM("email_marketing_content_versions"."subject"), '') IS NOT NULL),
	CONSTRAINT "email_marketing_content_body_check" CHECK (NULLIF(BTRIM("email_marketing_content_versions"."body_text"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "email_marketing_permission_events" (
	"id" text PRIMARY KEY NOT NULL,
	"permission_id" text NOT NULL,
	"normalized_email" text NOT NULL,
	"lead_id" text,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"evidence" json NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"permission_version" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_permission_event_action_check" CHECK ("email_marketing_permission_events"."action" IN ('granted','revoked')),
	CONSTRAINT "email_marketing_permission_event_version_check" CHECK ("email_marketing_permission_events"."permission_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "email_marketing_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"normalized_email" text NOT NULL,
	"lead_id" text,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"evidence" json NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_by_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_permission_status_check" CHECK ("email_marketing_permissions"."status" IN ('granted','revoked')),
	CONSTRAINT "email_marketing_permission_email_check" CHECK ("email_marketing_permissions"."normalized_email" = LOWER(BTRIM("email_marketing_permissions"."normalized_email")) AND NULLIF(BTRIM("email_marketing_permissions"."normalized_email"), '') IS NOT NULL),
	CONSTRAINT "email_marketing_permission_version_check" CHECK ("email_marketing_permissions"."version" >= 1),
	CONSTRAINT "email_marketing_permission_source_check" CHECK (NULLIF(BTRIM("email_marketing_permissions"."source"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "email_marketing_suppression_events" (
	"id" text PRIMARY KEY NOT NULL,
	"suppression_id" text NOT NULL,
	"normalized_email" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"evidence" json NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"suppression_version" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_suppression_event_action_check" CHECK ("email_marketing_suppression_events"."action" IN ('suppressed','lifted')),
	CONSTRAINT "email_marketing_suppression_event_version_check" CHECK ("email_marketing_suppression_events"."suppression_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "email_marketing_suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"normalized_email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"evidence" json NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"suppressed_by_id" text NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by_id" text,
	"lift_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_marketing_suppression_email_check" CHECK ("email_marketing_suppressions"."normalized_email" = LOWER(BTRIM("email_marketing_suppressions"."normalized_email")) AND NULLIF(BTRIM("email_marketing_suppressions"."normalized_email"), '') IS NOT NULL),
	CONSTRAINT "email_marketing_suppression_version_check" CHECK ("email_marketing_suppressions"."version" >= 1),
	CONSTRAINT "email_marketing_suppression_shape_check" CHECK (("email_marketing_suppressions"."active" AND "email_marketing_suppressions"."lifted_at" IS NULL AND "email_marketing_suppressions"."lifted_by_id" IS NULL AND "email_marketing_suppressions"."lift_reason" IS NULL) OR (NOT "email_marketing_suppressions"."active" AND "email_marketing_suppressions"."lifted_at" IS NOT NULL AND "email_marketing_suppressions"."lifted_by_id" IS NOT NULL AND NULLIF(BTRIM("email_marketing_suppressions"."lift_reason"), '') IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" ADD CONSTRAINT "email_marketing_audience_members_snapshot_id_email_marketing_audience_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."email_marketing_audience_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_audience_members" ADD CONSTRAINT "email_marketing_audience_members_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_audience_snapshots" ADD CONSTRAINT "email_marketing_audience_snapshots_campaign_id_email_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_marketing_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_audience_snapshots" ADD CONSTRAINT "email_marketing_audience_snapshots_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_campaigns" ADD CONSTRAINT "email_marketing_campaigns_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_content_versions" ADD CONSTRAINT "email_marketing_content_versions_campaign_id_email_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_marketing_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_content_versions" ADD CONSTRAINT "email_marketing_content_versions_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_content_versions" ADD CONSTRAINT "email_marketing_content_versions_approved_by_id_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_permission_events" ADD CONSTRAINT "email_marketing_permission_events_permission_id_email_marketing_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."email_marketing_permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_permission_events" ADD CONSTRAINT "email_marketing_permission_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_permission_events" ADD CONSTRAINT "email_marketing_permission_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_permissions" ADD CONSTRAINT "email_marketing_permissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_permissions" ADD CONSTRAINT "email_marketing_permissions_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_suppression_events" ADD CONSTRAINT "email_marketing_suppression_events_suppression_id_email_marketing_suppressions_id_fk" FOREIGN KEY ("suppression_id") REFERENCES "public"."email_marketing_suppressions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_suppression_events" ADD CONSTRAINT "email_marketing_suppression_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_suppressions" ADD CONSTRAINT "email_marketing_suppressions_suppressed_by_id_user_id_fk" FOREIGN KEY ("suppressed_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_marketing_suppressions" ADD CONSTRAINT "email_marketing_suppressions_lifted_by_id_user_id_fk" FOREIGN KEY ("lifted_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_marketing_audience_member_snapshot_lead_uidx" ON "email_marketing_audience_members" USING btree ("snapshot_id","lead_id");--> statement-breakpoint
CREATE INDEX "email_marketing_audience_member_decision_idx" ON "email_marketing_audience_members" USING btree ("snapshot_id","decision");--> statement-breakpoint
CREATE INDEX "email_marketing_audience_member_email_idx" ON "email_marketing_audience_members" USING btree ("snapshot_id","normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "email_marketing_audience_campaign_version_uidx" ON "email_marketing_audience_snapshots" USING btree ("campaign_id","version");--> statement-breakpoint
CREATE INDEX "email_marketing_audience_campaign_idx" ON "email_marketing_audience_snapshots" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "email_marketing_campaigns_status_idx" ON "email_marketing_campaigns" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_marketing_content_campaign_version_uidx" ON "email_marketing_content_versions" USING btree ("campaign_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "email_marketing_content_one_approved_uidx" ON "email_marketing_content_versions" USING btree ("campaign_id") WHERE "email_marketing_content_versions"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "email_marketing_content_campaign_idx" ON "email_marketing_content_versions" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "email_marketing_permission_events_email_idx" ON "email_marketing_permission_events" USING btree ("normalized_email","recorded_at");--> statement-breakpoint
CREATE INDEX "email_marketing_permission_events_permission_idx" ON "email_marketing_permission_events" USING btree ("permission_id","permission_version");--> statement-breakpoint
CREATE UNIQUE INDEX "email_marketing_permissions_email_uidx" ON "email_marketing_permissions" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "email_marketing_permissions_status_idx" ON "email_marketing_permissions" USING btree ("status","normalized_email");--> statement-breakpoint
CREATE INDEX "email_marketing_suppression_events_email_idx" ON "email_marketing_suppression_events" USING btree ("normalized_email","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_marketing_suppressions_email_uidx" ON "email_marketing_suppressions" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "email_marketing_suppressions_active_idx" ON "email_marketing_suppressions" USING btree ("active","normalized_email");
--> statement-breakpoint
CREATE FUNCTION "prevent_email_marketing_audience_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Email marketing audience snapshots are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "email_marketing_audience_snapshots_immutable"
BEFORE UPDATE OR DELETE ON "email_marketing_audience_snapshots"
FOR EACH ROW EXECUTE FUNCTION "prevent_email_marketing_audience_mutation"();
--> statement-breakpoint
CREATE TRIGGER "email_marketing_audience_members_immutable"
BEFORE UPDATE OR DELETE ON "email_marketing_audience_members"
FOR EACH ROW EXECUTE FUNCTION "prevent_email_marketing_audience_mutation"();
