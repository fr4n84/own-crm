import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const callFeedbackUsage = pgTable(
  "call_feedback_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    processedDurationMs: integer("processed_duration_ms").notNull(),
    transcriptionModel: text("transcription_model").notNull(),
    summaryModel: text("summary_model").notNull(),
    estimatedCostMicroUsd: integer("estimated_cost_micro_usd").notNull(),
    pricingVersion: text("pricing_version").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("call_feedback_usage_created_at_idx").on(table.createdAt),
    index("call_feedback_usage_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("call_feedback_usage_lead_idx").on(table.leadId),
  ],
);
