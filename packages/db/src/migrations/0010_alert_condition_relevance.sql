ALTER TABLE "alert_preferences"
	ADD COLUMN "no_contact_severity" text DEFAULT 'urgent' NOT NULL,
	ADD COLUMN "follow_up_severity" text DEFAULT 'info' NOT NULL,
	ADD COLUMN "future_call_severity" text DEFAULT 'info' NOT NULL,
	ADD COLUMN "appointment_severity" text DEFAULT 'info' NOT NULL,
	ADD COLUMN "rescheduled_severity" text DEFAULT 'info' NOT NULL;
--> statement-breakpoint
ALTER TABLE "alert_preferences"
	ADD CONSTRAINT "alert_preferences_no_contact_severity_check"
	CHECK ("no_contact_severity" IN ('info', 'warning', 'urgent')),
	ADD CONSTRAINT "alert_preferences_follow_up_severity_check"
	CHECK ("follow_up_severity" IN ('info', 'warning', 'urgent')),
	ADD CONSTRAINT "alert_preferences_future_call_severity_check"
	CHECK ("future_call_severity" IN ('info', 'warning', 'urgent')),
	ADD CONSTRAINT "alert_preferences_appointment_severity_check"
	CHECK ("appointment_severity" IN ('info', 'warning', 'urgent')),
	ADD CONSTRAINT "alert_preferences_rescheduled_severity_check"
	CHECK ("rescheduled_severity" IN ('info', 'warning', 'urgent'));
