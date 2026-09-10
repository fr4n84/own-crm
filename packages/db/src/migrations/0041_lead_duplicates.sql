CREATE TABLE "lead_aliases" (
	"alias_lead_id" text PRIMARY KEY NOT NULL,
	"canonical_lead_id" text NOT NULL,
	"merge_audit_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_duplicate_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_a_id" text NOT NULL,
	"lead_b_id" text NOT NULL,
	"reasons" json NOT NULL,
	"name_similarity" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_duplicate_cases_distinct_check" CHECK ("lead_duplicate_cases"."lead_a_id" < "lead_duplicate_cases"."lead_b_id"),
	CONSTRAINT "lead_duplicate_cases_similarity_check" CHECK ("lead_duplicate_cases"."name_similarity" BETWEEN 0 AND 100),
	CONSTRAINT "lead_duplicate_cases_status_check" CHECK ("lead_duplicate_cases"."status" IN ('open','merged','dismissed'))
);
--> statement-breakpoint
CREATE TABLE "lead_merge_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"source_lead_id" text NOT NULL,
	"canonical_lead_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"duplicate_case_id" text NOT NULL,
	"snapshot" json NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "normalized_email" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "normalized_phone" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "merged_into_lead_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "merged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "merged_by_id" text;--> statement-breakpoint
UPDATE "leads"
SET
  "normalized_email" = CASE
    WHEN NULLIF(BTRIM("email"), '') IS NULL THEN NULL
    ELSE LOWER(BTRIM("email"))
  END,
  "normalized_phone" = CASE
    WHEN BTRIM("phone") ~ '^(\+|00)' AND LENGTH(REGEXP_REPLACE("phone", '[^0-9]', '', 'g')) BETWEEN 8 AND 15
      THEN '+' || REGEXP_REPLACE(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), '^00', '')
    WHEN LENGTH(REGEXP_REPLACE("phone", '[^0-9]', '', 'g')) = 9
      THEN '+34' || REGEXP_REPLACE("phone", '[^0-9]', '', 'g')
    WHEN LENGTH(REGEXP_REPLACE("phone", '[^0-9]', '', 'g')) = 11 AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') LIKE '34%'
      THEN '+' || REGEXP_REPLACE("phone", '[^0-9]', '', 'g')
    ELSE NULL
  END;--> statement-breakpoint
INSERT INTO "lead_duplicate_cases" ("id", "lead_a_id", "lead_b_id", "reasons", "name_similarity")
SELECT
  'dup_' || MD5(a."id" || ':' || b."id"),
  a."id",
  b."id",
  TO_JSON(ARRAY_REMOVE(ARRAY[
    CASE WHEN a."normalized_email" IS NOT NULL AND a."normalized_email" = b."normalized_email" THEN 'exact_email' END,
    CASE WHEN a."normalized_phone" IS NOT NULL AND a."normalized_phone" = b."normalized_phone" THEN 'exact_phone' END
  ], NULL)),
  CASE WHEN LOWER(BTRIM(a."name")) = LOWER(BTRIM(b."name")) THEN 100 ELSE 0 END
FROM "leads" a
JOIN "leads" b ON a."id" < b."id"
WHERE
  (a."normalized_email" IS NOT NULL AND a."normalized_email" = b."normalized_email")
  OR (a."normalized_phone" IS NOT NULL AND a."normalized_phone" = b."normalized_phone");--> statement-breakpoint
ALTER TABLE "lead_aliases" ADD CONSTRAINT "lead_aliases_alias_lead_id_leads_id_fk" FOREIGN KEY ("alias_lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_aliases" ADD CONSTRAINT "lead_aliases_canonical_lead_id_leads_id_fk" FOREIGN KEY ("canonical_lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_aliases" ADD CONSTRAINT "lead_aliases_merge_audit_id_lead_merge_audit_id_fk" FOREIGN KEY ("merge_audit_id") REFERENCES "public"."lead_merge_audit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_cases" ADD CONSTRAINT "lead_duplicate_cases_lead_a_id_leads_id_fk" FOREIGN KEY ("lead_a_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_cases" ADD CONSTRAINT "lead_duplicate_cases_lead_b_id_leads_id_fk" FOREIGN KEY ("lead_b_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_cases" ADD CONSTRAINT "lead_duplicate_cases_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_merge_audit" ADD CONSTRAINT "lead_merge_audit_source_lead_id_leads_id_fk" FOREIGN KEY ("source_lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_merge_audit" ADD CONSTRAINT "lead_merge_audit_canonical_lead_id_leads_id_fk" FOREIGN KEY ("canonical_lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_merge_audit" ADD CONSTRAINT "lead_merge_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_merge_audit" ADD CONSTRAINT "lead_merge_audit_duplicate_case_id_lead_duplicate_cases_id_fk" FOREIGN KEY ("duplicate_case_id") REFERENCES "public"."lead_duplicate_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_aliases_canonical_idx" ON "lead_aliases" USING btree ("canonical_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_duplicate_cases_pair_uidx" ON "lead_duplicate_cases" USING btree ("lead_a_id","lead_b_id");--> statement-breakpoint
CREATE INDEX "lead_duplicate_cases_status_idx" ON "lead_duplicate_cases" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "lead_merge_audit_source_idx" ON "lead_merge_audit" USING btree ("source_lead_id");--> statement-breakpoint
CREATE INDEX "lead_merge_audit_canonical_idx" ON "lead_merge_audit" USING btree ("canonical_lead_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_merged_into_lead_id_leads_id_fk" FOREIGN KEY ("merged_into_lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_merged_by_id_user_id_fk" FOREIGN KEY ("merged_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_normalized_email_idx" ON "leads" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "leads_normalized_phone_idx" ON "leads" USING btree ("normalized_phone");--> statement-breakpoint
CREATE INDEX "leads_merged_into_idx" ON "leads" USING btree ("merged_into_lead_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_merge_shape_check" CHECK (("leads"."merged_into_lead_id" IS NULL AND "leads"."merged_at" IS NULL AND "leads"."merged_by_id" IS NULL) OR ("leads"."merged_into_lead_id" IS NOT NULL AND "leads"."merged_at" IS NOT NULL AND "leads"."merged_by_id" IS NOT NULL AND "leads"."merged_into_lead_id" <> "leads"."id"));
