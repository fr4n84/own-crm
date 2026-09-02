CREATE TABLE "navigation_visibility_settings" (
	"id" text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	"role_ids_by_module" json DEFAULT '{}'::json NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "navigation_visibility_settings_version_check" CHECK ("navigation_visibility_settings"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "navigation_visibility_settings" ADD CONSTRAINT "navigation_visibility_settings_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;