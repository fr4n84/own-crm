CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"permissions" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
VALUES
  ('role-caller', 'Caller', '["leads:*"]', now(), now()),
  ('role-closer', 'Closer', '["leads:*","alerts:*"]', now(), now()),
  ('role-admin', 'Admin', '["*"]', now(), now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role_id" text;
--> statement-breakpoint
UPDATE "user" SET "role_id" = 'role-caller' WHERE "role_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_roles_id_fk"
  FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "role";