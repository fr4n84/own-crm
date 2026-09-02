import { sql } from "drizzle-orm";
import { check, integer, json, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export type NavigationRoleVisibility = Record<string, string[]>;

export const navigationVisibilitySettings = pgTable(
  "navigation_visibility_settings",
  {
    id: text("id").primaryKey().default("primary"),
    roleIdsByModule: json("role_ids_by_module").$type<NavigationRoleVisibility>().default({}).notNull(),
    version: integer("version").default(1).notNull(),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("navigation_visibility_settings_version_check", sql`${table.version} >= 1`),
  ],
);
