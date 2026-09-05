CREATE TABLE "feature_activations" (
	"key" text PRIMARY KEY NOT NULL,
	"activated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "caller_assigned_at" timestamp with time zone;
--> statement-breakpoint
INSERT INTO "feature_activations" ("key", "activated_at")
VALUES ('caller_single_unworked_lead', transaction_timestamp())
ON CONFLICT ("key") DO NOTHING;
