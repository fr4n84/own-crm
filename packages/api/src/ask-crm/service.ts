import { ASK_CRM_CATALOG, ASK_CRM_MAX_ROWS, catalogItem, parseAskCrmQuestion, sanitizeAskCrmLabel, type AskCrmOverrides } from "./domain";
import { ASK_CRM_HANDLERS, type AskCrmHandlers } from "./handlers";

export type AskCrmInput = { question: string; overrides?: AskCrmOverrides };

export function createAskCrmService(handlers: AskCrmHandlers = ASK_CRM_HANDLERS, clock: () => Date = () => new Date()) {
  return {
    catalog() {
      return ASK_CRM_CATALOG.map(({ aliases: _aliases, ...item }) => item);
    },

    async ask(input: AskCrmInput) {
      const parsed = parseAskCrmQuestion({ ...input, now: clock() });
      if (parsed.status === "unsupported") {
        return {
          status: "unsupported" as const,
          message: "La pregunta queda fuera del catálogo seguro. Selecciona uno de los temas disponibles.",
          catalog: this.catalog(),
        };
      }
      if (parsed.status === "clarification_required") {
        return {
          status: "clarification_required" as const,
          message: parsed.clarification.prompt,
          clarification: parsed.clarification,
        };
      }
      const item = catalogItem(parsed.questionId);
      const result = await handlers[parsed.questionId](parsed);
      const rows = result.rows.map((row) => ({ ...row, label: sanitizeAskCrmLabel(row.label) })).slice(0, ASK_CRM_MAX_ROWS);
      const hasAvailableRow = rows.some((row) => row.status === "available");
      const common = {
        questionId: parsed.questionId,
        title: item.title,
        summary: result.summary,
        rows,
        drilldown: { label: `Abrir ${item.title}`, route: item.route },
        explanation: {
          definition: result.metricDefinition,
          temporalScope: result.temporalScope,
          timeZone: "Europe/Madrid" as const,
          currency: parsed.currency,
          currencyOrigin: parsed.currencyOrigin,
          noFx: true as const,
          total: result.total,
          matured: result.matured,
          excluded: result.excluded,
          minimum: result.minimum,
          datasets: result.datasets,
          formula: result.formula,
          limitations: result.limitations,
          interpretation: "Resultado agregado y descriptivo. No implica causalidad ni ejecuta decisiones operativas." as const,
        },
      };
      if (!hasAvailableRow) return { status: "insufficient_evidence" as const, ...common };
      return { status: "answered" as const, ...common };
    },
  };
}

export const askCrmService = createAskCrmService();
