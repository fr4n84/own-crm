CREATE TABLE "closer_sale_voids" (
	"lead_id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"operation_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closer_sale_voids_reason_chk" CHECK (char_length(btrim("closer_sale_voids"."reason")) BETWEEN 1 AND 1000),
	CONSTRAINT "closer_sale_voids_operation_uuid_chk" CHECK ("closer_sale_voids"."operation_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);
--> statement-breakpoint
ALTER TABLE "closer_sale_voids" ADD CONSTRAINT "closer_sale_voids_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_sale_voids" ADD CONSTRAINT "closer_sale_voids_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "closer_sale_voids_operation_uidx" ON "closer_sale_voids" USING btree ("operation_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_closer_sale_void_mutation()
RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'closer_sale_voids is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "closer_sale_voids_append_only"
BEFORE UPDATE OR DELETE ON "closer_sale_voids"
FOR EACH ROW EXECUTE FUNCTION prevent_closer_sale_void_mutation();