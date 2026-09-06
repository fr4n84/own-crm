CREATE TABLE "user_access_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"target_user_id" text NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"previous_status" text NOT NULL,
	"next_status" text NOT NULL,
	"status_version" integer NOT NULL,
	"reason" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_access_audit_action_check" CHECK ("user_access_audit"."action" IN ('approved','disabled','reactivated')),
	CONSTRAINT "user_access_audit_status_version_check" CHECK ("user_access_audit"."status_version" >= 2)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_status" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_status_changed_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_status_changed_by_id" text;--> statement-breakpoint
UPDATE "user" SET "access_status" = 'active' WHERE "access_status" IS NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "access_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "access_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_access_audit" ADD CONSTRAINT "user_access_audit_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access_audit" ADD CONSTRAINT "user_access_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_access_audit_target_idx" ON "user_access_audit" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "user_access_audit_actor_idx" ON "user_access_audit" USING btree ("actor_user_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_access_status_changed_by_id_user_id_fk" FOREIGN KEY ("access_status_changed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_access_status_check" CHECK ("user"."access_status" IN ('pending','active','disabled'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_status_version_check" CHECK ("user"."status_version" >= 1);
