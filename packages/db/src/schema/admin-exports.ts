import { sql } from "drizzle-orm";
import { boolean, check, json, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const adminDataExports = pgTable("admin_data_exports", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  filters: json("filters").$type<{ from: string; to: string; currency: string; includePii: boolean }>().notNull(),
  includesPii: boolean("includes_pii").notNull(),
  fileName: text("file_name").notNull(),
  archiveSha256: text("archive_sha256").notNull(),
  rowCounts: json("row_counts").$type<Record<string, number>>().notNull(),
  policyVersion: text("policy_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("admin_data_exports_hash_check", sql`${table.archiveSha256} ~ '^[0-9a-f]{64}$'`),
  check("admin_data_exports_policy_check", sql`NULLIF(BTRIM(${table.policyVersion}), '') IS NOT NULL`),
]);
