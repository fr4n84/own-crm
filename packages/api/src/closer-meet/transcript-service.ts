import type { Permission } from "@crm-fran/db/schema/auth";

import { coachingAnalysisDraftSchema, type CoachingAnalysisDraft } from "../commercial-coaching/domain";
import type { EncryptedTranscript } from "./transcript-crypto";

export const MAX_TRANSCRIPTS_PER_ANALYSIS = 5;
export const MAX_ANALYSIS_CHARACTERS = 100_000;

type StoredTranscript = EncryptedTranscript & { id: string; leadId: string; closerId: string; transcriptResourceName: string; characterCount: number };
type TranscriptRepository = {
  findEncryptedTranscript(id: string): Promise<StoredTranscript | null>;
  listEncryptedTranscriptsByLead(leadId: string, limit: number): Promise<StoredTranscript[]>;
};
type TranscriptCipher = { decrypt(value: EncryptedTranscript, context: { sessionId: string; transcriptResourceName: string }): string };
type TranscriptAnalyzer = { analyze(transcripts: string[]): Promise<CoachingAnalysisDraft> };
type RecordDraft = (input: { actorId: string; analyzedUserId: string; leadId: string; role: "closer"; draft: CoachingAnalysisDraft; permissions: readonly Permission[] }) => Promise<{ id: string }>;

export class TranscriptAccessError extends Error {}

function canAccess(row: StoredTranscript, actorId: string, permissions: readonly Permission[]) {
  return row.closerId === actorId || permissions.includes("*");
}

export function createCloserMeetTranscriptService(input: { repository: TranscriptRepository; cipher: TranscriptCipher; analyzer: TranscriptAnalyzer; recordDraft: RecordDraft }) {
  return {
    async read(command: { sessionId: string; actorId: string; permissions: readonly Permission[] }) {
      const row = await input.repository.findEncryptedTranscript(command.sessionId);
      if (!row) return null;
      if (!canAccess(row, command.actorId, command.permissions)) throw new TranscriptAccessError("Transcript access is private");
      return { sessionId: row.id, transcript: input.cipher.decrypt(row, { sessionId: row.id, transcriptResourceName: row.transcriptResourceName }), characterCount: row.characterCount };
    },
    async analyzeLead(command: { leadId: string; actorId: string; permissions: readonly Permission[] }) {
      const rows = await input.repository.listEncryptedTranscriptsByLead(command.leadId, MAX_TRANSCRIPTS_PER_ANALYSIS);
      if (rows.length === 0) throw new Error("No stored transcripts are available");
      if (rows.some((row) => !canAccess(row, command.actorId, command.permissions))) throw new TranscriptAccessError("Transcript analysis is private");
      if (new Set(rows.map((row) => row.closerId)).size !== 1) throw new Error("Transcript analysis requires recordings from a single Closer");

      const transcripts: string[] = [];
      let characters = 0;
      for (const row of rows) {
        const plaintext = input.cipher.decrypt(row, { sessionId: row.id, transcriptResourceName: row.transcriptResourceName });
        characters += plaintext.length;
        if (characters > MAX_ANALYSIS_CHARACTERS) throw new Error("Transcript analysis character limit exceeded");
        transcripts.push(plaintext);
      }

      const draft = coachingAnalysisDraftSchema.parse(await input.analyzer.analyze(transcripts));
      if (!draft.requiresPersonalReview) throw new Error("Generated coaching drafts require personal review");
      const created = await input.recordDraft({ actorId: command.actorId, analyzedUserId: rows[0]!.closerId, leadId: command.leadId, role: "closer", draft, permissions: command.permissions });
      return { analysisId: created.id, status: "draft" as const, requiresHumanReview: true as const };
    },
  };
}