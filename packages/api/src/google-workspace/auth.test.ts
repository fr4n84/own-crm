import { describe, expect, it } from "vitest";

import { GOOGLE_WORKSPACE_SCOPES, parseGoogleWorkspaceConfig } from "./auth";

describe("Google Workspace authentication", () => {
  it("stays disabled when no configuration is present", () => {
    expect(parseGoogleWorkspaceConfig({})).toBeNull();
  });

  it("fails closed when configuration is partial", () => {
    expect(() => parseGoogleWorkspaceConfig({
      serviceAccountEmail: "service@example.iam.gserviceaccount.com",
    })).toThrow();
  });

  it("normalizes an escaped private key and requests bounded scopes", () => {
    const config = parseGoogleWorkspaceConfig({
      serviceAccountEmail: "service@example.iam.gserviceaccount.com",
      privateKey: "line-1\\nline-2",
      delegatedUserEmail: "organizer@example.com",
      calendarId: "primary",
    });

    expect(config?.privateKey).toBe("line-1\nline-2");
    expect(GOOGLE_WORKSPACE_SCOPES).toEqual(expect.arrayContaining([
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/meetings.space.settings",
      "https://www.googleapis.com/auth/drive",
    ]));
    expect(GOOGLE_WORKSPACE_SCOPES).not.toContain("https://www.googleapis.com/auth/drive.file");
  });
});



