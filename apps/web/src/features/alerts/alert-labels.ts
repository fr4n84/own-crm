export const ALERT_KIND_LABELS = {
  no_contact: "Sin contacto",
  follow_up: "Seguimiento",
  appointment: "Agenda",
  future_call: "Llamar futuro",
  rescheduled: "Reagenda",
} as const;

const ALERT_SEVERITY_LABELS: Record<string, string> = {
  urgent: "Alta",
  high: "Alta",
  warning: "Media",
  info: "Baja",
};

export function getAlertSeverityLabel(severity: string) {
  return ALERT_SEVERITY_LABELS[severity] ?? "Relevancia desconocida";
}

export function getAlertKindLabel(kind: string) {
  return ALERT_KIND_LABELS[kind as keyof typeof ALERT_KIND_LABELS]
    ?? "Tipo desconocido";
}
