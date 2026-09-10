import { createHash } from "node:crypto";
import type { EncryptedTranscript } from "./transcript-crypto";

type PendingRecordingSession = {
  id: string;
  meetingCode: string;
  conferenceRecordName: string | null;
  recordingResourceName: string | null;
  transcriptResourceName: string | null;
  transcriptSha256: string | null;
};

type RecordingSyncRepository = {
  listScheduledForRecordingSync(now: Date, limit: number): Promise<PendingRecordingSession[]>;
  saveConferenceRecord(input: { id: string; conferenceRecordName: string; syncedAt: Date }): Promise<boolean>;
  touchRecordingSync(id: string, syncedAt: Date): Promise<void>;
  markRecordingReady(input: { id: string; conferenceRecordName: string; recordingResourceName: string; driveFileName: string; driveExportUri: string; recordingDiscoveredAt: Date; syncedAt: Date }): Promise<boolean>;
  saveEncryptedTranscript(input: EncryptedTranscript & { id: string; transcriptResourceName: string; languageCode: string | null; sha256: string; characterCount: number; syncedAt: Date }): Promise<boolean>;
  markTranscriptSyncError(input: { id: string; code: "provider_error" | "invalid_payload" | "limit_exceeded" | "encryption_error"; at: Date }): Promise<void>;
};

type RecordingSyncWorkspace = {
  findConferenceRecordByMeetingCode(meetingCode: string): Promise<{ name: string } | null>;
  listRecordings(conferenceRecordName: string): Promise<Array<{ resourceName: string; state: string; driveFileName: string | null; exportUri: string | null }>>;
  moveRecordingToSharedDrive(driveFileName: string, sharedDriveId: string): Promise<{ driveFileName: string; exportUri: string }>;
  getLatestTranscript(conferenceRecordName: string): Promise<{ resourceName: string; text: string; languageCode: string | null; entryCount: number } | null>;
};

type TranscriptCipher = { encrypt(plaintext: string, context: { sessionId: string; transcriptResourceName: string }): EncryptedTranscript };
type RecordingSyncError = { sessionId: string; stage: "recording_sync" | "transcript_sync"; message: string };
const DEFAULT_BATCH_SIZE = 25;

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Unknown recording sync failure"; }
function transcriptErrorCode(error: unknown): "provider_error" | "invalid_payload" | "limit_exceeded" | "encryption_error" {
  const message = errorMessage(error);
  if (message.includes("limit exceeded") || message.includes("pagination cycle")) return "limit_exceeded";
  if (message.includes("Zod") || message.includes("Invalid")) return "invalid_payload";
  if (message.includes("encrypt") || message.includes("key")) return "encryption_error";
  return "provider_error";
}

export function createCloserMeetRecordingSync(input: { repository: RecordingSyncRepository; workspace: RecordingSyncWorkspace; sharedDriveId: string; transcriptCipher: TranscriptCipher }) {
  return {
    async run(command: { now: Date; limit?: number }) {
      const limit = command.limit ?? DEFAULT_BATCH_SIZE;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Recording sync batch limit must be an integer between 1 and 100");
      let synced = 0;
      let transcriptsSynced = 0;
      const errors: RecordingSyncError[] = [];
      const pending = await input.repository.listScheduledForRecordingSync(command.now, limit);

      for (const session of pending) {
        const discoveredConference = session.conferenceRecordName
          ? { name: session.conferenceRecordName }
          : await input.workspace.findConferenceRecordByMeetingCode(session.meetingCode).catch((error) => {
            errors.push({ sessionId: session.id, stage: "recording_sync", message: errorMessage(error) });
            return null;
          });
        if (!discoveredConference) { await input.repository.touchRecordingSync(session.id, command.now); continue; }
        if (!session.conferenceRecordName) await input.repository.saveConferenceRecord({ id: session.id, conferenceRecordName: discoveredConference.name, syncedAt: command.now });

        if (!session.recordingResourceName) {
          try {
            const recordings = await input.workspace.listRecordings(discoveredConference.name);
            const generated = recordings.filter((recording) => recording.state === "FILE_GENERATED" && recording.driveFileName !== null && recording.exportUri !== null).at(-1);
            if (generated?.driveFileName) {
              const moved = await input.workspace.moveRecordingToSharedDrive(generated.driveFileName, input.sharedDriveId);
              const didPersist = await input.repository.markRecordingReady({ id: session.id, conferenceRecordName: discoveredConference.name, recordingResourceName: generated.resourceName, driveFileName: moved.driveFileName, driveExportUri: moved.exportUri, recordingDiscoveredAt: command.now, syncedAt: command.now });
              if (didPersist) synced += 1;
            } else {
              await input.repository.touchRecordingSync(session.id, command.now);
            }
          } catch (error) {
            errors.push({ sessionId: session.id, stage: "recording_sync", message: errorMessage(error) });
          }
        }

        try {
          const transcript = await input.workspace.getLatestTranscript(discoveredConference.name);
          if (!transcript) continue;
          const sha256 = createHash("sha256").update(transcript.text, "utf8").digest("hex");
          if (session.transcriptResourceName === transcript.resourceName && session.transcriptSha256 === sha256) continue;
          const encrypted = input.transcriptCipher.encrypt(transcript.text, { sessionId: session.id, transcriptResourceName: transcript.resourceName });
          const didPersist = await input.repository.saveEncryptedTranscript({ id: session.id, transcriptResourceName: transcript.resourceName, languageCode: transcript.languageCode, sha256, characterCount: transcript.text.length, syncedAt: command.now, ...encrypted });
          if (didPersist) transcriptsSynced += 1;
        } catch (error) {
          await input.repository.markTranscriptSyncError({ id: session.id, code: transcriptErrorCode(error), at: command.now });
          errors.push({ sessionId: session.id, stage: "transcript_sync", message: "Transcript synchronization failed" });
        }
      }
      return { synced, transcriptsSynced, errors };
    },
  };
}




