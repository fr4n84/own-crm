import { env } from "@crm-fran/env/server";
import { createGoogleWorkspaceRecordingSyncContextFromEnv } from "../google-workspace/runtime";
import { closerMeetRepository } from "./repository";
import { createCloserMeetRecordingSync } from "./recording-sync";
import { createTranscriptCipher } from "./transcript-crypto";

export function createCloserMeetRecordingSyncRuntime() {
  const workspaceContext = createGoogleWorkspaceRecordingSyncContextFromEnv();
  if (!workspaceContext || !env.CLOSER_MEET_TRANSCRIPT_KEY || !env.CLOSER_MEET_TRANSCRIPT_KEY_ID) return null;

  const sync = createCloserMeetRecordingSync({
    repository: closerMeetRepository,
    workspace: workspaceContext.workspace,
    sharedDriveId: workspaceContext.sharedDriveId,
    transcriptCipher: createTranscriptCipher({ base64Key: env.CLOSER_MEET_TRANSCRIPT_KEY, keyId: env.CLOSER_MEET_TRANSCRIPT_KEY_ID }),
  });
  return {
    run(now = new Date()) {
      return sync.run({ now });
    },
  };
}

