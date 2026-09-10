import { describe, expect, it, vi } from "vitest";

import { createCloserMeetRecordingSync } from "./recording-sync";

const NOW = new Date("2026-09-20T12:00:00.000Z");

function setup() {
  const repository = {
    listScheduledForRecordingSync: vi.fn().mockResolvedValue([{
      id: "session-1",
      meetingCode: "abc-defg-hij",
      conferenceRecordName: null,
      recordingResourceName: null,
      transcriptResourceName: null,
      transcriptSha256: null,
    }]),
    saveConferenceRecord: vi.fn().mockResolvedValue(true),
    touchRecordingSync: vi.fn().mockResolvedValue(undefined),
    markRecordingReady: vi.fn().mockResolvedValue(true),
    saveEncryptedTranscript: vi.fn().mockResolvedValue(true),
    markTranscriptSyncError: vi.fn().mockResolvedValue(undefined),
  };
  const workspace = {
    findConferenceRecordByMeetingCode: vi.fn().mockResolvedValue({ name: "conferenceRecords/record-1" }),
    listRecordings: vi.fn().mockResolvedValue([{
      resourceName: "conferenceRecords/record-1/recordings/recording-1",
      state: "FILE_GENERATED",
      driveFileName: "files/drive-file-1",
      exportUri: "https://drive.google.com/file/d/drive-file-1/view",
    }]),
    moveRecordingToSharedDrive: vi.fn().mockResolvedValue({
      driveFileName: "files/drive-file-1",
      exportUri: "https://drive.google.com/file/d/drive-file-1/view",
    }),
    getLatestTranscript: vi.fn().mockResolvedValue(null),
  };
  return {
    repository,
    workspace,
    sync: createCloserMeetRecordingSync({ repository, workspace, sharedDriveId: "shared-drive-1", transcriptCipher: { encrypt: vi.fn((text: string) => ({ encryptionVersion: "aes-256-gcm-v1" as const, keyId: "meet-v1", nonce: "nonce", ciphertext: `encrypted:${text.length}`, authTag: "tag" })) } }),
  };
}

describe("Closer Meet recording sync", () => {
  it("discovers the conference, moves a generated recording, and atomically persists metadata only", async () => {
    const { sync, repository, workspace } = setup();

    await expect(sync.run({ now: NOW })).resolves.toEqual({ synced: 1, transcriptsSynced: 0, errors: [] });
    expect(workspace.findConferenceRecordByMeetingCode).toHaveBeenCalledWith("abc-defg-hij");
    expect(repository.saveConferenceRecord).toHaveBeenCalledWith({
      id: "session-1",
      conferenceRecordName: "conferenceRecords/record-1",
      syncedAt: NOW,
    });
    expect(workspace.moveRecordingToSharedDrive).toHaveBeenCalledWith("files/drive-file-1", "shared-drive-1");
    expect(repository.markRecordingReady).toHaveBeenCalledWith({
      id: "session-1",
      conferenceRecordName: "conferenceRecords/record-1",
      recordingResourceName: "conferenceRecords/record-1/recordings/recording-1",
      driveFileName: "files/drive-file-1",
      driveExportUri: "https://drive.google.com/file/d/drive-file-1/view",
      recordingDiscoveredAt: NOW,
      syncedAt: NOW,
    });
    expect(repository.markRecordingReady.mock.calls[0]?.[0]).not.toHaveProperty("deleteAfter");
    expect(repository.markRecordingReady.mock.calls[0]?.[0]).not.toHaveProperty("video");
    expect(repository.markRecordingReady.mock.calls[0]?.[0]).not.toHaveProperty("transcript");
  });

  it("leaves a scheduled session retryable when moving the recording fails", async () => {
    const { sync, repository, workspace } = setup();
    workspace.moveRecordingToSharedDrive.mockRejectedValue(new Error("Drive unavailable"));

    await expect(sync.run({ now: NOW })).resolves.toEqual({
      synced: 0,
      transcriptsSynced: 0,
      errors: [{ sessionId: "session-1", stage: "recording_sync", message: "Drive unavailable" }],
    });
    expect(repository.markRecordingReady).not.toHaveBeenCalled();
  });

  it("records a sync attempt without moving while the recording is not generated", async () => {
    const { sync, repository, workspace } = setup();
    workspace.listRecordings.mockResolvedValue([{
      resourceName: "conferenceRecords/record-1/recordings/recording-1",
      state: "PROCESSING",
      driveFileName: null,
      exportUri: null,
    }]);

    await expect(sync.run({ now: NOW })).resolves.toEqual({ synced: 0, transcriptsSynced: 0, errors: [] });
    expect(repository.touchRecordingSync).toHaveBeenCalledWith("session-1", NOW);
    expect(workspace.moveRecordingToSharedDrive).not.toHaveBeenCalled();
  });
  it("stores ciphertext metadata without plaintext and skips an unchanged transcript", async () => {
    const { sync, repository, workspace } = setup();
    workspace.getLatestTranscript.mockResolvedValue({ resourceName: "conferenceRecords/record-1/transcripts/transcript-1", text: "sensitive words", languageCode: "es-ES", entryCount: 1 });
    await expect(sync.run({ now: NOW })).resolves.toMatchObject({ transcriptsSynced: 1 });
    expect(repository.saveEncryptedTranscript).toHaveBeenCalledWith(expect.objectContaining({ transcriptResourceName: "conferenceRecords/record-1/transcripts/transcript-1", languageCode: "es-ES", characterCount: 15, ciphertext: "encrypted:15" }));
    expect(JSON.stringify(repository.saveEncryptedTranscript.mock.calls)).not.toContain("sensitive words");

    repository.listScheduledForRecordingSync.mockResolvedValue([{ id: "session-1", meetingCode: "abc-defg-hij", conferenceRecordName: "conferenceRecords/record-1", recordingResourceName: "recording-1", transcriptResourceName: "conferenceRecords/record-1/transcripts/transcript-1", transcriptSha256: repository.saveEncryptedTranscript.mock.calls[0]?.[0].sha256 }]);
    repository.saveEncryptedTranscript.mockClear();
    await sync.run({ now: NOW });
    expect(repository.saveEncryptedTranscript).not.toHaveBeenCalled();
  });

  it("keeps recording success when transcript synchronization fails and returns no sensitive text", async () => {
    const { sync, repository, workspace } = setup();
    workspace.getLatestTranscript.mockRejectedValue(new Error("provider payload included secret words"));
    const result = await sync.run({ now: NOW });
    expect(result.synced).toBe(1);
    expect(result.errors).toContainEqual({ sessionId: "session-1", stage: "transcript_sync", message: "Transcript synchronization failed" });
    expect(JSON.stringify(result)).not.toContain("secret words");
    expect(repository.markRecordingReady).toHaveBeenCalled();
    expect(repository.markTranscriptSyncError).toHaveBeenCalledWith({ id: "session-1", code: "provider_error", at: NOW });
  });
});



