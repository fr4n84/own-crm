export type Outcome = "contacted" | "appointment" | "show" | "sale";
export type IntelligenceLead = {
  id: string;
  name?: string;
  profile: string | null;
  source: string | null;
  campaign: string | null;
  type: "maestra" | "vsl";
  createdAt: Date;
  assignments: readonly { role: "caller" | "closer"; userId: string; occurredAt: Date }[];
  outcomes: readonly { kind: Outcome; occurredAt: Date; actorId?: string | null }[];
  scheduledAt?: Date | null;
  appointmentConfirmed?: boolean;
  followUpDueAt?: Date | null;
  simulatedCallerId?: string | null;
  simulatedCloserId?: string | null;
};

export type IntelligenceObservation = {
  profile?: string | null;
  source?: string | null;
  campaign?: string | null;
  type?: "maestra" | "vsl";
  timeBucket?: string;
  contacted?: boolean;
  appointment?: boolean;
  show?: boolean;
  sale?: boolean;
  assignmentToContactMinutes?: number | null;
};

export type IntelligencePerson = {
  id: string;
  name: string;
  role: "caller" | "closer";
  workload: number;
  capacity: number;
  observations: readonly IntelligenceObservation[];
};

export type RecommendationOccurrence = {
  recommendationKey: string;
  actionType: string;
  state: "completed" | "skipped" | "unworked";
  profile: string | null;
  source: string | null;
  campaign: string | null;
  callerId: string | null;
  occurredAt: Date;
  downstream: Partial<Record<Outcome, boolean>>;
};

type FallbackLevel = "exact" | "profile_source_type" | "profile_source" | "source_type" | "global";
type Candidate = {
  id: string;
  name: string;
  score: number;
  sampleSize: number;
  fallbackLevel: FallbackLevel;
  factorScores: { conversion: number; speed: number | null; capacity: number; confidence: number; relevance: number };
  reasons: string[];
};

const MIN_SAMPLE = 30;
const timeBucket = (date: Date) => {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
};

function matches(level: FallbackLevel, lead: IntelligenceLead, bucket: string, observation: IntelligenceObservation) {
  if (level === "global") return true;
  const profileSource = observation.profile === lead.profile && observation.source === lead.source;
  if (level === "profile_source") return profileSource;
  if (level === "source_type") return observation.source === lead.source && observation.type === lead.type;
  if (level === "profile_source_type") return profileSource && observation.type === lead.type;
  return profileSource && observation.campaign === lead.campaign && observation.type === lead.type && observation.timeBucket === bucket;
}

function observationsFor(person: IntelligencePerson, lead: IntelligenceLead) {
  const bucket = timeBucket(lead.createdAt);
  const levels: FallbackLevel[] = ["exact", "profile_source_type", "profile_source", "source_type", "global"];
  for (const level of levels) {
    const observations = person.observations.filter((observation) => matches(level, lead, bucket, observation));
    if (observations.length > 0) return { observations, level };
  }
  return { observations: [], level: "global" as const };
}

function rate(observations: readonly IntelligenceObservation[], outcome: Outcome) {
  if (observations.length === 0) return 0;
  return observations.filter((observation) => observation[outcome] === true).length / observations.length;
}

function globalPrior(people: readonly IntelligencePerson[], role: IntelligencePerson["role"], outcome: Outcome) {
  const observations = people.filter((person) => person.role === role).flatMap((person) => person.observations);
  return observations.length === 0 ? 0 : rate(observations, outcome);
}

function round(value: number) { return Math.round(value * 10) / 10; }

function candidateFor(person: IntelligencePerson, people: readonly IntelligencePerson[], lead: IntelligenceLead): Candidate {
  const { observations, level } = observationsFor(person, lead);
  const outcome: Outcome = person.role === "caller" ? "contacted" : "sale";
  const prior = globalPrior(people, person.role, outcome);
  const conversions = observations.filter((observation) => observation[outcome] === true).length;
  const shrunk = (conversions + prior * MIN_SAMPLE) / (observations.length + MIN_SAMPLE);
  const conversion = shrunk * 70;
  const speedValues = observations
    .map((observation) => observation.assignmentToContactMinutes)
    .filter((value): value is number => typeof value === "number" && value >= 0);
  const averageSpeed = speedValues.length === 0 ? null : speedValues.reduce((total, value) => total + value, 0) / speedValues.length;
  const speed = person.role === "caller" && averageSpeed !== null ? Math.max(0, 20 - Math.min(20, averageSpeed / 3)) : null;
  const capacity = person.capacity <= 0 ? 0 : Math.max(-10, Math.min(10, ((person.capacity - person.workload) / person.capacity) * 10));
  // A narrow segment remains useful, but it cannot outrank a proven result solely
  // because a single observation happens to be perfect.
  const confidence = Math.min(10, (observations.length / MIN_SAMPLE) * 10);
  const relevanceByLevel: Record<FallbackLevel, number> = { exact: 12, profile_source_type: 8, profile_source: 6, source_type: 4, global: 0 };
  const relevance = relevanceByLevel[level];
  const score = round(conversion + (speed ?? 0) + capacity + confidence + relevance);
  const fallbackLabel: Record<FallbackLevel, string> = {
    exact: "segmento exacto",
    profile_source_type: "perfil, fuente y tipo",
    profile_source: "perfil y fuente",
    source_type: "fuente y tipo",
    global: "referencia global",
  };
  return {
    id: person.id, name: person.name, score, sampleSize: observations.length, fallbackLevel: level,
    factorScores: { conversion: round(conversion), speed: speed === null ? null : round(speed), capacity: round(capacity), confidence: round(confidence), relevance },
    reasons: [
      `Conversión ${outcome === "contacted" ? "a contacto" : "a venta"} ajustada con prior de ${MIN_SAMPLE} casos (${observations.length} observaciones).`,
      `Referencia usada: ${fallbackLabel[level]}.`,
      `Afinidad de segmento: ${relevance}/12.`,
      `Confianza de muestra: ${Math.round((observations.length / MIN_SAMPLE) * 100)}% frente al umbral de ${MIN_SAMPLE} casos.`,
      ...(speed === null ? [] : [`Velocidad media de contacto: ${Math.round(averageSpeed ?? 0)} min desde la asignación.`]),
      `Carga activa: ${person.workload}/${person.capacity}.`,
    ],
  };
}

function bestFor(role: IntelligencePerson["role"], people: readonly IntelligencePerson[], lead: IntelligenceLead) {
  return people.filter((person) => person.role === role).map((person) => candidateFor(person, people, lead))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))[0] ?? null;
}

function hasOutcome(lead: IntelligenceLead, outcome: Outcome) { return lead.outcomes.some((item) => item.kind === outcome); }
function latestAssignment(lead: IntelligenceLead, role: "caller" | "closer") { return lead.assignments.filter((item) => item.role === role).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0] ?? null; }

export function buildCommercialIntelligence(input: { leads: readonly IntelligenceLead[]; people: readonly IntelligencePerson[]; recommendations: readonly RecommendationOccurrence[]; referenceSaleValue?: number | null; now?: Date }) {
  const now = input.now ?? new Date();
  const assignments = input.leads.map((lead) => {
    const caller = bestFor("caller", input.people, lead);
    const closer = bestFor("closer", input.people, lead);
    return {
      leadId: lead.id, leadName: lead.name ?? lead.id, bestCallerId: caller?.id ?? null, bestCloserId: closer?.id ?? null, caller, closer, simulationOnly: true,
      reasons: ["Simulación: esta vista no escribe callerId ni closerId.", ...(caller?.reasons ?? ["No hay caller elegible."]), ...(closer?.reasons ?? ["No hay closer elegible."])],
    };
  });

  const learningGroups = new Map<string, RecommendationOccurrence[]>();
  for (const occurrence of input.recommendations) {
    const key = [occurrence.actionType, occurrence.profile ?? "sin perfil", occurrence.source ?? "sin fuente", occurrence.campaign ?? "sin campaña", occurrence.callerId ?? "sin caller"].join("|");
    const items = learningGroups.get(key) ?? [];
    items.push(occurrence);
    learningGroups.set(key, items);
  }
  const learning = [...learningGroups.values()].map((values) => {
    const first = values[0]!;
    const count = (state: RecommendationOccurrence["state"]) => values.filter((item) => item.state === state).length;
    const outcomeRate = (outcome: Outcome) => Math.round((values.filter((item) => item.downstream[outcome] === true).length / values.length) * 100);
    const completed = values.filter((item) => item.state === "completed");
    const comparison = values.filter((item) => item.state !== "completed");
    const completedSaleRate = completed.length === 0 ? 0 : completed.filter((item) => item.downstream.sale).length / completed.length;
    const baselineSaleRate = comparison.length === 0 ? 0 : comparison.filter((item) => item.downstream.sale).length / comparison.length;
    return {
      actionType: first.actionType, profile: first.profile, source: first.source, campaign: first.campaign, callerId: first.callerId,
      shown: values.length, completed: count("completed"), skipped: count("skipped"), sampleSize: values.length,
      contactedRate: outcomeRate("contacted"), appointmentRate: outcomeRate("appointment"), showRate: outcomeRate("show"), saleRate: outcomeRate("sale"),
      suggestedScoreAdjustment: values.length < 8 ? 0 : Math.round((completedSaleRate - baselineSaleRate) * 100), adjustmentMode: "shadow" as const,
      note: "Comparación observacional con muestra y segmentos declarados; no implica causalidad.",
    };
  });

  const slow = input.leads.filter((lead) => {
    const assignment = latestAssignment(lead, "caller");
    return assignment !== null && now.getTime() - assignment.occurredAt.getTime() >= 60 * 60_000 && !lead.outcomes.some((outcome) => outcome.kind === "contacted" && outcome.occurredAt >= assignment.occurredAt);
  }).length;
  const noShow = input.leads.filter((lead) => lead.appointmentConfirmed && lead.scheduledAt && lead.scheduledAt <= now && !hasOutcome(lead, "show") && lead.outcomes.some((outcome) => outcome.kind === "appointment")).length;
  const unworked = input.recommendations.filter((item) => item.state === "unworked").length;
  const stalled = input.leads.filter((lead) => lead.followUpDueAt && lead.followUpDueAt < now && !lead.outcomes.some((outcome) => outcome.kind === "sale" && outcome.occurredAt >= lead.followUpDueAt!)).length;
  const overload = input.people.filter((person) => person.workload > person.capacity || Math.abs(person.workload - (input.people.filter((item) => item.role === person.role).reduce((sum, item) => sum + item.workload, 0) / Math.max(1, input.people.filter((item) => item.role === person.role).length))) >= 3).length;
  const mismatch = input.leads.filter((lead) => {
    const caller = latestAssignment(lead, "caller")?.userId ?? null;
    const closer = latestAssignment(lead, "closer")?.userId ?? null;
    return (lead.simulatedCallerId !== undefined && lead.simulatedCallerId !== null && caller !== null && caller !== lead.simulatedCallerId) || (lead.simulatedCloserId !== undefined && lead.simulatedCloserId !== null && closer !== null && closer !== lead.simulatedCloserId);
  }).length;
  const missedConversionRate = input.leads.length === 0 ? 0 : input.leads.filter((lead) => hasOutcome(lead, "sale")).length / input.leads.length;
  const valueProvided = input.referenceSaleValue !== undefined && input.referenceSaleValue !== null;
  const leakage = [
    ["slow_no_contact", "Contacto lento o ausente", slow],
    ["no_show", "No-show confirmado", noShow],
    ["unworked_recommendation", "Recomendaciones sin trabajar", unworked],
    ["stalled_follow_up", "Seguimientos vencidos", stalled],
    ["overload_imbalance", "Sobrecarga o desequilibrio", overload],
    ["assignment_mismatch", "Desajuste entre asignación real y simulada", mismatch],
  ].map(([key, label, count]) => ({ key: String(key), label: String(label), count: Number(count), estimatedMissedConversions: round(Number(count) * missedConversionRate), estimatedRevenue: valueProvided ? round(Number(count) * missedConversionRate * (input.referenceSaleValue ?? 0)) : null }));

  return { assignments, learning, leakage, people: input.people.map((person) => ({ id: person.id, name: person.name, role: person.role, workload: person.workload, capacity: person.capacity })) };
}
