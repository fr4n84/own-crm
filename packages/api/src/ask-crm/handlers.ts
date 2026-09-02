import { getObjectionMotivationIntelligence } from "../commercial-intelligence/objection-service";
import { getConfidenceCentre, getMicrosegments } from "../commercial-evidence/service";
import { getCommercialObservatory } from "../commercial-observatory/service";
import { planningBaselineFrom } from "../commercial-planning/domain";
import { getCommercialPlanning } from "../commercial-planning/service";
import { commercialPlaybooksRepository } from "../commercial-playbooks/runtime";
import { profitabilityService } from "../profitability/service";
import {
  ASK_CRM_MAX_ROWS,
  askCrmSafeTaxonomyComponent,
  catalogItem,
  joinAskCrmSafeComponents,
  sanitizeAskCrmLabel,
  type AskCrmQuestionId,
  type ParsedAskCrmQuestion,
} from "./domain";

export type AskCrmSafeRow = {
  label: string;
  metric: string;
  value: number | null;
  unit: "count" | "basis_points" | "cents" | "ratio" | "score";
  sample: number | null;
  status: "available" | "insufficient_evidence";
};

export type AskCrmHandlerResult = {
  status: "available" | "insufficient_evidence";
  summary: string;
  rows: AskCrmSafeRow[];
  total: number;
  matured: number;
  excluded: number;
  minimum: string;
  formula: string;
  datasets: string[];
  limitations: string[];
  metricDefinition: string;
  temporalScope: AskCrmTemporalScope;
};

export type AskCrmTemporalScope =
  | { kind: "period"; label: string; fromDay: string; toDay: string }
  | { kind: "snapshot"; label: string; asOf: string }
  | { kind: "fixed_baseline"; label: string; from: string; to: string; snapshot: string; snapshotFrom: string; snapshotTo: string; generatedAt: string }
  | { kind: "all_time"; label: string; asOf: string; generatedAt: string; unboundedRange: true };

type ReadyQuestion = Extract<ParsedAskCrmQuestion, { status: "ready" }>;
export type AskCrmHandler = (question: ReadyQuestion) => Promise<AskCrmHandlerResult>;
export type AskCrmHandlers = Record<AskCrmQuestionId, AskCrmHandler>;

function bounded(rows: readonly AskCrmSafeRow[]) {
  return rows.slice(0, ASK_CRM_MAX_ROWS);
}

const METRIC_DEFINITIONS: Record<AskCrmQuestionId, string> = {
  economic_truth: "Margen realizado: cobros menos reembolsos, chargebacks, comisiones y costes directos registrados.",
  campaign_profitability: "Contribución atribuida por campaña en una única moneda, separada del margen realizado del ledger.",
  profile_performance: "Rendimiento agregado por perfil según ventas o margen atribuido y muestra observada.",
  creative_performance: "Rendimiento agregado por anuncio, creatividad o ángulo según la dimensión solicitada.",
  profile_reactions: "Reacciones estructuradas de feedback vinculadas al perfil; contacto no se considera una reacción.",
  objections: "Número agregado de leads con cada objeción confirmada en feedback estructurado.",
  motivations: "Número agregado de leads con cada motivación confirmada en feedback estructurado.",
  microsegments: "Conversión ajustada de intersecciones maduras sobre el histórico cerrado disponible.",
  confidence: "Calibración entre probabilidad registrada y resultado observado una vez madura la cohorte.",
  anomalies: "Desviación del volumen o conversión frente a su baseline robusto comparable.",
  seasonality: "Volumen mediano observado por día de la semana dentro del periodo cerrado.",
  sales_margin_bridge: "Descomposición aritmética de la variación de ventas y margen frente al periodo anterior comparable.",
  dependencies: "Participación del principal grupo dentro de cada dimensión agregada.",
  forecast: "Extrapolación condicionada de volumen, conversión y economía observados al horizonte solicitado.",
  planning_readiness: "Cobertura madura disponible para construir una planificación manual.",
  existing_decisions: "Conteo agregado de decisiones históricas ya registradas, sin crear defaults.",
  playbooks: "Conteo de la última versión por linaje y estado de propuestas y biblioteca.",
  ranking: "Ranking agregado histórico ya materializado, sin ejecutar una generación con escritura.",
};

function periodScope(question: ReadyQuestion): AskCrmTemporalScope {
  return { kind: "period", label: `${question.period.fromDay} → ${question.period.toDay} · Europe/Madrid`, fromDay: question.period.fromDay, toDay: question.period.toDay };
}

function snapshotScope(question: ReadyQuestion): AskCrmTemporalScope {
  return { kind: "snapshot", label: `Snapshot histórico cerrado a ${question.period.toDay} · Europe/Madrid`, asOf: question.period.toDay };
}

function fixedBaselineScope(report: { generatedAt: Date; snapshot: { day: string; from: Date; to: Date } }): AskCrmTemporalScope {
  const from = planningBaselineFrom(report.generatedAt).toISOString();
  const to = report.generatedAt.toISOString();
  const snapshotFrom = report.snapshot.from.toISOString();
  const snapshotTo = report.snapshot.to.toISOString();
  return { kind: "fixed_baseline", label: `Baseline fija ${from} → ${to}; snapshot ${report.snapshot.day} (${snapshotFrom} → ${snapshotTo})`, from, to, snapshot: report.snapshot.day, snapshotFrom, snapshotTo, generatedAt: to };
}

function allTimeScope(asOf: Date): AskCrmTemporalScope {
  const generatedAt = asOf.toISOString();
  return { kind: "all_time", label: `Histórico sin límite inicial; cutoff ${generatedAt}`, asOf: generatedAt, generatedAt, unboundedRange: true };
}

function metadata(questionId: AskCrmQuestionId, temporalScope: AskCrmTemporalScope) {
  return { metricDefinition: METRIC_DEFINITIONS[questionId], temporalScope };
}

function insufficient(question: ReadyQuestion, dataset: string, reason: string, temporalScope: AskCrmTemporalScope = periodScope(question)): AskCrmHandlerResult {
  const item = catalogItem(question.questionId);
  return {
    status: "insufficient_evidence",
    summary: `${item.title}: ${reason}`,
    rows: [],
    total: 0,
    matured: 0,
    excluded: 0,
    minimum: "El read model debe disponer de datos agregados suficientes y cerrados.",
    formula: "No se calcula una estimación cuando falta evidencia comparable.",
    datasets: [dataset],
    limitations: ["Resultado descriptivo, no causal.", "No se han generado consultas dinámicas ni completado datos ausentes."],
    ...metadata(question.questionId, temporalScope),
  };
}

function available(input: Omit<AskCrmHandlerResult, "status" | "rows"> & { rows: readonly AskCrmSafeRow[] }): AskCrmHandlerResult {
  return { ...input, status: input.rows.some((row) => row.status === "available") ? "available" : "insufficient_evidence", rows: bounded(input.rows) };
}

async function observatory(question: ReadyQuestion): Promise<AskCrmHandlerResult> {
  const report = await getCommercialObservatory({ from: question.period.fromDay, to: question.period.toDay, currency: question.currency ?? undefined }, question.period.to);
  const base = {
    total: report.coverage.observations,
    matured: report.bridge.commercial.current.sample,
    excluded: report.coverage.duplicateObservationsExcluded,
    datasets: ["commercial_observatory", "lead_activity_events", "lead_financial_events"],
    limitations: ["Periodo compuesto solo por días cerrados en Europe/Madrid.", "Las diferencias son descriptivas y no demuestran causalidad."],
    ...metadata(question.questionId, periodScope(question)),
  };
  if (question.questionId === "anomalies") {
    return available({ ...base, summary: "Anomalías observacionales frente a un periodo anterior de igual duración.", minimum: report.anomalies.rule, formula: "Volumen: mediana y MAD. Conversión: Wilson 95% y diferencia material.", rows: report.anomalies.items.map((row) => ({ label: joinAskCrmSafeComponents([row.scope, row.label]), metric: row.metric, value: typeof row.value === "number" ? Math.round(row.value * (row.metric === "conversion" ? 10_000 : 100)) / (row.metric === "conversion" ? 1 : 100) : null, unit: row.metric === "conversion" ? "basis_points" as const : "ratio" as const, sample: row.sample, status: row.state === "insufficient_evidence" ? "insufficient_evidence" as const : "available" as const })) });
  }
  if (question.questionId === "seasonality") {
    return available({ ...base, summary: "Distribución descriptiva por día de la semana.", minimum: report.seasonality.minimum, formula: report.seasonality.rule, rows: report.seasonality.byWeekday.map((row) => ({ label: row.label, metric: "volumen_mediano", value: row.volume.median, unit: "count" as const, sample: row.volume.sample, status: row.volume.sample ? "available" as const : "insufficient_evidence" as const })) });
  }
  if (question.questionId === "sales_margin_bridge") {
    const commercial = report.bridge.commercial;
    const economic = report.bridge.economic;
    const rows: AskCrmSafeRow[] = [
      { label: "Variación de ventas", metric: "delta_sales", value: commercial.deltaSales, unit: "count", sample: commercial.current.sample, status: commercial.status },
      { label: "Contribución de volumen", metric: "volume_contribution", value: Math.round(commercial.volumeContribution * 100) / 100, unit: "ratio", sample: commercial.current.sample, status: commercial.status },
      { label: "Contribución de conversión", metric: "conversion_contribution", value: Math.round(commercial.conversionContribution * 100) / 100, unit: "ratio", sample: commercial.current.sample, status: commercial.status },
    ];
    if (economic.status === "available") rows.push({ label: `Variación de margen (${economic.currency})`, metric: "delta_margin", value: economic.deltaMarginCents, unit: "cents", sample: report.coverage.observations, status: "available" });
    return available({ ...base, summary: "Puente aritmético de ventas y margen frente al periodo anterior comparable.", minimum: commercial.rule, formula: `${commercial.rule} ${report.bridge.note}`, rows });
  }
  if (question.questionId === "dependencies") {
    return available({ ...base, summary: "Concentración y dependencia por dimensión agregada.", minimum: "Al menos una observación cerrada.", formula: report.risk.rule, rows: report.risk.dimensions.map((row) => ({ label: row.dimension, metric: "top_1_share", value: row.top1Bps, unit: "basis_points" as const, sample: row.sample, status: row.sample ? "available" as const : "insufficient_evidence" as const })) });
  }
  if (question.questionId === "economic_truth") {
    const economic = report.bridge.economic;
    if (economic.status !== "available") return insufficient(question, "lead_financial_events", economic.rule);
    return available({ ...base, summary: `Verdad económica observada en ${economic.currency}; no se aplica FX.`, minimum: economic.rule, formula: "Cobros − reembolsos/chargebacks − comisiones − costes directos.", rows: [{ label: `Margen del periodo (${economic.currency})`, metric: "realized_margin", value: economic.current.marginCents, unit: "cents", sample: report.coverage.observations, status: "available" }, { label: `Variación (${economic.currency})`, metric: "delta_margin", value: economic.deltaMarginCents, unit: "cents", sample: report.coverage.observations, status: "available" }] });
  }
  return insufficient(question, "commercial_observatory", "El tema no dispone de una proyección observacional segura.");
}

async function feedback(question: ReadyQuestion): Promise<AskCrmHandlerResult> {
  const report = await getObjectionMotivationIntelligence({ from: question.period.from, to: question.period.to, actorId: null });
  const selected = question.questionId === "objections" ? report.objections : report.motivations;
  const grouped = new Map<string, { label: string; leads: number; sales: number }>();
  for (const row of selected) {
    const current = grouped.get(row.value) ?? { label: row.label, leads: 0, sales: 0 };
    current.leads += row.leads;
    current.sales += row.sales;
    grouped.set(row.value, current);
  }
  const groupedRows = [...grouped.values()].sort((left, right) => right.leads - left.leads || left.label.localeCompare(right.label));
  const rows = groupedRows.map((row) => ({ label: sanitizeAskCrmLabel(row.label), metric: "mentions", value: row.leads, unit: "count" as const, sample: row.leads, status: "available" as const }));
  return available({ summary: question.questionId === "objections" ? "Objeciones confirmadas en feedback estructurado." : "Motivaciones confirmadas en feedback estructurado.", rows, total: groupedRows.reduce((sum, row) => sum + row.leads, 0), matured: groupedRows.reduce((sum, row) => sum + row.sales, 0), excluded: 0, minimum: "Feedback estructurado dentro del periodo y categoría del catálogo cerrado.", formula: "Conteo agregado de menciones; las referencias y los identificadores de lead se excluyen.", datasets: ["lead_activity_events.caller_feedback"], limitations: ["Una mención no implica causalidad sobre la venta.", "No se exponen transcripciones, notas ni referencias de evidencia."], ...metadata(question.questionId, periodScope(question)) });
}

async function profitability(question: ReadyQuestion): Promise<AskCrmHandlerResult> {
  if (question.metric === "reaction") return insufficient(question, "feedback_intelligence", "No existe una proyección estructurada y segura que vincule reacción con esta dimensión; contacto no equivale a reacción.");
  if (!question.currency) return insufficient(question, "profitability", "Selecciona una única moneda para atribuir gasto sin conversión FX.");
  const report = await profitabilityService.overview({ from: question.period.from, to: new Date(question.period.to.getTime() - 1), currency: question.currency });
  const sourceRows = question.questionId === "campaign_profitability" ? report.campaigns.map((row) => ({ ...row, name: joinAskCrmSafeComponents([row.source, row.campaign]) }))
    : question.questionId === "profile_performance" ? report.profiles
      : question.dimension === "ad" ? report.ads
        : question.dimension === "angle" ? report.acquisitionAngles
          : report.creatives;
  const metric = question.metric ?? (question.questionId === "campaign_profitability" ? "margin" : "sales");
  const rows: AskCrmSafeRow[] = sourceRows.map((row) => ({
    label: sanitizeAskCrmLabel(row.name),
    metric,
    value: metric === "margin" ? row.estimatedContributionCents : row.sales,
    unit: metric === "margin" ? "cents" : "count",
    sample: row.leads,
    status: row.leads ? "available" : "insufficient_evidence",
  }));
  return available({
    summary: `${catalogItem(question.questionId).title} en ${question.currency}, con atribución actual de un solo toque.`,
    rows,
    total: report.summary.leads,
    matured: report.summary.sales,
    excluded: 0,
    minimum: "Gasto publicitario del periodo y leads atribuidos en la misma moneda.",
    formula: metric === "margin" ? "Contribución estimada = ingresos estimados − gasto publicitario asignado." : "Conteo de ventas sobre el grupo atribuido.",
    datasets: ["campaign_spend_periods", "lead_activity_events", "profitability_read_model"],
    limitations: [report.methodology, "La contribución publicitaria estimada permanece separada de la verdad económica del ledger."],
    ...metadata(question.questionId, periodScope(question)),
  });
}

async function evidence(question: ReadyQuestion): Promise<AskCrmHandlerResult> {
  const asOf = new Date(question.period.to.getTime() - 1);
  if (question.questionId === "microsegments") {
    if (!question.currency) return insufficient(question, "commercial_evidence", "Selecciona una moneda única para evitar mezclar economías.", snapshotScope(question));
    const rows = await getMicrosegments(asOf, question.currency);
    return available({ summary: `Microsegmentos maduros en ${question.currency}, sin FX.`, rows: rows.map((row) => ({ label: joinAskCrmSafeComponents(row.segment.map(([key, value]) => askCrmSafeTaxonomyComponent(key, value))), metric: "conversion", value: row.conversionBps, unit: "basis_points" as const, sample: row.sample, status: "available" as const })), total: rows.reduce((sum, row) => sum + row.sample, 0), matured: rows.reduce((sum, row) => sum + row.sample, 0), excluded: 0, minimum: "30 casos maduros por intersección.", formula: "Conversión ajustada y margen esperado sobre cohortes históricas maduras de una sola moneda.", datasets: ["commercial_evidence", "lead_financial_events"], limitations: ["Los segmentos son observacionales, no causales.", "Máximo 10 filas y sin identificadores de lead."], ...metadata(question.questionId, snapshotScope(question)) });
  }
  const report = await getConfidenceCentre(asOf);
  return available({ summary: "Calibración de recomendaciones server-owned maduras.", rows: report.bins.filter((row) => row.sample > 0).map((row) => ({ label: `${row.fromBps / 100}%–${row.toBps / 100}%`, metric: "actual_probability", value: row.actualBps, unit: "basis_points" as const, sample: row.sample, status: "available" as const })), total: report.coverage.maturedShown, matured: report.coverage.calibrated, excluded: report.legacyExcluded + report.missingEconomic, minimum: "Snapshots mostrados con 30 días de madurez.", formula: "Brier y ECE sobre probabilidad registrada antes del resultado.", datasets: ["lead_activity_events.recommendation_shown", "commercial_evidence"], limitations: ["Calibración descriptiva; no modifica políticas ni recomendaciones.", "Snapshots legacy y sin economía se informan como excluidos."], ...metadata(question.questionId, snapshotScope(question)) });
}

async function planning(question: ReadyQuestion): Promise<AskCrmHandlerResult> {
  const report = await getCommercialPlanning({ currency: question.currency ?? undefined, scenario: {} });
  const temporalScope = fixedBaselineScope(report);
  const horizon = question.horizon ?? 90;
  const forecast = report.baseline.forecast.find((row) => row.days === horizon);
  if (question.questionId === "forecast") {
    if (!forecast) return insufficient(question, "commercial_planning", "La base observada no alcanza el horizonte solicitado.", temporalScope);
    return available({ summary: `Base observada para ${horizon} días${question.currency ? ` en ${question.currency}` : ""}.`, rows: [{ label: "Leads", metric: "leads", value: forecast.leads, unit: "count", sample: report.coverage.observations, status: "available" }, { label: "Ventas", metric: "sales", value: forecast.sales, unit: "count", sample: report.baseline.coverage.conversionMature, status: "available" }, { label: "Margen antes de costes no modelados", metric: "margin", value: forecast.marginBeforeUnmodeledCostsCents, unit: "cents", sample: report.baseline.coverage.economicMature, status: "available" }], total: report.coverage.observations, matured: report.baseline.coverage.conversionMature, excluded: report.coverage.duplicateObservationsExcluded, minimum: "Conversión madura a 30 días y economía madura a 90 días.", formula: "Volumen × tasas observadas; margen = cobros − reembolsos − costes − comisiones − publicidad.", datasets: ["commercial_planning", "lead_activity_events", "lead_financial_events", "campaign_spend_periods"], limitations: [report.notice, "Es una extrapolación condicionada, no una promesa ni una predicción causal."], ...metadata(question.questionId, temporalScope) });
  }
  return available({ summary: "Cobertura disponible para preparar una planificación manual.", rows: [{ label: "Observaciones", metric: "observations", value: report.coverage.observations, unit: "count", sample: report.coverage.observations, status: "available" }, { label: "Conversión madura", metric: "conversion_mature", value: report.baseline.coverage.conversionMature, unit: "count", sample: report.coverage.observations, status: report.baseline.coverage.conversionMature >= report.baseline.coverage.minimumConversionSample ? "available" : "insufficient_evidence" }, { label: "Economía madura", metric: "economic_mature", value: report.baseline.coverage.economicMature, unit: "count", sample: report.coverage.observations, status: report.baseline.coverage.economicMature > 0 ? "available" : "insufficient_evidence" }], total: report.coverage.observations, matured: report.baseline.coverage.conversionMature, excluded: report.coverage.duplicateObservationsExcluded, minimum: `${report.baseline.coverage.minimumConversionSample} casos maduros para conversión; la economía requiere eventos en la moneda elegida.`, formula: "Comprobación de cobertura; no crea contrataciones, comisiones ni escenarios.", datasets: ["commercial_planning"], limitations: ["Solo lectura; los supuestos se introducen manualmente en Planificación comercial.", "No ejecuta decisiones operativas."], ...metadata(question.questionId, temporalScope) });
}

async function playbooks(question: ReadyQuestion): Promise<AskCrmHandlerResult> {
  const asOf = new Date();
  const [proposals, libraries] = await Promise.all([commercialPlaybooksRepository.listProposalVersions(), commercialPlaybooksRepository.listLibraryVersions()]);
  const visibleProposals = proposals.filter((row) => row.createdAt <= asOf);
  const visibleLibraries = libraries.filter((row) => row.createdAt <= asOf);
  const latestProposals = [...Map.groupBy(visibleProposals, (row) => row.lineageKey).values()].flatMap((rows) => [...rows].sort((left, right) => right.version - left.version)[0] ?? []);
  const rows: AskCrmSafeRow[] = ["draft", "approved", "rejected"].map((status) => ({ label: status, metric: "proposals", value: latestProposals.filter((row) => row.status === status).length, unit: "count", sample: latestProposals.length, status: "available" }));
  rows.push({ label: "published", metric: "library_versions", value: visibleLibraries.filter((row) => row.type === "playbook" && row.status === "published").length, unit: "count", sample: visibleLibraries.length, status: "available" });
  return available({ summary: "Estado agregado de propuestas y versiones de playbooks.", rows, total: latestProposals.length, matured: rows.find((row) => row.label === "approved")?.value ?? 0, excluded: proposals.length - visibleProposals.length + libraries.length - visibleLibraries.length, minimum: "Versiones append-only registradas.", formula: "Última versión por linaje y conteo por estado.", datasets: ["commercial_playbook_proposals", "commercial_library_versions"], limitations: ["No se exponen títulos, contenido, actores, razones ni referencias internas.", "La consulta no genera, aprueba, rechaza ni publica playbooks."], ...metadata(question.questionId, allTimeScope(asOf)) });
}

const readOnlyUnavailable = (dataset: string): AskCrmHandler => async (question) => insufficient(question, dataset, "El read model histórico seguro todavía no contiene registros agregados suficientes; no se ejecutará la ruta que escribe defaults.", allTimeScope(new Date()));
const profileReactions: AskCrmHandler = async (question) => insufficient(question, "feedback_intelligence", "El feedback actual no conserva una unión histórica segura entre perfil y reacción; no se aproxima con contacto ni atribución vigente.");

export const ASK_CRM_HANDLERS: AskCrmHandlers = {
  economic_truth: observatory,
  campaign_profitability: profitability,
  profile_performance: profitability,
  creative_performance: profitability,
  profile_reactions: profileReactions,
  objections: feedback,
  motivations: feedback,
  microsegments: evidence,
  confidence: evidence,
  anomalies: observatory,
  seasonality: observatory,
  sales_margin_bridge: observatory,
  dependencies: observatory,
  forecast: planning,
  planning_readiness: planning,
  existing_decisions: readOnlyUnavailable("decision_ledger"),
  playbooks,
  ranking: readOnlyUnavailable("rankings_read_model"),
};
