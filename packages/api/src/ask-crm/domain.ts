import { madridDayKey, normalizeMadridRange } from "../commercial-observatory/domain";

export const ASK_CRM_TIME_ZONE = "Europe/Madrid";
export const ASK_CRM_MAX_RANGE_DAYS = 366;
export const ASK_CRM_MAX_ROWS = 10;

export const ASK_CRM_CATALOG = [
  { id: "economic_truth", title: "Verdad económica", example: "Dame la verdad económica", route: "/rentabilidad", source: "financial_truth", aliases: ["verdad economica", "margen real", "margen", "cobros", "economia", "rentabilidad"] },
  { id: "campaign_profitability", title: "Rentabilidad por campaña", example: "Muéstrame la rentabilidad por campaña", route: "/rentabilidad", source: "profitability", aliases: ["rentabilidad por campana", "rentabilidad de campana", "rentabilidad campana", "roas", "gasto publicitario"] },
  { id: "profile_performance", title: "Rendimiento por perfil", example: "Muéstrame el rendimiento por perfil", route: "/estadisticas-de-feedback", source: "commercial_observatory", aliases: ["rendimiento por perfil", "perfil comercial", "perfiles"] },
  { id: "creative_performance", title: "Anuncios, creatividades y ángulos", example: "Compara anuncios, creatividades y ángulos", route: "/observatorio-comercial/biblioteca-publicitaria", source: "profitability", aliases: ["anuncios", "creatividades", "angulos", "mejor campana", "campanas"] },
  { id: "profile_reactions", title: "Reacciones por perfil y motivación", example: "Dame las reacciones por perfil y motivación", route: "/estadisticas-de-feedback", source: "feedback_intelligence", aliases: ["reacciones por perfil", "reaccion por perfil", "reaccion de motivacion"] },
  { id: "objections", title: "Objeciones", example: "Cuáles son las objeciones", route: "/inteligencia-comercial", source: "feedback_intelligence", aliases: ["objeciones", "objecion"] },
  { id: "motivations", title: "Motivaciones", example: "Cuáles son las motivaciones", route: "/inteligencia-comercial", source: "feedback_intelligence", aliases: ["motivaciones", "motivacion"] },
  { id: "microsegments", title: "Microsegmentos", example: "Descubre los microsegmentos", route: "/evidencia-comercial", source: "commercial_evidence", aliases: ["microsegmentos", "microsegmento"] },
  { id: "confidence", title: "Confianza de recomendaciones", example: "Dame la confianza de recomendaciones", route: "/evidencia-comercial", source: "commercial_evidence", aliases: ["confianza", "calibracion"] },
  { id: "anomalies", title: "Anomalías", example: "Qué anomalías hubo", route: "/observatorio-comercial", source: "commercial_observatory", aliases: ["anomalias", "anomalia", "cambio raro"] },
  { id: "seasonality", title: "Estacionalidad", example: "Muéstrame la estacionalidad", route: "/observatorio-comercial", source: "commercial_observatory", aliases: ["estacionalidad", "dia de la semana", "temporada"] },
  { id: "sales_margin_bridge", title: "Puente de ventas y margen", example: "Dame el puente de ventas y margen", route: "/observatorio-comercial", source: "commercial_observatory", aliases: ["puente de ventas y margen", "puente de ventas", "puente de margen", "explica el margen", "explica las ventas"] },
  { id: "dependencies", title: "Dependencias y riesgo", example: "Dame las dependencias y riesgo", route: "/observatorio-comercial", source: "commercial_observatory", aliases: ["dependencias", "dependencia", "concentracion", "riesgo comercial"] },
  { id: "forecast", title: "Forecast 30/60/90", example: "Dame el forecast 30/60/90", route: "/planificacion-comercial", source: "commercial_planning", aliases: ["forecast", "prevision", "proyeccion"] },
  { id: "planning_readiness", title: "Preparación de planificación", example: "Revisa la preparación de planificación", route: "/planificacion-comercial", source: "commercial_planning", aliases: ["preparacion de planificacion", "capacidad", "contratacion", "comisiones"] },
  { id: "existing_decisions", title: "Decisiones existentes", example: "Muéstrame las decisiones existentes", route: "/centro-de-decisiones", source: "decision_ledger", aliases: ["decisiones existentes", "decisiones", "decision semanal"] },
  { id: "playbooks", title: "Playbooks", example: "Dame el estado de los playbooks", route: "/playbooks-que-aprenden", source: "commercial_playbooks", aliases: ["playbooks", "playbook", "guion comercial"] },
  { id: "ranking", title: "Ranking por periodo", example: "Muéstrame el ranking por periodo", route: "/rankings", source: "rankings_read_model", aliases: ["ranking por periodo", "ranking", "rankings", "mejor caller", "mejor closer"] },
] as const;

export type AskCrmQuestionId = (typeof ASK_CRM_CATALOG)[number]["id"];
export type AskCrmMetric = "sales" | "margin" | "reaction";
export type AskCrmHorizon = 30 | 60 | 90;
export type AskCrmDimension = "source" | "campaign" | "profile" | "ad" | "creative" | "angle" | "caller" | "closer";

export type AskCrmOverrides = {
  fromDay?: string;
  toDay?: string;
  currency?: string;
  horizon?: AskCrmHorizon;
  dimension?: AskCrmDimension;
  metric?: AskCrmMetric;
};

export type AskCrmPeriod = {
  fromDay: string;
  toDay: string;
  from: Date;
  to: Date;
  days: number;
  timeZone: typeof ASK_CRM_TIME_ZONE;
};

export type AskCrmClarification = {
  key: "intent" | "metric" | "currency" | "period";
  prompt: string;
  options: readonly string[];
};

export type ParsedAskCrmQuestion =
  | { status: "unsupported"; normalizedQuestion: string }
  | { status: "clarification_required"; normalizedQuestion: string; clarification: AskCrmClarification }
  | {
      status: "ready";
      normalizedQuestion: string;
      questionId: AskCrmQuestionId;
      period: AskCrmPeriod;
      currency: string | null;
      currencyOrigin: "question" | "override" | "none";
      horizon: AskCrmHorizon | null;
      dimension: AskCrmDimension | null;
      metric: AskCrmMetric | null;
    };

export function normalizeAskCrmText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export const ISO_CURRENCIES = new Set([
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWG",
]);

export function isIsoCurrency(value: string) {
  return ISO_CURRENCIES.has(value);
}

function sanitizeAtomicAskCrmLabel(value: string) {
  const normalized = value.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  const suspicious = normalized.length > 120
    || normalized.split(" ").length > 8
    || /[^\p{L}\p{N}\s/&+_.:()'’\-]/u.test(normalized)
    || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(normalized)
    || /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|es)\b)/iu.test(normalized)
    || /(?:\+?\d[\s().-]*){7,}/u.test(normalized)
    || /\b(?:[a-f0-9]{24,}|[A-Za-z0-9_-]{32,})\b/u.test(normalized);
  return !normalized || suspicious ? "Valor protegido" : normalized;
}

export function sanitizeAskCrmLabel(value: string) {
  if (!value.includes(" · ")) return sanitizeAtomicAskCrmLabel(value);
  const components = value.split(" · ");
  if (components.length > 8 || components.some((component) => component.length === 0)) return "Valor protegido";
  return components.map(sanitizeAtomicAskCrmLabel).join(" · ");
}

export function joinAskCrmSafeComponents(components: readonly string[]) {
  return components.map(sanitizeAtomicAskCrmLabel).join(" · ");
}

export function askCrmSafeTaxonomyComponent(key: string, value: string) {
  return `${sanitizeAtomicAskCrmLabel(key)}: ${sanitizeAtomicAskCrmLabel(value)}`;
}

function ordinal(day: string) {
  const parts = day.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const date = parts[2];
  if (year === undefined || month === undefined || date === undefined) throw new RangeError("Invalid calendar day");
  return Math.floor(Date.UTC(year, month - 1, date) / 86_400_000);
}

function dayFromOrdinal(value: number) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

function closedPeriod(input: { normalizedQuestion: string; overrides?: AskCrmOverrides; now: Date }): AskCrmPeriod {
  const explicitFrom = input.overrides?.fromDay;
  const explicitTo = input.overrides?.toDay;
  if ((explicitFrom && !explicitTo) || (!explicitFrom && explicitTo)) throw new RangeError("Both period boundaries are required");
  const today = madridDayKey(input.now);
  const lastClosedDay = dayFromOrdinal(ordinal(today) - 1);
  const explicitDaysMatch = input.normalizedQuestion.match(/\bultimos\s+(7|30|60|90|180|365)(?:\s*dias?)?\b|\b(7|30|60|90|180|365)\s*dias?\b/);
  const explicitDays = explicitDaysMatch?.[1] ?? explicitDaysMatch?.[2];
  const detectedDays = explicitDays ? Number(explicitDays)
    : /\b(semana|ultimos 7)\b/.test(input.normalizedQuestion) ? 7
      : /\b(mes|ultimos 30)\b/.test(input.normalizedQuestion) ? 30
        : /\b(ano|ultimo ano|ultimos 365)\b/.test(input.normalizedQuestion) ? 365
          : 30;
  const fromDay = explicitFrom ?? dayFromOrdinal(ordinal(lastClosedDay) - detectedDays + 1);
  const toDay = explicitTo ?? lastClosedDay;
  const requestedDays = ordinal(toDay) - ordinal(fromDay) + 1;
  if (requestedDays > ASK_CRM_MAX_RANGE_DAYS) throw new RangeError(`Period cannot exceed ${ASK_CRM_MAX_RANGE_DAYS} days`);
  if (requestedDays < 1) throw new RangeError("Period must contain at least one day");
  const range = normalizeMadridRange({ fromDay, toDay, now: input.now });
  const days = ordinal(range.lastClosedDay) - ordinal(fromDay) + 1;
  return { fromDay, toDay: range.lastClosedDay, from: range.from, to: range.to, days, timeZone: ASK_CRM_TIME_ZONE };
}

function currencyFrom(input: { question: string; normalizedQuestion: string; override?: string }) {
  if (input.override && !isIsoCurrency(input.override)) return { clarification: true as const, options: ["EUR", "USD", "MXN", "COP"] };
  const mentioned = new Set<string>();
  for (const token of input.normalizedQuestion.split(" ")) {
    const currency = token.toUpperCase();
    if (isIsoCurrency(currency)) mentioned.add(currency);
  }
  const currencyStopWords = new Set(["LOS", "LAS", "UNA", "UNO", "MIS", "TUS", "SUS", "DEL"]);
  for (const match of input.question.matchAll(/\b(?:moneda|en)\s+([A-Za-z]{3})\b/giu)) {
    const candidate = match[1]?.toUpperCase();
    if (candidate && !currencyStopWords.has(candidate) && !isIsoCurrency(candidate)) {
      return { clarification: true as const, options: ["EUR", "USD", "MXN", "COP"] };
    }
  }
  if (/\beuros?\b/.test(input.normalizedQuestion)) mentioned.add("EUR");
  if (/\bdolares?\b/.test(input.normalizedQuestion)) mentioned.add("USD");
  if (/\bpesos?\b/.test(input.normalizedQuestion) && !input.override) return { clarification: true as const, options: ["MXN", "COP", "ARS", "CLP"] };
  if (input.override) mentioned.add(input.override);
  if (mentioned.size > 1) return { clarification: true as const, options: [...mentioned].sort() };
  const value = [...mentioned][0] ?? null;
  return { clarification: false as const, value, origin: input.override ? "override" as const : value ? "question" as const : "none" as const };
}

function intentFrom(normalizedQuestion: string) {
  const matches = ASK_CRM_CATALOG.map((item) => ({ item, score: Math.max(...item.aliases.map((alias) => normalizedQuestion.includes(alias) ? alias.length : 0)) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));
  const first = matches[0];
  if (!first) return { status: "unsupported" as const };
  if (matches[1]?.score === first.score) return { status: "ambiguous" as const, options: matches.filter((item) => item.score === first.score).map((item) => item.item.title) };
  return { status: "ready" as const, id: first.item.id };
}

function metricFrom(normalizedQuestion: string, override?: AskCrmMetric): AskCrmMetric | null {
  if (override) return override;
  if (/\b(reaccion|respuesta)\b/.test(normalizedQuestion)) return "reaction";
  if (/\b(margen|rentabilidad|roas)\b/.test(normalizedQuestion)) return "margin";
  if (/\b(ventas|venta|conversion)\b/.test(normalizedQuestion)) return "sales";
  return null;
}

function horizonFrom(normalizedQuestion: string, override?: AskCrmHorizon): AskCrmHorizon | null {
  if (override) return override;
  if (/\b90\b(?!\s*dias?)/.test(normalizedQuestion)) return 90;
  if (/\b60\b(?!\s*dias?)/.test(normalizedQuestion)) return 60;
  if (/\b30\b(?!\s*dias?)/.test(normalizedQuestion)) return 30;
  return null;
}

function dimensionFrom(normalizedQuestion: string, override?: AskCrmDimension): AskCrmDimension | null {
  if (override) return override;
  const dimensions: readonly [AskCrmDimension, RegExp][] = [
    ["campaign", /\bcampana/], ["profile", /\bperfil/], ["creative", /\bcreatividad/], ["angle", /\bangulo/],
    ["ad", /\banuncio/], ["source", /\bfuente/], ["caller", /\bcaller/], ["closer", /\bcloser/],
  ];
  return dimensions.find(([, pattern]) => pattern.test(normalizedQuestion))?.[0] ?? null;
}

export function parseAskCrmQuestion(input: { question: string; overrides?: AskCrmOverrides; now?: Date }): ParsedAskCrmQuestion {
  const now = input.now ?? new Date();
  const normalizedQuestion = normalizeAskCrmText(input.question);
  const intent = intentFrom(normalizedQuestion);
  if (intent.status === "unsupported") return { status: "unsupported", normalizedQuestion };
  if (intent.status === "ambiguous") return { status: "clarification_required", normalizedQuestion, clarification: { key: "intent", prompt: "La pregunta coincide con varios temas del catálogo.", options: intent.options } };
  const metric = metricFrom(normalizedQuestion, input.overrides?.metric);
  if (intent.id === "creative_performance" && normalizedQuestion.includes("mejor campana") && !metric) {
    return { status: "clarification_required", normalizedQuestion, clarification: { key: "metric", prompt: "¿Qué significa mejor campaña para esta pregunta?", options: ["sales", "margin", "reaction"] } };
  }
  const currency = metric === "reaction"
    ? { clarification: false as const, value: null, origin: "none" as const }
    : currencyFrom({ question: input.question, normalizedQuestion, override: input.overrides?.currency });
  if (currency.clarification) return { status: "clarification_required", normalizedQuestion, clarification: { key: "currency", prompt: "Selecciona una única moneda. No se mezclan monedas ni se aplica FX.", options: currency.options } };
  return {
    status: "ready",
    normalizedQuestion,
    questionId: intent.id,
    period: closedPeriod({ normalizedQuestion, overrides: input.overrides, now }),
    currency: currency.value,
    currencyOrigin: currency.origin,
    horizon: intent.id === "forecast" ? horizonFrom(normalizedQuestion, input.overrides?.horizon) : null,
    dimension: dimensionFrom(normalizedQuestion, input.overrides?.dimension),
    metric,
  };
}

export function catalogItem(questionId: AskCrmQuestionId) {
  const item = ASK_CRM_CATALOG.find((candidate) => candidate.id === questionId);
  if (!item) throw new Error("Question is outside the server-owned catalog");
  return item;
}
