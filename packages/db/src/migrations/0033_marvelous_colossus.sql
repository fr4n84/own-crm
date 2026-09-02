CREATE TABLE "closer_sale_records" (
	"lead_id" text PRIMARY KEY NOT NULL,
	"contract_storage_key" text,
	"contract_file_name" text,
	"contract_mime_type" text,
	"contract_size_bytes" integer,
	"contract_checksum" text,
	"sales_call_url" text,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"onboarding_video_url" text,
	"updated_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closer_sale_records_contract_shape_check" CHECK (("closer_sale_records"."contract_storage_key" IS NULL AND "closer_sale_records"."contract_file_name" IS NULL AND "closer_sale_records"."contract_mime_type" IS NULL AND "closer_sale_records"."contract_size_bytes" IS NULL AND "closer_sale_records"."contract_checksum" IS NULL) OR ("closer_sale_records"."contract_storage_key" IS NOT NULL AND "closer_sale_records"."contract_file_name" IS NOT NULL AND "closer_sale_records"."contract_mime_type" IS NOT NULL AND "closer_sale_records"."contract_size_bytes" > 0 AND "closer_sale_records"."contract_checksum" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD CONSTRAINT "closer_sale_records_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_sale_records" ADD CONSTRAINT "closer_sale_records_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
UPDATE "roles"
SET "permissions" = '["leads:*","alerts:*","sales:*"]'::json,
    "updated_at" = now()
WHERE "id" = 'role-closer';
--> statement-breakpoint
INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
VALUES ('role-caller-closer', 'Caller + Closer', '["leads:*","alerts:*","users:read","sales:*"]'::json, now(), now())
ON CONFLICT ("id") DO UPDATE
SET "name" = EXCLUDED."name",
    "permissions" = EXCLUDED."permissions",
    "updated_at" = now();
--> statement-breakpoint
UPDATE "user"
SET "role_id" = 'role-caller-closer',
    "updated_at" = now()
WHERE lower(btrim("name")) = 'anna';
--> statement-breakpoint
UPDATE "leads"
SET "pool_status" = 'discarded',
    "caller_id" = NULL,
    "closer_id" = NULL
WHERE "state" = 'número erróneo'
  AND "pool_status" = 'new';
--> statement-breakpoint
UPDATE "leads"
SET "questions" = (
  "questions"::jsonb || jsonb_build_array(
    jsonb_build_object(
      'questionKey', 'closerOutcome',
      'question', '¿Qué ha sucedido?',
      'answer', 'Venta',
      'authorRole', 'closer',
      'authorId', NULL
    ),
    jsonb_build_object(
      'questionKey', 'legacySaleEvidence',
      'question', 'Origen de la venta',
      'answer', 'feedback_csv',
      'authorRole', 'closer',
      'authorId', NULL
    )
  )
)::json
WHERE lower(btrim("feedback")) = 'venta'
  AND NOT EXISTS (
    SELECT 1
    FROM json_array_elements("questions") AS question
    WHERE question->>'questionKey' = 'closerOutcome'
      AND question->>'answer' = 'Venta'
  );
