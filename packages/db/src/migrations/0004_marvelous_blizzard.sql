ALTER TABLE "leads" ALTER COLUMN "state" SET DEFAULT 'sin asignar';--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "response" SET DEFAULT 'sin asignar';--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "response" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "feedback" SET DEFAULT 'sin asignar';--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "feedback" SET NOT NULL;