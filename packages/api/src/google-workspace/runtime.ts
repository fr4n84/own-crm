import { env } from "@crm-fran/env/server";

import { createGoogleWorkspaceClient, parseGoogleWorkspaceConfig } from "./auth";

export function createGoogleWorkspaceClientFromEnv() {
  const config = parseGoogleWorkspaceConfig({
    serviceAccountEmail: env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_WORKSPACE_PRIVATE_KEY,
    delegatedUserEmail: env.GOOGLE_WORKSPACE_DELEGATED_USER_EMAIL,
    calendarId: env.GOOGLE_WORKSPACE_CALENDAR_ID,
  });

  return config ? createGoogleWorkspaceClient(config) : null;
}

export function createGoogleWorkspaceRecordingSyncContextFromEnv() {
  const workspace = createGoogleWorkspaceClientFromEnv();
  const sharedDriveId = env.GOOGLE_WORKSPACE_SHARED_DRIVE_ID;
  return workspace && sharedDriveId ? { workspace, sharedDriveId } : null;
}

