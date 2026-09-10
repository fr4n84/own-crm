CREATE TABLE "admin_data_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"filters" json NOT NULL,
	"includes_pii" boolean NOT NULL,
	"file_name" text NOT NULL,
	"archive_sha256" text NOT NULL,
	"row_counts" json NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_data_exports_hash_check" CHECK ("admin_data_exports"."archive_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_data_exports_policy_check" CHECK (NULLIF(BTRIM("admin_data_exports"."policy_version"), '') IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "admin_data_exports" ADD CONSTRAINT "admin_data_exports_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;