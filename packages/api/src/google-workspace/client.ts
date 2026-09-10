import { z } from "zod";

export const GOOGLE_WORKSPACE_TIME_ZONE = "Europe/Madrid";

type AuthorizedFetch = (url: string, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

const DEFAULT_PROVISIONING_ATTEMPTS = 3;
const DEFAULT_PROVISIONING_DELAY_MS = 500;

export type CreateCloserMeetingInput = {
  leadId: string;
  closerId: string;
  closerEmail: string;
  contactEmail: string | null;
  startsAt: Date;
  durationMinutes: number;
  requestId: string;
};

const calendarEventSchema = z.object({
  id: z.string().min(1),
  htmlLink: z.url().optional(),
  conferenceData: z.object({
    conferenceId: z.string().min(1).optional(),
    entryPoints: z.array(z.object({
      entryPointType: z.string(),
      uri: z.url(),
    })).optional(),
    createRequest: z.object({
      status: z.object({ statusCode: z.string() }).optional(),
    }).optional(),
  }).optional(),
});

type CalendarEvent = z.infer<typeof calendarEventSchema>;

const recordingListSchema = z.object({
  recordings: z.array(z.object({
    name: z.string().min(1),
    state: z.string().min(1),
    driveDestination: z.object({
      file: z.string().min(1),
      exportUri: z.url(),
    }).optional(),
  })).default([]),
});

const transcriptListSchema = z.object({
  transcripts: z.array(z.object({
    name: z.string().regex(/^conferenceRecords\/[^/]+\/transcripts\/[^/]+$/),
    startTime: z.iso.datetime().optional(),
  })).default([]),
  nextPageToken: z.string().min(1).optional(),
});

const transcriptEntryListSchema = z.object({
  transcriptEntries: z.array(z.object({
    name: z.string().min(1),
    text: z.string(),
    languageCode: z.string().min(1).optional(),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
  })).default([]),
  nextPageToken: z.string().min(1).optional(),
});

const conferenceRecordListSchema = z.object({
  conferenceRecords: z.array(z.object({
    name: z.string().regex(/^conferenceRecords\/[^/]+$/),
    startTime: z.iso.datetime().optional(),
  })).default([]),
});
const driveFileSchema = z.object({
  id: z.string().min(1),
  parents: z.array(z.string().min(1)).default([]),
  webViewLink: z.url().optional(),
});
function requireSuccess(response: Response, operation: string) {
  if (!response.ok) {
    throw new Error(operation + " failed with Google status " + response.status);
  }
}

export function buildCloserCalendarEvent(input: CreateCloserMeetingInput) {
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 480) {
    throw new Error("Meeting duration must be an integer between 15 and 480 minutes");
  }

  const attendeeEmails = [input.closerEmail, input.contactEmail]
    .filter((email): email is string => Boolean(email))
    .filter((email, index, emails) => emails.indexOf(email) === index);

  return {
    summary: "Closer call",
    visibility: "private",
    guestsCanInviteOthers: false,
    start: {
      dateTime: input.startsAt.toISOString(),
      timeZone: GOOGLE_WORKSPACE_TIME_ZONE,
    },
    end: {
      dateTime: new Date(input.startsAt.getTime() + input.durationMinutes * 60_000).toISOString(),
      timeZone: GOOGLE_WORKSPACE_TIME_ZONE,
    },
    attendees: attendeeEmails.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: input.requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    extendedProperties: {
      private: {
        crmLeadId: input.leadId,
        crmCloserId: input.closerId,
      },
    },
  };
}

export class GoogleWorkspaceClient {
  private readonly authorizedFetch: AuthorizedFetch;
  private readonly calendarId: string;
  private readonly provisioningAttempts: number;
  private readonly sleep: Sleep;

  constructor(input: {
    authorizedFetch: AuthorizedFetch;
    calendarId: string;
    provisioningAttempts?: number;
    sleep?: Sleep;
  }) {
    this.authorizedFetch = input.authorizedFetch;
    this.calendarId = input.calendarId;
    this.provisioningAttempts = input.provisioningAttempts ?? DEFAULT_PROVISIONING_ATTEMPTS;
    this.sleep = input.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  private async waitForMeetConference(initialEvent: CalendarEvent) {
    let event = initialEvent;
    for (let attempt = 0; attempt < this.provisioningAttempts; attempt += 1) {
      const meetingCode = event.conferenceData?.conferenceId;
      const meetingUri = event.conferenceData?.entryPoints?.find(
        (entryPoint) => entryPoint.entryPointType === "video",
      )?.uri;
      if (meetingCode && meetingUri) {
        return event;
      }

      await this.sleep(DEFAULT_PROVISIONING_DELAY_MS);
      const eventUrl = new URL(
        "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(this.calendarId)
        + "/events/" + encodeURIComponent(event.id),
      );
      const response = await this.authorizedFetch(eventUrl.toString());
      requireSuccess(response, "Calendar event provisioning lookup");
      event = calendarEventSchema.parse(await response.json());
    }

    const meetingCode = event.conferenceData?.conferenceId;
    const meetingUri = event.conferenceData?.entryPoints?.find(
      (entryPoint) => entryPoint.entryPointType === "video",
    )?.uri;
    if (!meetingCode || !meetingUri) {
      throw new Error("Google Meet conference is still being provisioned");
    }
    return event;
  }

  async createCloserMeeting(input: CreateCloserMeetingInput) {
    const calendarUrl = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(this.calendarId) + "/events",
    );
    calendarUrl.searchParams.set("conferenceDataVersion", "1");
    calendarUrl.searchParams.set("sendUpdates", "all");

    const calendarResponse = await this.authorizedFetch(calendarUrl.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildCloserCalendarEvent(input)),
    });
    requireSuccess(calendarResponse, "Calendar event creation");

    const createdEvent = calendarEventSchema.parse(await calendarResponse.json());
    const event = await this.waitForMeetConference(createdEvent);
    const meetingCode = event.conferenceData?.conferenceId;
    const meetingUri = event.conferenceData?.entryPoints?.find(
      (entryPoint) => entryPoint.entryPointType === "video",
    )?.uri;

    if (!meetingCode || !meetingUri) {
      throw new Error("Google Meet conference is still being provisioned");
    }

    if (!event.htmlLink) {
      throw new Error("Google Calendar event URL is missing");
    }

    const recordingResponse = await this.authorizedFetch(
      "https://meet.googleapis.com/v2/spaces/" + encodeURIComponent(meetingCode) + "?updateMask=config.artifactConfig.recordingConfig.autoRecordingGeneration%2Cconfig.artifactConfig.transcriptionConfig.autoTranscriptionGeneration",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: {
            artifactConfig: {
              recordingConfig: {
                autoRecordingGeneration: "ON",
              },
              transcriptionConfig: {
                autoTranscriptionGeneration: "ON",
              },
            },
          },
        }),
      },
    );
    requireSuccess(recordingResponse, "Meet automatic recording configuration");

    return {
      calendarEventId: event.id,
      calendarEventUrl: event.htmlLink,
      meetingCode,
      meetingUri,
    };
  }

  async findConferenceRecordByMeetingCode(meetingCode: string) {
    if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(meetingCode)) {
      throw new Error("Invalid Google Meet meeting code");
    }

    const url = new URL("https://meet.googleapis.com/v2/conferenceRecords");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filter", `space.meeting_code = "${meetingCode}"`);

    const response = await this.authorizedFetch(url.toString());
    requireSuccess(response, "Meet conference record lookup");
    const records = conferenceRecordListSchema.parse(await response.json()).conferenceRecords;
    const latest = records.toSorted((left, right) =>
      (right.startTime ?? "").localeCompare(left.startTime ?? "")
    )[0];
    return latest ? { name: latest.name } : null;
  }
  async listRecordings(conferenceRecordName: string) {
    if (!/^conferenceRecords\/[^/]+$/.test(conferenceRecordName)) {
      throw new Error("Invalid Google Meet conference record name");
    }

    const response = await this.authorizedFetch(
      "https://meet.googleapis.com/v2/" + conferenceRecordName + "/recordings?pageSize=100",
    );
    requireSuccess(response, "Meet recording lookup");

    const payload = recordingListSchema.parse(await response.json());
    return payload.recordings.map((recording) => ({
      resourceName: recording.name,
      state: recording.state,
      driveFileName: recording.driveDestination?.file ?? null,
      exportUri: recording.driveDestination?.exportUri ?? null,
    }));
  }

  async getLatestTranscript(
    conferenceRecordName: string,
    limits: { maxPages: number; maxEntries: number; maxCharacters: number } = {
      maxPages: 10,
      maxEntries: 1_000,
      maxCharacters: 200_000,
    },
  ) {
    if (!/^conferenceRecords\/[^/]+$/.test(conferenceRecordName)) {
      throw new Error("Invalid Google Meet conference record name");
    }
    if (!Number.isInteger(limits.maxPages) || limits.maxPages < 1 || !Number.isInteger(limits.maxEntries) || limits.maxEntries < 1 || !Number.isInteger(limits.maxCharacters) || limits.maxCharacters < 1) {
      throw new Error("Invalid transcript limits");
    }

    const transcripts: z.infer<typeof transcriptListSchema>["transcripts"] = [];
    const transcriptTokens = new Set<string>();
    let transcriptPageToken: string | undefined;
    for (let page = 0; page < limits.maxPages; page += 1) {
      const url = new URL(`https://meet.googleapis.com/v2/${conferenceRecordName}/transcripts`);
      url.searchParams.set("pageSize", "100");
      if (transcriptPageToken) url.searchParams.set("pageToken", transcriptPageToken);
      const response = await this.authorizedFetch(url.toString());
      requireSuccess(response, "Meet transcript lookup");
      const payload = transcriptListSchema.parse(await response.json());
      transcripts.push(...payload.transcripts);
      transcriptPageToken = payload.nextPageToken;
      if (!transcriptPageToken) break;
      if (transcriptTokens.has(transcriptPageToken)) throw new Error("Transcript pagination cycle detected");
      transcriptTokens.add(transcriptPageToken);
      if (page === limits.maxPages - 1) throw new Error("Transcript page limit exceeded");
    }
    const transcript = transcripts.toSorted((left, right) => (left.startTime ?? "").localeCompare(right.startTime ?? "")).at(-1);
    if (!transcript) return null;

    const entries: Array<z.infer<typeof transcriptEntryListSchema>["transcriptEntries"][number]> = [];
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < limits.maxPages; page += 1) {
      const url = new URL(`https://meet.googleapis.com/v2/${transcript.name}/entries`);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await this.authorizedFetch(url.toString());
      requireSuccess(response, "Meet transcript entries lookup");
      const payload = transcriptEntryListSchema.parse(await response.json());
      entries.push(...payload.transcriptEntries);
      if (entries.length > limits.maxEntries) throw new Error("Transcript entry limit exceeded");
      pageToken = payload.nextPageToken;
      if (!pageToken) break;
      if (seenTokens.has(pageToken)) throw new Error("Transcript pagination cycle detected");
      seenTokens.add(pageToken);
      if (page === limits.maxPages - 1) throw new Error("Transcript page limit exceeded");
    }

    const ordered = entries.toSorted((left, right) => left.startTime.localeCompare(right.startTime));
    const text = ordered.map((entry) => entry.text).join("\n");
    if (text.length > limits.maxCharacters) throw new Error("Transcript character limit exceeded");
    const languages = new Set(ordered.map((entry) => entry.languageCode).filter((value): value is string => Boolean(value)));
    return { resourceName: transcript.name, text, languageCode: languages.size === 1 ? [...languages][0] ?? null : null, entryCount: ordered.length };
  }
  async moveRecordingToSharedDrive(driveFileName: string, sharedDriveId: string) {
    if (!/^files\/[^/]+$/.test(driveFileName)) {
      throw new Error("Invalid Google Drive file name");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(sharedDriveId)) {
      throw new Error("Invalid Google Shared Drive identifier");
    }

    const fileId = driveFileName.slice("files/".length);
    const lookupUrl = new URL("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId));
    lookupUrl.searchParams.set("fields", "id,parents,webViewLink");
    lookupUrl.searchParams.set("supportsAllDrives", "true");

    const lookupResponse = await this.authorizedFetch(lookupUrl.toString());
    requireSuccess(lookupResponse, "Drive recording parent lookup");
    const currentFile = driveFileSchema.parse(await lookupResponse.json());
    if (currentFile.parents.includes(sharedDriveId)) {
      if (!currentFile.webViewLink) {
        throw new Error("Google Drive recording URL is missing");
      }
      return {
        driveFileName: "files/" + currentFile.id,
        exportUri: currentFile.webViewLink,
      };
    }
    if (currentFile.parents.length === 0) {
      throw new Error("Google Drive recording has no movable parent");
    }

    const moveUrl = new URL("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId));
    moveUrl.searchParams.set("addParents", sharedDriveId);
    moveUrl.searchParams.set("removeParents", currentFile.parents.join(","));
    moveUrl.searchParams.set("supportsAllDrives", "true");
    moveUrl.searchParams.set("fields", "id,parents,webViewLink");

    const moveResponse = await this.authorizedFetch(moveUrl.toString(), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    requireSuccess(moveResponse, "Move recording to Shared Drive");
    const movedFile = driveFileSchema.parse(await moveResponse.json());
    if (!movedFile.webViewLink) {
      throw new Error("Moved Google Drive recording URL is missing");
    }

    return {
      driveFileName: "files/" + movedFile.id,
      exportUri: movedFile.webViewLink,
    };
  }

  async deleteCalendarEvent(calendarEventId: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(calendarEventId)) {
      throw new Error("Invalid Google Calendar event identifier");
    }

    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(this.calendarId)
      + "/events/" + encodeURIComponent(calendarEventId),
    );
    url.searchParams.set("sendUpdates", "none");

    const response = await this.authorizedFetch(url.toString(), { method: "DELETE" });
    requireSuccess(response, "Calendar event cleanup");
  }
}













