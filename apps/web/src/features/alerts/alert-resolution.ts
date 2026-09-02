export function getAppointmentOutcomeLabel(alertKind: string) {
  return alertKind === "appointment" || alertKind === "rescheduled"
    ? "Reagenda"
    : "Agenda";
}

export function shouldResolveSourceAlert({
  sourceAlertId,
  nextAlertId,
}: {
  sourceAlertId: string;
  nextAlertId: string | undefined;
}) {
  return nextAlertId !== sourceAlertId;
}
