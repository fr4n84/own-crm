CREATE TABLE "suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"is_anonymous" boolean NOT NULL,
	"author_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_body_length_check" CHECK (char_length(btrim("suggestions"."body")) between 1 and 4000),
	CONSTRAINT "suggestions_anonymous_author_check" CHECK (not "suggestions"."is_anonymous" or "suggestions"."author_user_id" is null)
);
--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestions_created_at_idx" ON "suggestions" USING btree ("created_at");