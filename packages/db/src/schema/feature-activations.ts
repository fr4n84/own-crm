import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const FEATURE_ACTIVATION = {
  CALLER_SINGLE_UNWORKED_LEAD: "caller_single_unworked_lead",
} as const;

export const featureActivations = pgTable("feature_activations", {
  key: text("key").primaryKey(),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull(),
});
