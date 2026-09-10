import { relations, sql } from "drizzle-orm";
import { boolean, check, index, json, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export type CoachingCriterionRecord = { key: string; rating: "strength" | "improve" | "unknown"; evidenceSignals: string[]; recommendation: string };

export const commercialCoachingRubrics = pgTable("commercial_coaching_rubrics", {
  id: text("id").primaryKey(), version: text("version").notNull(), role: text("role").notNull(), product: text("product"), campaign: text("campaign"),
  criteria: json("criteria").$type<{ key: string; label: string }[]>().notNull(), active: boolean("active").default(true).notNull(),
  createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("commercial_coaching_rubrics_scope_idx").on(table.role, table.product, table.campaign, table.active), check("commercial_coaching_rubrics_role_check", sql`${table.role} IN ('caller','closer')`)]);

export const commercialCoachingAnalyses = pgTable("commercial_coaching_analyses", {
  id: text("id").primaryKey(), rubricId: text("rubric_id").notNull().references(() => commercialCoachingRubrics.id, { onDelete: "restrict" }), rubricVersion: text("rubric_version").notNull(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }), analyzedUserId: text("analyzed_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  role: text("role").notNull(), product: text("product"), campaign: text("campaign"), status: text("status").default("draft").notNull(),
  criteria: json("criteria").$type<CoachingCriterionRecord[]>().notNull(), summary: text("summary").notNull(), requiresPersonalReview: boolean("requires_personal_review").default(false).notNull(), reviewReasons: json("review_reasons").$type<string[]>().default([]).notNull(),
  excludedFromCompensation: boolean("excluded_from_compensation").default(true).notNull(), excludedFromAutomaticAssignment: boolean("excluded_from_automatic_assignment").default(true).notNull(), disciplinaryUseProhibited: boolean("disciplinary_use_prohibited").default(true).notNull(),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }), reviewedById: text("reviewed_by_id").references(() => user.id, { onDelete: "set null" }), reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("commercial_coaching_analyses_user_idx").on(table.analyzedUserId, table.createdAt), index("commercial_coaching_analyses_status_idx").on(table.status, table.createdAt),
  check("commercial_coaching_analyses_role_check", sql`${table.role} IN ('caller','closer')`), check("commercial_coaching_analyses_status_check", sql`${table.status} IN ('draft','confirmed','discarded')`),
  check("commercial_coaching_non_punitive_check", sql`${table.excludedFromCompensation} AND ${table.excludedFromAutomaticAssignment} AND ${table.disciplinaryUseProhibited}`),
]);

export const commercialCoachingRubricRelations = relations(commercialCoachingRubrics, ({ many }) => ({ analyses: many(commercialCoachingAnalyses) }));
export const commercialCoachingAnalysisRelations = relations(commercialCoachingAnalyses, ({ one }) => ({
  rubric: one(commercialCoachingRubrics, { fields: [commercialCoachingAnalyses.rubricId], references: [commercialCoachingRubrics.id] }), lead: one(leads, { fields: [commercialCoachingAnalyses.leadId], references: [leads.id] }),
  analyzedUser: one(user, { fields: [commercialCoachingAnalyses.analyzedUserId], references: [user.id], relationName: "coachingAnalyzedUser" }), createdBy: one(user, { fields: [commercialCoachingAnalyses.createdById], references: [user.id], relationName: "coachingCreator" }), reviewedBy: one(user, { fields: [commercialCoachingAnalyses.reviewedById], references: [user.id], relationName: "coachingReviewer" }),
}));
