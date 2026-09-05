import { db, eq } from "@crm-fran/db";
import { ALERT_RELEVANCE_MODE, alertPreferences, type AlertRelevanceMode } from "@crm-fran/db/schema/index";

export const DEFAULT_ALERT_PREFERENCES = {
  relevanceMode: ALERT_RELEVANCE_MODE.CONDITION,
  urgentThresholdHours: 2,
  warningThresholdHours: 6,
  noContactUrgentThresholdHours: 2, noContactWarningThresholdHours: 6,
  followUpUrgentThresholdHours: 2, followUpWarningThresholdHours: 6,
  futureCallUrgentThresholdHours: 2, futureCallWarningThresholdHours: 6,
  appointmentUrgentThresholdHours: 2, appointmentWarningThresholdHours: 6,
  rescheduledUrgentThresholdHours: 2, rescheduledWarningThresholdHours: 6,
  noContactSeverity: "urgent", followUpSeverity: "info", futureCallSeverity: "info",
  appointmentSeverity: "info", rescheduledSeverity: "info",
} as const;

type Severity = "info" | "warning" | "urgent";
export type UpdateAlertPreferencesInput = {
  relevanceMode: AlertRelevanceMode;
  urgentThresholdHours: number;
  warningThresholdHours: number;
  noContactUrgentThresholdHours?: number; noContactWarningThresholdHours?: number;
  followUpUrgentThresholdHours?: number; followUpWarningThresholdHours?: number;
  futureCallUrgentThresholdHours?: number; futureCallWarningThresholdHours?: number;
  appointmentUrgentThresholdHours?: number; appointmentWarningThresholdHours?: number;
  rescheduledUrgentThresholdHours?: number; rescheduledWarningThresholdHours?: number;
  noContactSeverity: Severity; followUpSeverity: Severity; futureCallSeverity: Severity;
  appointmentSeverity: Severity; rescheduledSeverity: Severity;
};

function withTimeFallbacks<T extends UpdateAlertPreferencesInput>(value: T) {
  return {
    ...value,
    noContactUrgentThresholdHours: value.noContactUrgentThresholdHours ?? value.urgentThresholdHours,
    noContactWarningThresholdHours: value.noContactWarningThresholdHours ?? value.warningThresholdHours,
    followUpUrgentThresholdHours: value.followUpUrgentThresholdHours ?? value.urgentThresholdHours,
    followUpWarningThresholdHours: value.followUpWarningThresholdHours ?? value.warningThresholdHours,
    futureCallUrgentThresholdHours: value.futureCallUrgentThresholdHours ?? value.urgentThresholdHours,
    futureCallWarningThresholdHours: value.futureCallWarningThresholdHours ?? value.warningThresholdHours,
    appointmentUrgentThresholdHours: value.appointmentUrgentThresholdHours ?? value.urgentThresholdHours,
    appointmentWarningThresholdHours: value.appointmentWarningThresholdHours ?? value.warningThresholdHours,
    rescheduledUrgentThresholdHours: value.rescheduledUrgentThresholdHours ?? value.urgentThresholdHours,
    rescheduledWarningThresholdHours: value.rescheduledWarningThresholdHours ?? value.warningThresholdHours,
  };
}

export async function getAlertPreferences(userId: string) {
  const [preferences] = await db.select().from(alertPreferences).where(eq(alertPreferences.userId, userId)).limit(1);
  return withTimeFallbacks(preferences ?? { userId, ...DEFAULT_ALERT_PREFERENCES });
}

export async function updateAlertPreferences(userId: string, input: UpdateAlertPreferencesInput) {
  const normalized = withTimeFallbacks(input);
  const [preferences] = await db.insert(alertPreferences).values({ userId, ...normalized }).onConflictDoUpdate({ target: alertPreferences.userId, set: normalized }).returning();
  return preferences;
}
