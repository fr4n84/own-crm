import { and, db, desc, eq, isNotNull, isNull, lte, or, sql } from "@crm-fran/db";
import { closerMeetSessions, leads, user } from "@crm-fran/db/schema/index";
import { z } from "zod";

const storedTranscriptSchema = z.object({
  id: z.string().min(1),
  leadId: z.string().min(1),
  closerId: z.string().min(1),
  transcriptResourceName: z.string().regex(/^conferenceRecords\/[^/]+\/transcripts\/[^/]+$/),
  characterCount: z.number().int().nonnegative(),
  encryptionVersion: z.literal("aes-256-gcm-v1"),
  keyId: z.string().min(1),
  nonce: z.string().min(1),
  ciphertext: z.string(),
  authTag: z.string().min(1),
});

export function parseStoredTranscript(row: unknown) {
  const parsed = storedTranscriptSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export const closerMeetRepository = {
  async findById(id: string) {
    const [meeting] = await db.select({ id: closerMeetSessions.id, leadId: closerMeetSessions.leadId, createdById: closerMeetSessions.createdById, calendarEventId: closerMeetSessions.calendarEventId, calendarEventUrl: closerMeetSessions.calendarEventUrl, meetingCode: closerMeetSessions.meetingCode, meetingUri: closerMeetSessions.meetingUri }).from(closerMeetSessions).where(eq(closerMeetSessions.id, id)).limit(1);
    return meeting ?? null;
  },
  async getLeadContext(leadId: string) {
    const [context] = await db.select({ leadId: leads.id, closerId: user.id, closerEmail: user.email, contactEmail: leads.email }).from(leads).innerJoin(user, eq(user.id, leads.closerId)).where(and(eq(leads.id, leadId), isNull(leads.mergedIntoLeadId))).limit(1);
    return context ?? null;
  },
  async listByLead(leadId: string) {
    return db.select({ id: closerMeetSessions.id, status: closerMeetSessions.status, calendarEventUrl: closerMeetSessions.calendarEventUrl, meetingUri: closerMeetSessions.meetingUri, scheduledStart: closerMeetSessions.scheduledStart, scheduledEnd: closerMeetSessions.scheduledEnd, driveExportUri: closerMeetSessions.driveExportUri, hasTranscript: sql<boolean>`${closerMeetSessions.transcriptCiphertext} IS NOT NULL` }).from(closerMeetSessions).where(eq(closerMeetSessions.leadId, leadId)).orderBy(desc(closerMeetSessions.scheduledStart));
  },
  async saveScheduled(meeting: { id: string; leadId: string; closerId: string; createdById: string; status: "scheduled"; calendarEventId: string; calendarEventUrl: string; meetingCode: string; meetingUri: string; scheduledStart: Date; scheduledEnd: Date }) {
    const [saved] = await db.insert(closerMeetSessions).values(meeting).returning({ id: closerMeetSessions.id, leadId: closerMeetSessions.leadId, createdById: closerMeetSessions.createdById, calendarEventId: closerMeetSessions.calendarEventId, calendarEventUrl: closerMeetSessions.calendarEventUrl, meetingCode: closerMeetSessions.meetingCode, meetingUri: closerMeetSessions.meetingUri });
    if (!saved) throw new Error("Closer Meet session was not persisted");
    return saved;
  },
  async listScheduledForRecordingSync(now: Date, limit: number) {
    return db.select({ id: closerMeetSessions.id, meetingCode: closerMeetSessions.meetingCode, conferenceRecordName: closerMeetSessions.conferenceRecordName, recordingResourceName: closerMeetSessions.recordingResourceName, transcriptResourceName: closerMeetSessions.transcriptResourceName, transcriptSha256: closerMeetSessions.transcriptSha256 }).from(closerMeetSessions).where(lte(closerMeetSessions.scheduledEnd, now)).orderBy(desc(closerMeetSessions.scheduledEnd)).limit(limit);
  },
  async saveConferenceRecord(input: { id: string; conferenceRecordName: string; syncedAt: Date }) {
    const [updated] = await db.update(closerMeetSessions).set({ conferenceRecordName: input.conferenceRecordName, lastSyncedAt: input.syncedAt, updatedAt: input.syncedAt }).where(and(eq(closerMeetSessions.id, input.id), isNull(closerMeetSessions.conferenceRecordName))).returning({ id: closerMeetSessions.id });
    return Boolean(updated);
  },
  async touchRecordingSync(id: string, syncedAt: Date) { await db.update(closerMeetSessions).set({ lastSyncedAt: syncedAt, updatedAt: syncedAt }).where(eq(closerMeetSessions.id, id)); },
  async saveEncryptedTranscript(input: { id: string; transcriptResourceName: string; languageCode: string | null; ciphertext: string; nonce: string; authTag: string; encryptionVersion: string; keyId: string; sha256: string; characterCount: number; syncedAt: Date }) {
    const [saved] = await db.update(closerMeetSessions).set({ transcriptResourceName: input.transcriptResourceName, transcriptLanguageCode: input.languageCode, transcriptCiphertext: input.ciphertext, transcriptNonce: input.nonce, transcriptAuthTag: input.authTag, transcriptEncryptionVersion: input.encryptionVersion, transcriptKeyId: input.keyId, transcriptSha256: input.sha256, transcriptCharacterCount: input.characterCount, transcriptSyncedAt: input.syncedAt, transcriptErrorCode: null, transcriptErrorAt: null, updatedAt: input.syncedAt }).where(and(eq(closerMeetSessions.id, input.id), or(sql`${closerMeetSessions.transcriptSha256} IS DISTINCT FROM ${input.sha256}`, sql`${closerMeetSessions.transcriptResourceName} IS DISTINCT FROM ${input.transcriptResourceName}`))).returning({ id: closerMeetSessions.id });
    return Boolean(saved);
  },
  async markTranscriptSyncError(input: { id: string; code: string; at: Date }) { await db.update(closerMeetSessions).set({ transcriptErrorCode: input.code, transcriptErrorAt: input.at, updatedAt: input.at }).where(eq(closerMeetSessions.id, input.id)); },
  async markRecordingReady(input: { id: string; conferenceRecordName: string; recordingResourceName: string; driveFileName: string; driveExportUri: string; recordingDiscoveredAt: Date; syncedAt: Date }) {
    const [updated] = await db.update(closerMeetSessions).set({ status: "recording_ready", conferenceRecordName: input.conferenceRecordName, recordingResourceName: input.recordingResourceName, driveFileName: input.driveFileName, driveExportUri: input.driveExportUri, recordingDiscoveredAt: input.recordingDiscoveredAt, lastSyncedAt: input.syncedAt, updatedAt: input.syncedAt }).where(and(eq(closerMeetSessions.id, input.id), isNull(closerMeetSessions.recordingResourceName))).returning({ id: closerMeetSessions.id });
    return Boolean(updated);
  },
  async findEncryptedTranscript(id: string) {
    const [row] = await db.select({ id: closerMeetSessions.id, leadId: closerMeetSessions.leadId, closerId: closerMeetSessions.closerId, transcriptResourceName: closerMeetSessions.transcriptResourceName, characterCount: closerMeetSessions.transcriptCharacterCount, encryptionVersion: closerMeetSessions.transcriptEncryptionVersion, keyId: closerMeetSessions.transcriptKeyId, nonce: closerMeetSessions.transcriptNonce, ciphertext: closerMeetSessions.transcriptCiphertext, authTag: closerMeetSessions.transcriptAuthTag }).from(closerMeetSessions).where(and(eq(closerMeetSessions.id, id), isNotNull(closerMeetSessions.transcriptCiphertext))).limit(1);
    return parseStoredTranscript(row);
  },
  async listEncryptedTranscriptsByLead(leadId: string, limit: number) {
    const rows = await db.select({ id: closerMeetSessions.id, leadId: closerMeetSessions.leadId, closerId: closerMeetSessions.closerId, transcriptResourceName: closerMeetSessions.transcriptResourceName, characterCount: closerMeetSessions.transcriptCharacterCount, encryptionVersion: closerMeetSessions.transcriptEncryptionVersion, keyId: closerMeetSessions.transcriptKeyId, nonce: closerMeetSessions.transcriptNonce, ciphertext: closerMeetSessions.transcriptCiphertext, authTag: closerMeetSessions.transcriptAuthTag }).from(closerMeetSessions).where(and(eq(closerMeetSessions.leadId, leadId), isNotNull(closerMeetSessions.transcriptCiphertext))).orderBy(desc(closerMeetSessions.scheduledStart)).limit(limit);
    return rows.flatMap((row) => {
      const parsed = parseStoredTranscript(row);
      return parsed ? [parsed] : [];
    });
  },
};



