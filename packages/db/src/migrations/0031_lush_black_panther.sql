ALTER TABLE "leads" DROP CONSTRAINT "leads_email_unique";--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_content" text;