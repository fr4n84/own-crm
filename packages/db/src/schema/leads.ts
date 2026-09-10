import { relations, sql } from "drizzle-orm";
import {
	check,
  index,
  integer,
  pgTable,
  text,
  json,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { LEAD_STATE, type LeadState } from "./state";

export const LEAD_QA_ROLE = {
  CALLER: "caller",
  CLOSER: "closer",
} as const;

export const LEAD_TYPE = {
	MAESTRA: "maestra",
	VSL: "vsl",
} as const;

export const LEAD_POOL_STATUS = {
  NEW: "new",
  RECOVERED: "recovered",
  DISCARDED: "discarded",
} as const;

export type LeadType = (typeof LEAD_TYPE)[keyof typeof LEAD_TYPE];
export type LeadPoolStatus =
  (typeof LEAD_POOL_STATUS)[keyof typeof LEAD_POOL_STATUS];

export type LeadQARole = (typeof LEAD_QA_ROLE)[keyof typeof LEAD_QA_ROLE];

export type LeadQASessionItem = {
  questionKey: string;
  question: string;
  answer: string;
  authorRole: LeadQARole;
  authorId: string | null;
};

export type LeadQASession = LeadQASessionItem[];

export const leads = pgTable("leads", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
	    email: text("email"),
	    normalizedEmail: text("normalized_email"),
	    phone: text("phone").notNull(),
	    normalizedPhone: text("normalized_phone"),
	    source: text("source"),
	    campaign: text("campaign"),
	    ad: text("ad"),
	    creative: text("creative"),
	    acquisitionAngle: text("acquisition_angle"),
	    utmContent: text("utm_content"),
	type: text("type")
		.$type<LeadType>()
		.default(LEAD_TYPE.MAESTRA)
		.notNull(),
    questions: json("questions")
      .$type<LeadQASession>()
      .default([])
      .notNull(),
    state: text("state")
      .default(LEAD_STATE.SIN_ASIGNAR)
      .$type<LeadState>()
      .notNull(),
    callerId: text("caller_id").references(() => user.id, { onDelete: "set null" }),
    callerAssignedAt: timestamp("caller_assigned_at", { withTimezone: true }),
    closerId: text("closer_id").references(() => user.id, { onDelete: "set null" }),
    mergedIntoLeadId: text("merged_into_lead_id").references(
      (): AnyPgColumn => leads.id,
      { onDelete: "restrict" },
    ),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergedById: text("merged_by_id").references(() => user.id, { onDelete: "restrict" }),
    poolStatus: text("pool_status")
      .$type<LeadPoolStatus>()
      .default(LEAD_POOL_STATUS.NEW)
      .notNull(),
    noContactImpactCount: integer("no_contact_impact_count").default(0).notNull(),
    whatsappCallerId: text("whatsapp_caller_id").references(() => user.id, { onDelete: "set null" }),
    whatsappSentAt: timestamp("whatsapp_sent_at", { withTimezone: true }),
    whatsappSentById: text("whatsapp_sent_by_id").references(() => user.id, { onDelete: "set null" }),
    response: text("response").default("sin asignar").notNull(),
    feedback: text("feedback").default("sin asignar").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
}, (table) => [
  index("leads_whatsapp_caller_idx").on(table.whatsappCallerId),
	index("leads_normalized_email_idx").on(table.normalizedEmail),
	index("leads_normalized_phone_idx").on(table.normalizedPhone),
	index("leads_merged_into_idx").on(table.mergedIntoLeadId),
	check("leads_merge_shape_check", sql`(${table.mergedIntoLeadId} IS NULL AND ${table.mergedAt} IS NULL AND ${table.mergedById} IS NULL) OR (${table.mergedIntoLeadId} IS NOT NULL AND ${table.mergedAt} IS NOT NULL AND ${table.mergedById} IS NOT NULL AND ${table.mergedIntoLeadId} <> ${table.id})`),
	check("leads_type_check", sql`${table.type} IN ('maestra', 'vsl')`),
	check(
    "leads_pool_status_check",
    sql`${table.poolStatus} IN ('new', 'recovered', 'discarded')`,
  ),
	check(
    "leads_no_contact_impact_count_check",
    sql`${table.noContactImpactCount} BETWEEN 0 AND 3`,
  ),
	check(
    "leads_whatsapp_sent_pair_check",
    sql`${table.whatsappSentAt} IS NOT NULL OR ${table.whatsappSentById} IS NULL`,
  ),
])

export const leadsRelations = relations(leads, ({ one }) => ({
    caller: one(user, {
        fields: [leads.callerId],
        references: [user.id],
        relationName: "caller"
    }),
    closer: one(user, {
        fields: [leads.closerId],
        references: [user.id],
        relationName: "closer"
    }),
    whatsappSentBy: one(user, {
        fields: [leads.whatsappSentById],
        references: [user.id],
        relationName: "whatsappSentBy"
    }),
}))
