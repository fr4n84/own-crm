import { db, eq } from "@crm-fran/db";
import {
  ALERT_RELEVANCE_MODE,
  alertPreferences,
  type AlertRelevanceMode,
} from "@crm-fran/db/schema/index";

export const DEFAULT_ALERT_PREFERENCES = {
  relevanceMode: ALERT_RELEVANCE_MODE.CONDITION,
  urgentThresholdHours: 2,
  warningThresholdHours: 6,
  noContactSeverity: "urgent",
  followUpSeverity: "info",
  futureCallSeverity: "info",
  appointmentSeverity: "info",
  rescheduledSeverity: "info",
} as const;

export type UpdateAlertPreferencesInput = {
  relevanceMode: AlertRelevanceMode;
  urgentThresholdHours: number;
  warningThresholdHours: number;
  noContactSeverity: "info" | "warning" | "urgent";
  followUpSeverity: "info" | "warning" | "urgent";
  futureCallSeverity: "info" | "warning" | "urgent";
  appointmentSeverity: "info" | "warning" | "urgent";
  rescheduledSeverity: "info" | "warning" | "urgent";
};

export async function getAlertPreferences(userId: string) {
  const [preferences] = await db
    .select()
    .from(alertPreferences)
    .where(eq(alertPreferences.userId, userId))
    .limit(1);

  return preferences ?? { userId, ...DEFAULT_ALERT_PREFERENCES };
}

export async function updateAlertPreferences(
  userId: string,
  input: UpdateAlertPreferencesInput,
) {
  const [preferences] = await db
    .insert(alertPreferences)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: alertPreferences.userId,
      set: input,
    })
    .returning();

  return preferences;
}
