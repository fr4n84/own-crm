CREATE TABLE "whatsapp_consent_events" (
	"id" text PRIMARY KEY NOT NULL,
	"consent_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"normalized_phone" text NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"evidence" json NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"consent_version" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_consent_event_action_check" CHECK ("whatsapp_consent_events"."action" IN ('granted','revoked')),
	CONSTRAINT "whatsapp_consent_event_version_check" CHECK ("whatsapp_consent_events"."consent_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"normalized_phone" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"evidence" json NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_by_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_consent_status_check" CHECK ("whatsapp_consents"."status" IN ('granted','revoked')),
	CONSTRAINT "whatsapp_consent_phone_check" CHECK (NULLIF(BTRIM("whatsapp_consents"."normalized_phone"), '') IS NOT NULL),
	CONSTRAINT "whatsapp_consent_source_check" CHECK (NULLIF(BTRIM("whatsapp_consents"."source"), '') IS NOT NULL),
	CONSTRAINT "whatsapp_consent_version_check" CHECK ("whatsapp_consents"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"snapshot" json NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_outbox_event_action_check" CHECK ("whatsapp_outbox_events"."action" IN ('submitted','approved','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_outbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"normalized_recipient" text NOT NULL,
	"consent_id" text NOT NULL,
	"consent_version" integer NOT NULL,
	"body_text" text NOT NULL,
	"origin" text NOT NULL,
	"context_hash" text,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider" text DEFAULT 'meta_whatsapp_cloud' NOT NULL,
	"submitted_by_id" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"cancelled_by_id" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_outbox_status_check" CHECK ("whatsapp_outbox_messages"."status" IN ('pending_approval','approved','cancelled')),
	CONSTRAINT "whatsapp_outbox_origin_check" CHECK ("whatsapp_outbox_messages"."origin" IN ('manual','ai')),
	CONSTRAINT "whatsapp_outbox_provider_check" CHECK ("whatsapp_outbox_messages"."provider" = 'meta_whatsapp_cloud'),
	CONSTRAINT "whatsapp_outbox_recipient_check" CHECK (NULLIF(BTRIM("whatsapp_outbox_messages"."normalized_recipient"), '') IS NOT NULL),
	CONSTRAINT "whatsapp_outbox_body_check" CHECK (char_length(BTRIM("whatsapp_outbox_messages"."body_text")) BETWEEN 1 AND 4000),
	CONSTRAINT "whatsapp_outbox_consent_version_check" CHECK ("whatsapp_outbox_messages"."consent_version" >= 1),
	CONSTRAINT "whatsapp_outbox_idempotency_check" CHECK (NULLIF(BTRIM("whatsapp_outbox_messages"."idempotency_key"), '') IS NOT NULL),
	CONSTRAINT "whatsapp_outbox_state_shape_check" CHECK (("whatsapp_outbox_messages"."status" = 'pending_approval' AND "whatsapp_outbox_messages"."approved_by_id" IS NULL AND "whatsapp_outbox_messages"."approved_at" IS NULL AND "whatsapp_outbox_messages"."cancelled_by_id" IS NULL AND "whatsapp_outbox_messages"."cancelled_at" IS NULL) OR ("whatsapp_outbox_messages"."status" = 'approved' AND "whatsapp_outbox_messages"."approved_by_id" IS NOT NULL AND "whatsapp_outbox_messages"."approved_at" IS NOT NULL AND "whatsapp_outbox_messages"."approved_by_id" <> "whatsapp_outbox_messages"."submitted_by_id" AND "whatsapp_outbox_messages"."cancelled_by_id" IS NULL AND "whatsapp_outbox_messages"."cancelled_at" IS NULL) OR ("whatsapp_outbox_messages"."status" = 'cancelled' AND "whatsapp_outbox_messages"."approved_by_id" IS NULL AND "whatsapp_outbox_messages"."approved_at" IS NULL AND "whatsapp_outbox_messages"."cancelled_by_id" IS NOT NULL AND "whatsapp_outbox_messages"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "whatsapp_consent_events" ADD CONSTRAINT "whatsapp_consent_events_consent_id_whatsapp_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."whatsapp_consents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_consent_events" ADD CONSTRAINT "whatsapp_consent_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_consent_events" ADD CONSTRAINT "whatsapp_consent_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_consents" ADD CONSTRAINT "whatsapp_consents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_consents" ADD CONSTRAINT "whatsapp_consents_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox_events" ADD CONSTRAINT "whatsapp_outbox_events_message_id_whatsapp_outbox_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."whatsapp_outbox_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox_events" ADD CONSTRAINT "whatsapp_outbox_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox_messages" ADD CONSTRAINT "whatsapp_outbox_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox_messages" ADD CONSTRAINT "whatsapp_outbox_messages_consent_id_whatsapp_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."whatsapp_consents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox_messages" ADD CONSTRAINT "whatsapp_outbox_messages_submitted_by_id_user_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox_messages" ADD CONSTRAINT "whatsapp_outbox_messages_approved_by_id_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox_messages" ADD CONSTRAINT "whatsapp_outbox_messages_cancelled_by_id_user_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_consent_events_consent_idx" ON "whatsapp_consent_events" USING btree ("consent_id","consent_version");--> statement-breakpoint
CREATE INDEX "whatsapp_consent_events_lead_idx" ON "whatsapp_consent_events" USING btree ("lead_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_consents_phone_uidx" ON "whatsapp_consents" USING btree ("normalized_phone");--> statement-breakpoint
CREATE INDEX "whatsapp_consents_lead_idx" ON "whatsapp_consents" USING btree ("lead_id","status");--> statement-breakpoint
CREATE INDEX "whatsapp_outbox_events_message_idx" ON "whatsapp_outbox_events" USING btree ("message_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_outbox_idempotency_uidx" ON "whatsapp_outbox_messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "whatsapp_outbox_lead_idx" ON "whatsapp_outbox_messages" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_outbox_status_idx" ON "whatsapp_outbox_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_whatsapp_event_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'WhatsApp audit events are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "whatsapp_consent_events_immutable"
BEFORE UPDATE OR DELETE ON "whatsapp_consent_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_whatsapp_event_mutation"();--> statement-breakpoint
CREATE TRIGGER "whatsapp_outbox_events_immutable"
BEFORE UPDATE OR DELETE ON "whatsapp_outbox_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_whatsapp_event_mutation"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_whatsapp_outbox_payload_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WhatsApp outbox messages cannot be deleted';
  END IF;
  IF OLD.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Terminal WhatsApp outbox messages are immutable';
  END IF;
  IF NEW.status NOT IN ('approved', 'cancelled')
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.normalized_recipient IS DISTINCT FROM OLD.normalized_recipient
     OR NEW.consent_id IS DISTINCT FROM OLD.consent_id
     OR NEW.consent_version IS DISTINCT FROM OLD.consent_version
     OR NEW.body_text IS DISTINCT FROM OLD.body_text
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.context_hash IS DISTINCT FROM OLD.context_hash
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.submitted_by_id IS DISTINCT FROM OLD.submitted_by_id
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'WhatsApp outbox payload is immutable after submission';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "whatsapp_outbox_payload_immutable"
BEFORE UPDATE OR DELETE ON "whatsapp_outbox_messages"
FOR EACH ROW EXECUTE FUNCTION "prevent_whatsapp_outbox_payload_mutation"();
