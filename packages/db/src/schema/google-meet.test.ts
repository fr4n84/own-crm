import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { closerMeetSessions } from "./index";

describe("Closer Meet persistence", () => {
  it("stores permanent private provider references without media contents or retention state", () => {
    expect(closerMeetSessions.leadId).toBeDefined();
    expect(closerMeetSessions.closerId).toBeDefined();
    expect(closerMeetSessions.calendarEventId).toBeDefined();
    expect(closerMeetSessions.meetingUri).toBeDefined();
    expect(closerMeetSessions.recordingResourceName).toBeDefined();
    expect(closerMeetSessions.driveFileName).toBeDefined();
    expect(closerMeetSessions.driveExportUri).toBeDefined();
    expect("retentionDays" in closerMeetSessions).toBe(false);
    expect("deleteAfter" in closerMeetSessions).toBe(false);
    expect("video" in closerMeetSessions).toBe(false);
    expect("audio" in closerMeetSessions).toBe(false);
    expect(closerMeetSessions.transcriptCiphertext).toBeDefined();
    expect(closerMeetSessions.transcriptNonce).toBeDefined();
    expect(closerMeetSessions.transcriptAuthTag).toBeDefined();
    expect(closerMeetSessions.transcriptSha256).toBeDefined();
    expect("transcript" in closerMeetSessions).toBe(false);
  });

  it("generates metadata consistency constraints without expiry policy or applying the migration", () => {
    const migration = readFileSync(
      fileURLToPath(new URL("../migrations/0046_encrypted_meet_transcripts.sql", import.meta.url)),
      "utf8",
    );

    expect(migration).toContain("closer_meet_sessions_recording_metadata_check");
    expect(migration).not.toContain("retention_days");
    expect(migration).not.toContain("delete_after");
    expect(migration).not.toContain("expired");
    expect(migration).toContain("closer_meet_sessions_transcript_encryption_check");
    expect(migration).not.toContain('"transcript" text');
    expect(migration).not.toContain("bytea");
  });
});



