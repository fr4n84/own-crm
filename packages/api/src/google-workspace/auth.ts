import { JWT } from "google-auth-library";
import { z } from "zod";

import { GoogleWorkspaceClient } from "./client";

const googleWorkspaceConfigSchema = z.object({
  serviceAccountEmail: z.email(),
  privateKey: z.string().min(1),
  delegatedUserEmail: z.email(),
  calendarId: z.string().min(1),
});

export type GoogleWorkspaceConfig = z.infer<typeof googleWorkspaceConfigSchema>;

export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.settings",
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/drive",
] as const;

export function parseGoogleWorkspaceConfig(input: {
  serviceAccountEmail?: string;
  privateKey?: string;
  delegatedUserEmail?: string;
  calendarId?: string;
}): GoogleWorkspaceConfig | null {
  const values = Object.values(input);
  if (values.every((value) => !value)) return null;

  return googleWorkspaceConfigSchema.parse({
    serviceAccountEmail: input.serviceAccountEmail,
    privateKey: input.privateKey?.replace(/\\n/g, "\n"),
    delegatedUserEmail: input.delegatedUserEmail,
    calendarId: input.calendarId,
  });
}

export function createGoogleWorkspaceClient(config: GoogleWorkspaceConfig) {
  const auth = new JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    subject: config.delegatedUserEmail,
    scopes: [...GOOGLE_WORKSPACE_SCOPES],
  });

  return new GoogleWorkspaceClient({
    calendarId: config.calendarId,
    authorizedFetch: async (url, init) => {
      const accessToken = await auth.getAccessToken();
      if (!accessToken.token) throw new Error("Google Workspace access token is unavailable");

      const headers = new Headers(init?.headers);
      headers.set("authorization", "Bearer " + accessToken.token);
      return fetch(url, { ...init, headers });
    },
  });
}

