import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const closerMeetSessions = pgTable("closer_meet_sessions", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  closerId: text("closer_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  status: text("status").default("scheduled").notNull(),
  calendarEventId: text("calendar_event_id").notNull(),
  calendarEventUrl: text("calendar_event_url").notNull(),
  meetingCode: text("meeting_code").notNull(),
  meetingUri: text("meeting_uri").notNull(),
  conferenceRecordName: text("conference_record_name"),
  recordingResourceName: text("recording_resource_name"),
  driveFileName: text("drive_file_name"),
  driveExportUri: text("drive_export_uri"),
  transcriptResourceName: text("transcript_resource_name"),
  transcriptLanguageCode: text("transcript_language_code"),
  transcriptCiphertext: text("transcript_ciphertext"),
  transcriptNonce: text("transcript_nonce"),
  transcriptAuthTag: text("transcript_auth_tag"),
  transcriptEncryptionVersion: text("transcript_encryption_version"),
  transcriptKeyId: text("transcript_key_id"),
  transcriptSha256: text("transcript_sha256"),
  transcriptCharacterCount: integer("transcript_character_count"),
  transcriptSyncedAt: timestamp("transcript_synced_at", { withTimezone: true }),
  transcriptErrorCode: text("transcript_error_code"),
  transcriptErrorAt: timestamp("transcript_error_at", { withTimezone: true }),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
  scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
  recordingDiscoveredAt: timestamp("recording_discovered_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("closer_meet_sessions_calendar_event_idx").on(table.calendarEventId),
  uniqueIndex("closer_meet_sessions_meeting_code_idx").on(table.meetingCode),
  index("closer_meet_sessions_lead_idx").on(table.leadId, table.scheduledStart),
  index("closer_meet_sessions_closer_idx").on(table.closerId, table.scheduledStart),
  check("closer_meet_sessions_status_check", sql`${table.status} IN ('scheduled','recording_ready','failed')`),
  check("closer_meet_sessions_schedule_check", sql`${table.scheduledEnd} > ${table.scheduledStart}`),
  check("closer_meet_sessions_recording_metadata_check", sql`(${table.recordingResourceName} IS NULL AND ${table.driveFileName} IS NULL AND ${table.driveExportUri} IS NULL) OR (${table.recordingResourceName} IS NOT NULL AND ${table.driveFileName} IS NOT NULL AND ${table.driveExportUri} IS NOT NULL)`),
  check("closer_meet_sessions_transcript_encryption_check", sql`(${table.transcriptResourceName} IS NULL AND ${table.transcriptCiphertext} IS NULL AND ${table.transcriptNonce} IS NULL AND ${table.transcriptAuthTag} IS NULL AND ${table.transcriptEncryptionVersion} IS NULL AND ${table.transcriptKeyId} IS NULL AND ${table.transcriptSha256} IS NULL AND ${table.transcriptCharacterCount} IS NULL AND ${table.transcriptSyncedAt} IS NULL) OR (${table.transcriptResourceName} IS NOT NULL AND ${table.transcriptCiphertext} IS NOT NULL AND ${table.transcriptNonce} IS NOT NULL AND ${table.transcriptAuthTag} IS NOT NULL AND ${table.transcriptEncryptionVersion} IS NOT NULL AND ${table.transcriptKeyId} IS NOT NULL AND ${table.transcriptSha256} IS NOT NULL AND ${table.transcriptCharacterCount} >= 0 AND ${table.transcriptSyncedAt} IS NOT NULL)`),
]);

export const closerMeetSessionRelations = relations(closerMeetSessions, ({ one }) => ({
  lead: one(leads, { fields: [closerMeetSessions.leadId], references: [leads.id] }),
  closer: one(user, { fields: [closerMeetSessions.closerId], references: [user.id], relationName: "closerMeetSessionCloser" }),
  createdBy: one(user, { fields: [closerMeetSessions.createdById], references: [user.id], relationName: "closerMeetSessionCreator" }),
}));


