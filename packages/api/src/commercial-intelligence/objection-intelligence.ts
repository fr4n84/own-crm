import { MOTIVATION_ANGLES, OBJECTION_TYPES } from "../call-feedback";

type Attribution = { source: string | null; campaign: string | null; ad: string | null; creative: string | null; acquisitionAngle: string | null };
type Activity = { id: string; leadId: string; actorId: string | null; kind: string; occurredAt: Date; metadata: Record<string, unknown> };
type Outcome = { leadId: string; kind: "contacted" | "appointment" | "show" | "sale"; occurredAt: Date };
type Identity = { missing: true } | { value: string };
type Row = Attribution & { value: string; label: string; sourceIdentity: Identity; leads: number; contacted: number; appointments: number; shows: number; sales: number; evidence: { feedbackEventId: string; leadId: string; occurredAt: string }[] };

const emptyAttribution = (): Attribution => ({ source: null, campaign: null, ad: null, creative: null, acquisitionAngle: null });
const identity = (value: string | null): Identity => value === null ? { missing: true } : { value };
function parseValues(metadata: Record<string, unknown>, key: string, allowed: ReadonlySet<string>) {
  const questions = Array.isArray(metadata.questions) ? metadata.questions : [];
  const answer = questions.find((item): item is { questionKey: string; answer: string } => typeof item === "object" && item !== null && "questionKey" in item && item.questionKey === key && "answer" in item && typeof item.answer === "string")?.answer;
  if (!answer) return [];
  try { const parsed: unknown = JSON.parse(answer); return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && allowed.has(value)) : []; } catch { return []; }
}
function attributionFrom(metadata: Record<string, unknown>, fallback: Attribution) {
  const source = metadata.after && typeof metadata.after === "object" ? metadata.after as Record<string, unknown> : metadata;
  const value = (key: keyof Attribution) => typeof source[key] === "string" ? source[key] as string : source[key] === null ? null : fallback[key];
  return { source: value("source"), campaign: value("campaign"), ad: value("ad"), creative: value("creative"), acquisitionAngle: value("acquisitionAngle") };
}
export function buildObjectionMotivationIntelligence(input: { activities: readonly Activity[]; outcomes: readonly Outcome[]; actorId: string | null }) {
  const objections = new Map(OBJECTION_TYPES.map((x) => [x.value, x.label]));
  const motivations = new Map(MOTIVATION_ANGLES.map((x) => [x.value, x.label]));
  const build = (questionKey: string, labels: Map<string, string>) => {
    const rows = new Map<string, Row>();
    const attributionByLead = new Map<string, Attribution>();
    const eventPriority = (kind: string) => kind === "lead_created" ? 0 : kind === "lead_attribution_updated" ? 1 : 2;
    for (const event of [...input.activities].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || eventPriority(a.kind) - eventPriority(b.kind) || a.id.localeCompare(b.id))) {
      const current = attributionByLead.get(event.leadId) ?? emptyAttribution();
      if (event.kind === "lead_created" || event.kind === "lead_attribution_updated") { attributionByLead.set(event.leadId, attributionFrom(event.metadata, current)); continue; }
      if (event.kind !== "caller_feedback" || (input.actorId && event.actorId !== input.actorId)) continue;
      const attribution = attributionByLead.get(event.leadId) ?? current;
      for (const value of parseValues(event.metadata, questionKey, new Set(labels.keys()))) {
        const key = JSON.stringify([value, identity(attribution.source), identity(attribution.campaign), identity(attribution.ad), identity(attribution.creative), identity(attribution.acquisitionAngle)]);
        const downstream = input.outcomes.filter((item) => item.leadId === event.leadId && item.occurredAt >= event.occurredAt);
        const row = rows.get(key) ?? { value, label: labels.get(value) ?? value, ...attribution, sourceIdentity: identity(attribution.source), leads: 0, contacted: 0, appointments: 0, shows: 0, sales: 0, evidence: [] };
        row.leads += 1; row.contacted += Number(downstream.some(x => x.kind === "contacted")); row.appointments += Number(downstream.some(x => x.kind === "appointment")); row.shows += Number(downstream.some(x => x.kind === "show")); row.sales += Number(downstream.some(x => x.kind === "sale"));
        row.evidence.push({ feedbackEventId: event.id, leadId: event.leadId, occurredAt: event.occurredAt.toISOString() }); rows.set(key, row);
      }
    }
    return [...rows.values()];
  };
  return { objections: build("objectionTypes", objections), motivations: build("motivationAngles", motivations), attributionMode: "historical_at_feedback" as const };
}
