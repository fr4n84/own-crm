const HOUR_MS = 60 * 60 * 1000;

export function getAlertCountdownDuration(kind: string): number {
  return kind === "no_contact" ? 24 * HOUR_MS : 12 * HOUR_MS;
}

export function getAlertCountdownDeadline(
  createdAt: Date | string,
  kind: string,
): number {
  return new Date(createdAt).getTime() + getAlertCountdownDuration(kind);
}

export function getAlertCountdownRemaining(
  createdAt: Date | string,
  kind: string,
  now = Date.now(),
): number {
  return getAlertCountdownDeadline(createdAt, kind) - now;
}

export function getAlertRemaining(
  alert: {
    kind: string;
    createdAt: Date | string;
    nextShowAt?: Date | string;
  },
  now = Date.now(),
): number {
  if (alert.kind === "future_call" && alert.nextShowAt) {
    return new Date(alert.nextShowAt).getTime() - now;
  }
  return getAlertCountdownRemaining(alert.createdAt, alert.kind, now);
}

export function formatAlertCountdown(milliseconds: number): string {
  const sign = milliseconds < 0 ? "-" : "";
  const totalSeconds = Math.floor(Math.abs(milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
