import { getAlertRemaining } from "./alert-countdown";
import { normalizeAlertSeverity } from "./alert-importance";

const HOUR_MS = 60 * 60 * 1000;
export type AlertRelevanceMode = "condition" | "time";
export type ConfigurableAlertKind = "no_contact" | "follow_up" | "future_call" | "appointment" | "rescheduled";
export type AlertRelevanceSeverity = "info" | "warning" | "urgent";
type TimeThreshold = { urgent: number; warning: number };
export type AlertRelevancePreferences = {
  mode: AlertRelevanceMode;
  urgentThresholdHours: number;
  warningThresholdHours: number;
  timeThresholds: Record<ConfigurableAlertKind, TimeThreshold>;
  conditionSeverities: Record<ConfigurableAlertKind, AlertRelevanceSeverity>;
};

export const DEFAULT_ALERT_RELEVANCE_PREFERENCES: AlertRelevancePreferences = {
  mode: "condition", urgentThresholdHours: 2, warningThresholdHours: 6,
  timeThresholds: {
    no_contact: { urgent: 2, warning: 6 }, follow_up: { urgent: 2, warning: 6 },
    future_call: { urgent: 2, warning: 6 }, appointment: { urgent: 2, warning: 6 },
    rescheduled: { urgent: 2, warning: 6 },
  },
  conditionSeverities: { no_contact: "urgent", follow_up: "info", future_call: "info", appointment: "info", rescheduled: "info" },
};

type AlertForRelevance = { kind: string; severity: string; createdAt: Date | string; nextShowAt?: Date | string };
const SEVERITY_RANK: Record<AlertRelevanceSeverity, number> = { info: 1, warning: 2, urgent: 3 };

function getTimeSeverity(alert: AlertForRelevance, preferences: AlertRelevancePreferences, now: number): AlertRelevanceSeverity {
  const remaining = getAlertRemaining(alert, now);
  const thresholds = preferences.timeThresholds && alert.kind in preferences.timeThresholds
    ? preferences.timeThresholds[alert.kind as ConfigurableAlertKind]
    : { urgent: preferences.urgentThresholdHours, warning: preferences.warningThresholdHours };
  if (remaining <= thresholds.urgent * HOUR_MS) return "urgent";
  if (remaining <= thresholds.warning * HOUR_MS) return "warning";
  return "info";
}

export function getEffectiveAlertSeverity(alert: AlertForRelevance, preferences: AlertRelevancePreferences, now = Date.now()) {
  const timeSeverity = getTimeSeverity(alert, preferences, now);
  if (preferences.mode === "condition") {
    const conditionSeverity = alert.kind in preferences.conditionSeverities
      ? preferences.conditionSeverities[alert.kind as ConfigurableAlertKind]
      : normalizeAlertSeverity(alert.severity);
    if (!conditionSeverity) return timeSeverity;
    return SEVERITY_RANK[timeSeverity] > SEVERITY_RANK[conditionSeverity] ? timeSeverity : conditionSeverity;
  }
  return timeSeverity;
}
