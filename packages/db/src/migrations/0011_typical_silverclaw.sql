ALTER TABLE "leads" ADD COLUMN "type" text DEFAULT 'maestra' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_type_check" CHECK ("leads"."type" IN ('maestra', 'agenda'));
