export function requiresScheduledContact(outcome: string) {
  return outcome === "Reagenda" || outcome === "Seguimiento";
}
