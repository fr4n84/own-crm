CREATE TABLE "team_presence" (
	"user_id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"last_heartbeat_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_presence_category_check" CHECK ("team_presence"."category" IN ('crm','sales','coaching','administration'))
);
--> statement-breakpoint
ALTER TABLE "team_presence" ADD CONSTRAINT "team_presence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_presence_last_heartbeat_idx" ON "team_presence" USING btree ("last_heartbeat_at");