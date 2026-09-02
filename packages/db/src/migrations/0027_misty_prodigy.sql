ALTER TABLE "lead_activity_events" DROP CONSTRAINT "lead_activity_events_kind_check";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "creative" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "acquisition_angle" text;--> statement-breakpoint
ALTER TABLE "lead_activity_events" ADD CONSTRAINT "lead_activity_events_kind_check" CHECK ("lead_activity_events"."kind" IN ('lead_created', 'lead_type_changed', 'lead_attribution_updated', 'caller_assigned', 'closer_assigned', 'state_changed', 'caller_feedback', 'closer_feedback', 'appointment_scheduled', 'appointment_rescheduled', 'alert_created', 'alert_resolved', 'alert_dismissed', 'lead_recovered', 'lead_discarded', 'recommendation_shown', 'recommendation_opened', 'recommendation_completed', 'recommendation_skipped'));--> statement-breakpoint
-- Activity history is immutable while its lead aggregate exists. PostgreSQL FK
-- triggers may delete the aggregate history or clear a deleted actor identity.
CREATE OR REPLACE FUNCTION prevent_direct_lead_activity_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE'
      AND OLD.actor_id IS NOT NULL
      AND NEW.actor_id IS NULL
      AND (to_jsonb(NEW) - 'actor_id') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'actor_id')
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'lead activity events are immutable within a living lead aggregate';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS lead_activity_events_append_only ON "lead_activity_events";
--> statement-breakpoint
CREATE TRIGGER lead_activity_events_append_only
BEFORE UPDATE OR DELETE ON "lead_activity_events"
FOR EACH ROW EXECUTE FUNCTION prevent_direct_lead_activity_event_mutation();