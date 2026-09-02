CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_one_id" text NOT NULL,
	"participant_two_id" text NOT NULL,
	"participant_one_read_at" timestamp,
	"participant_two_read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_distinct_participants_check" CHECK ("conversations"."participant_one_id" <> "conversations"."participant_two_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"task_title" text,
	"task_assignee_id" text,
	"task_due_at" timestamp,
	"task_completed_at" timestamp,
	"task_completed_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "messages_kind_check" CHECK ("messages"."kind" IN ('message', 'task')),
	CONSTRAINT "messages_content_check" CHECK (("messages"."kind" = 'message' AND length(trim("messages"."body")) > 0) OR ("messages"."kind" = 'task' AND "messages"."task_title" IS NOT NULL AND "messages"."task_assignee_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_one_id_user_id_fk" FOREIGN KEY ("participant_one_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_two_id_user_id_fk" FOREIGN KEY ("participant_two_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_task_assignee_id_user_id_fk" FOREIGN KEY ("task_assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_task_completed_by_id_user_id_fk" FOREIGN KEY ("task_completed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_participant_pair_unique" ON "conversations" USING btree ("participant_one_id","participant_two_id");--> statement-breakpoint
CREATE INDEX "conversations_participant_one_idx" ON "conversations" USING btree ("participant_one_id");--> statement-breakpoint
CREATE INDEX "conversations_participant_two_idx" ON "conversations" USING btree ("participant_two_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_task_assignee_idx" ON "messages" USING btree ("task_assignee_id");