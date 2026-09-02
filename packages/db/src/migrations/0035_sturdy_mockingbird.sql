ALTER TABLE "leads" ADD COLUMN "whatsapp_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "whatsapp_sent_by_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_whatsapp_sent_by_id_user_id_fk" FOREIGN KEY ("whatsapp_sent_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_whatsapp_sent_pair_check" CHECK ("leads"."whatsapp_sent_at" IS NOT NULL OR "leads"."whatsapp_sent_by_id" IS NULL);