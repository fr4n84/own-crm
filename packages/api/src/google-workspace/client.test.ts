import { describe, expect, it, vi } from "vitest";

import { GoogleWorkspaceClient, buildCloserCalendarEvent } from "./client";

describe("GoogleWorkspaceClient", () => {
  it("creates a private CRM-linked Calendar event with a unique Meet request", () => {
    const event = buildCloserCalendarEvent({
      leadId: "lead-1",
      closerId: "closer-1",
      closerEmail: "closer@example.com",
      contactEmail: "contact@example.com",
      startsAt: new Date("2026-09-10T08:00:00.000Z"),
      durationMinutes: 45,
      requestId: "crm-lead-1-20260910",
    });

    expect(event).toMatchObject({
      summary: "Closer call",
      start: { dateTime: "2026-09-10T08:00:00.000Z", timeZone: "Europe/Madrid" },
      end: { dateTime: "2026-09-10T08:45:00.000Z", timeZone: "Europe/Madrid" },
      attendees: [{ email: "closer@example.com" }, { email: "contact@example.com" }],
      conferenceData: { createRequest: { requestId: "crm-lead-1-20260910", conferenceSolutionKey: { type: "hangoutsMeet" } } },
      extendedProperties: { private: { crmLeadId: "lead-1", crmCloserId: "closer-1" } },
    });
  });

  it("enables automatic recording and transcription and returns only recording metadata", async () => {
    const authorizedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "event-1",
        htmlLink: "https://calendar.google.com/event?eid=event-1",
        conferenceData: { conferenceId: "abc-defg-hij", entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "spaces/abc-defg-hij" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        recordings: [{
          name: "conferenceRecords/record-1/recordings/recording-1",
          state: "FILE_GENERATED",
          driveDestination: { file: "files/drive-file-1", exportUri: "https://drive.google.com/file/d/drive-file-1/view" },
        }],
      }), { status: 200 }));

    const client = new GoogleWorkspaceClient({ authorizedFetch, calendarId: "primary" });
    const created = await client.createCloserMeeting({
      leadId: "lead-1",
      closerId: "closer-1",
      closerEmail: "closer@example.com",
      contactEmail: null,
      startsAt: new Date("2026-09-10T08:00:00.000Z"),
      durationMinutes: 45,
      requestId: "request-1",
    });
    const recordings = await client.listRecordings("conferenceRecords/record-1");

    expect(created).toEqual({
      calendarEventId: "event-1",
      calendarEventUrl: "https://calendar.google.com/event?eid=event-1",
      meetingCode: "abc-defg-hij",
      meetingUri: "https://meet.google.com/abc-defg-hij",
    });
    expect(authorizedFetch).toHaveBeenNthCalledWith(
      2,
      "https://meet.googleapis.com/v2/spaces/abc-defg-hij?updateMask=config.artifactConfig.recordingConfig.autoRecordingGeneration%2Cconfig.artifactConfig.transcriptionConfig.autoTranscriptionGeneration",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ config: { artifactConfig: { recordingConfig: { autoRecordingGeneration: "ON" }, transcriptionConfig: { autoTranscriptionGeneration: "ON" } } } }),
      }),
    );
    expect(recordings).toEqual([{
      resourceName: "conferenceRecords/record-1/recordings/recording-1",
      state: "FILE_GENERATED",
      driveFileName: "files/drive-file-1",
      exportUri: "https://drive.google.com/file/d/drive-file-1/view",
    }]);
  });

  it("collects transcript entries in chronological pages with hard limits", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [{ name: "conferenceRecords/record-1/transcripts/transcript-1", startTime: "2026-09-10T08:00:00.000Z" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcriptEntries: [{ name: "entry-1", text: "Hola", languageCode: "es-ES", startTime: "2026-09-10T08:00:01.000Z", endTime: "2026-09-10T08:00:02.000Z" }], nextPageToken: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcriptEntries: [{ name: "entry-2", text: "Adios", languageCode: "es-ES", startTime: "2026-09-10T08:00:03.000Z", endTime: "2026-09-10T08:00:04.000Z" }] }), { status: 200 }));
    const client = new GoogleWorkspaceClient({ authorizedFetch, calendarId: "primary" });
    await expect(client.getLatestTranscript("conferenceRecords/record-1", { maxPages: 2, maxEntries: 2, maxCharacters: 20 })).resolves.toEqual({ resourceName: "conferenceRecords/record-1/transcripts/transcript-1", text: "Hola\nAdios", languageCode: "es-ES", entryCount: 2 });
    expect(authorizedFetch).toHaveBeenNthCalledWith(3, expect.stringContaining("pageToken=next"));
  });

  it("follows bounded transcript resource pagination before loading entries", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [], nextPageToken: "resources-next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [{ name: "conferenceRecords/record-1/transcripts/transcript-2", startTime: "2026-09-10T09:00:00.000Z" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcriptEntries: [{ name: "entry-1", text: "Hola", startTime: "2026-09-10T09:00:01.000Z", endTime: "2026-09-10T09:00:02.000Z" }] }), { status: 200 }));
    const client = new GoogleWorkspaceClient({ authorizedFetch, calendarId: "primary" });
    await expect(client.getLatestTranscript("conferenceRecords/record-1", { maxPages: 2, maxEntries: 2, maxCharacters: 20 })).resolves.toMatchObject({ resourceName: "conferenceRecords/record-1/transcripts/transcript-2", text: "Hola" });
    expect(authorizedFetch).toHaveBeenNthCalledWith(2, expect.stringContaining("pageToken=resources-next"));
  });
  it("fails closed when transcript pagination exceeds its bound", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [{ name: "conferenceRecords/record-1/transcripts/transcript-1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcriptEntries: [], nextPageToken: "next" }), { status: 200 }));
    const client = new GoogleWorkspaceClient({ authorizedFetch, calendarId: "primary" });
    await expect(client.getLatestTranscript("conferenceRecords/record-1", { maxPages: 1, maxEntries: 100, maxCharacters: 100 })).rejects.toThrow("Transcript page limit exceeded");
  });
  it("polls the Calendar event while Meet conference provisioning is pending", async () => {
    const authorizedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "event-1",
        htmlLink: "https://calendar.google.com/event?eid=event-1",
        conferenceData: { createRequest: { status: { statusCode: "pending" } } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "event-1",
        htmlLink: "https://calendar.google.com/event?eid=event-1",
        conferenceData: {
          conferenceId: "abc-defg-hij",
          entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
          createRequest: { status: { statusCode: "success" } },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "spaces/abc-defg-hij" }), { status: 200 }));

    const client = new GoogleWorkspaceClient({
      authorizedFetch,
      calendarId: "primary",
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(client.createCloserMeeting({
      leadId: "lead-1",
      closerId: "closer-1",
      closerEmail: "closer@example.com",
      contactEmail: null,
      startsAt: new Date("2026-09-10T08:00:00.000Z"),
      durationMinutes: 45,
      requestId: "request-1",
    })).resolves.toMatchObject({
      calendarEventId: "event-1",
      meetingCode: "abc-defg-hij",
    });

    expect(authorizedFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/events/event-1"),
    );
  });

  it("fails closed when Calendar has not produced a Meet conference yet", async () => {
    const client = new GoogleWorkspaceClient({
      authorizedFetch: vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: "event-1", conferenceData: { createRequest: { status: { statusCode: "pending" } } } }), { status: 200 })),
      calendarId: "primary",
    });

    await expect(client.createCloserMeeting({
      leadId: "lead-1",
      closerId: "closer-1",
      closerEmail: "closer@example.com",
      contactEmail: null,
      startsAt: new Date("2026-09-10T08:00:00.000Z"),
      durationMinutes: 45,
      requestId: "request-1",
    })).rejects.toThrow("Google Meet conference is still being provisioned");
  });

  it("moves a generated recording into the configured Shared Drive", async () => {
    const authorizedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "drive-file-1", parents: ["my-drive-parent"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "drive-file-1",
        parents: ["shared-drive-1"],
        webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
      }), { status: 200 }));

    const client = new GoogleWorkspaceClient({ authorizedFetch, calendarId: "primary" });
    await expect(client.moveRecordingToSharedDrive("files/drive-file-1", "shared-drive-1")).resolves.toEqual({
      driveFileName: "files/drive-file-1",
      exportUri: "https://drive.google.com/file/d/drive-file-1/view",
    });

    expect(authorizedFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("addParents=shared-drive-1"),
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(authorizedFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("removeParents=my-drive-parent"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("deletes an orphaned Calendar event without sending cancellation updates", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new GoogleWorkspaceClient({ authorizedFetch, calendarId: "primary" });

    await expect(client.deleteCalendarEvent("event-1")).resolves.toBeUndefined();
    expect(authorizedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/events/event-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(authorizedFetch).toHaveBeenCalledWith(
      expect.stringContaining("sendUpdates=none"),
      expect.anything(),
    );
  });

  it("discovers the latest conference record by stored meeting code", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      conferenceRecords: [
        { name: "conferenceRecords/older", startTime: "2026-09-10T08:00:00.000Z" },
        { name: "conferenceRecords/latest", startTime: "2026-09-10T10:00:00.000Z" },
      ],
    }), { status: 200 }));
    const client = new GoogleWorkspaceClient({ authorizedFetch, calendarId: "primary" });

    await expect(client.findConferenceRecordByMeetingCode("abc-defg-hij")).resolves.toEqual({ name: "conferenceRecords/latest" });
    expect(authorizedFetch).toHaveBeenCalledWith(expect.stringContaining("conferenceRecords"));
    expect(authorizedFetch).toHaveBeenCalledWith(expect.stringContaining("space.meeting_code"));
  });

  it("returns existing metadata when a recording is already in the Shared Drive", async () => {
    const authorizedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "drive-file-1",
        parents: ["shared-drive-1"],
        webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
      }), { status: 200 }));
    const client = new GoogleWorkspaceClient({ authorizedFetch, calendarId: "primary" });

    await expect(client.moveRecordingToSharedDrive("files/drive-file-1", "shared-drive-1")).resolves.toEqual({
      driveFileName: "files/drive-file-1",
      exportUri: "https://drive.google.com/file/d/drive-file-1/view",
    });
    expect(authorizedFetch).toHaveBeenCalledTimes(1);
  });
});









