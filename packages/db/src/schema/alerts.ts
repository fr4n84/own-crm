import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { leads } from "./leads";

export const ALERT_KIND = {
		NO_CONTACT: "no_contact",
		FOLLOW_UP: "follow_up",
		FUTURE_CALL: "future_call",
		APPOINTMENT: "appointment",
		RESCHEDULED: "rescheduled",
	} as const;
export type AlertKind = (typeof ALERT_KIND)[keyof typeof ALERT_KIND];

export const ALERT_SEVERITY = {
	INFO: "info",
	WARNING: "warning",
	URGENT: "urgent",
} as const;
export type AlertSeverity = (typeof ALERT_SEVERITY)[keyof typeof ALERT_SEVERITY];

export const ALERT_RELEVANCE_MODE = {
	CONDITION: "condition",
	TIME: "time",
} as const;
export type AlertRelevanceMode =
	(typeof ALERT_RELEVANCE_MODE)[keyof typeof ALERT_RELEVANCE_MODE];

export const alertPreferences = pgTable(
	"alert_preferences",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		relevanceMode: text("relevance_mode")
			.$type<AlertRelevanceMode>()
			.default(ALERT_RELEVANCE_MODE.CONDITION)
			.notNull(),
		urgentThresholdHours: integer("urgent_threshold_hours").default(2).notNull(),
		warningThresholdHours: integer("warning_threshold_hours").default(6).notNull(),
		noContactSeverity: text("no_contact_severity")
			.$type<AlertSeverity>()
			.default(ALERT_SEVERITY.URGENT)
			.notNull(),
		followUpSeverity: text("follow_up_severity")
			.$type<AlertSeverity>()
			.default(ALERT_SEVERITY.INFO)
			.notNull(),
		futureCallSeverity: text("future_call_severity")
			.$type<AlertSeverity>()
			.default(ALERT_SEVERITY.INFO)
			.notNull(),
		appointmentSeverity: text("appointment_severity")
			.$type<AlertSeverity>()
			.default(ALERT_SEVERITY.INFO)
			.notNull(),
		rescheduledSeverity: text("rescheduled_severity")
			.$type<AlertSeverity>()
			.default(ALERT_SEVERITY.INFO)
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		check(
			"alert_preferences_relevance_mode_check",
			sql`${table.relevanceMode} IN ('condition', 'time')`,
		),
		check(
			"alert_preferences_urgent_threshold_check",
			sql`${table.urgentThresholdHours} >= 0`,
		),
		check(
			"alert_preferences_warning_threshold_check",
			sql`${table.warningThresholdHours} > ${table.urgentThresholdHours}`,
		),
		check(
			"alert_preferences_no_contact_severity_check",
			sql`${table.noContactSeverity} IN ('info', 'warning', 'urgent')`,
		),
		check(
			"alert_preferences_follow_up_severity_check",
			sql`${table.followUpSeverity} IN ('info', 'warning', 'urgent')`,
		),
		check(
			"alert_preferences_future_call_severity_check",
			sql`${table.futureCallSeverity} IN ('info', 'warning', 'urgent')`,
		),
		check(
			"alert_preferences_appointment_severity_check",
			sql`${table.appointmentSeverity} IN ('info', 'warning', 'urgent')`,
		),
		check(
			"alert_preferences_rescheduled_severity_check",
			sql`${table.rescheduledSeverity} IN ('info', 'warning', 'urgent')`,
		),
	],
);

export const alerts = pgTable(
	"alerts",
	{
		id: text("id").primaryKey(),
		leadId: text("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		targetUserId: text("target_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		kind: text("kind").$type<AlertKind>().notNull(),
		message: text("message").notNull(),
		severity: text("severity").$type<AlertSeverity>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		dismissedAt: timestamp("dismissed_at"),
		dismissedBy: text("dismissed_by").references(() => user.id, {
			onDelete: "set null",
		}),
			resolvedAt: timestamp("resolved_at"),
			expiredAt: timestamp("expired_at"),
		intervalMinutes: integer("interval_minutes").notNull(),
		nextShowAt: timestamp("next_show_at").notNull(),
		occurrences: integer("occurrences").default(0).notNull(),
		maxOccurrences: integer("max_occurrences"),
	},
	(table) => [
		index("alerts_targetUserId_idx").on(table.targetUserId),
		index("alerts_nextShowAt_idx").on(table.nextShowAt),
			index("alerts_resolvedAt_idx").on(table.resolvedAt),
			index("alerts_expiredAt_idx").on(table.expiredAt),
	],
);

export const alertsRelations = relations(alerts, ({ one }) => ({
	lead: one(leads, { fields: [alerts.leadId], references: [leads.id] }),
	targetUser: one(user, {
		fields: [alerts.targetUserId],
		references: [user.id],
		relationName: "alertTarget",
	}),
	dismisser: one(user, {
		fields: [alerts.dismissedBy],
		references: [user.id],
		relationName: "alertDismisser",
	}),
}));
