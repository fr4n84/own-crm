import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const suggestions = pgTable(
  "suggestions",
  {
    id: text("id").primaryKey(),
    body: text("body").notNull(),
    isAnonymous: boolean("is_anonymous").notNull(),
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check("suggestions_body_length_check", sql`char_length(btrim(${table.body})) between 1 and 4000`),
    check("suggestions_anonymous_author_check", sql`not ${table.isAnonymous} or ${table.authorUserId} is null`),
    index("suggestions_created_at_idx").on(table.createdAt),
  ],
);
