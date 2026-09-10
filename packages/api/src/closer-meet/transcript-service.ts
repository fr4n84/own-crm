import type { Permission } from "@crm-fran/db/schema/auth";
import type { EncryptedTranscript } from "./transcript-crypto";

export const MAX_TRANSCRIPTS_PER_ANALYSIS = 5;
export const MAX_ANALYSIS_CHARACTERS = 100_000;

type StoredTranscript = EncryptedTranscript & { id: string; leadId: string; closerId: string; transcriptResourceName: string; characterCount: number };
type TranscriptRepository = {
  findEncryptedTranscript(id: string): Promise<StoredTranscript | null>;
  listEncryptedTranscriptsByLead(leadId: string, limit: number): Promise<StoredTranscript[]>;
};
type TranscriptCipher = { decrypt(value: EncryptedTranscript, context: { sessionId: string; transcriptResourceName: string }): string };
type TranscriptAnalyzer = { analyze(transcripts: string[]): Promise<{ summary: string; patterns: string[]; uncertainties: string[]; requiresHumanReview: true }> };

export class TranscriptAccessError extends Error {}
function canAccess(row: StoredTranscript, actorId: string, permissions: readonly Permission[]) {
  return row.closerId === actorId || permissions.includes("*") || permissions.includes("coaching:*") || permissions.includes("coaching:read");
}

export function createCloserMeetTranscriptService(input: { repository: TranscriptRepository; cipher: TranscriptCipher; analyzer: TranscriptAnalyzer }) {
  return {
    async read(command: { sessionId: string; actorId: string; permissions: readonly Permission[] }) {
      const row = await input.repository.findEncryptedTranscript(command.sessionId);
      if (!row) return null;
      if (!canAccess(row, command.actorId, command.permissions)) throw new TranscriptAccessError("Transcript access is private");
      return { sessionId: row.id, transcript: input.cipher.decrypt(row, { sessionId: row.id, transcriptResourceName: row.transcriptResourceName }), characterCount: row.characterCount };
    },
    async analyzeLead(command: { leadId: string; actorId: string; permissions: readonly Permission[] }) {
      const rows = await input.repository.listEncryptedTranscriptsByLead(command.leadId, MAX_TRANSCRIPTS_PER_ANALYSIS);
      if (rows.some((row) => !canAccess(row, command.actorId, command.permissions))) throw new TranscriptAccessError("Transcript analysis is private");
      const transcripts: string[] = [];
      let characters = 0;
      for (const row of rows) {
        const plaintext = input.cipher.decrypt(row, { sessionId: row.id, transcriptResourceName: row.transcriptResourceName });
        characters += plaintext.length;
        if (characters > MAX_ANALYSIS_CHARACTERS) throw new Error("Transcript analysis character limit exceeded");
        transcripts.push(plaintext);
      }
      if (transcripts.length === 0) throw new Error("No stored transcripts are available");
      return input.analyzer.analyze(transcripts);
    },
  };
}

