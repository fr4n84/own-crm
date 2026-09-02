ALTER TABLE "leads" DROP CONSTRAINT "leads_type_check";--> statement-breakpoint
UPDATE "leads" SET "type" = 'vsl' WHERE "type" = 'agenda';--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_type_check" CHECK ("leads"."type" IN ('maestra', 'vsl'));
