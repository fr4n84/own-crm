export const OBSERVATORY_METRIC_EXPLANATION_VERSION = "observatory-metric-explanations-v1";
export const OBSERVATORY_METRIC_TIME_ZONE = "Europe/Madrid";

export type ObservatoryMetricId =
  | "seasonality.weekly_volume"
  | "seasonality.weekday_volume"
  | "seasonality.weekday_conversion"
  | "anomalies.volume"
  | "anomalies.conversion"
  | "bridge.commercial_delta"
  | "bridge.volume_contribution"
  | "bridge.conversion_contribution"
  | "bridge.economic_margin"
  | "risk.top1"
  | "risk.top3"
  | "risk.hhi"
  | "risk.absolute_exposure"
  | "risk.negative_margin"
  | "quality.unique_observations"
  | "quality.duplicates_excluded"
  | "quality.without_attribution"
  | "quality.sales_without_ledger";

type DataQualityState = "available" | "limited" | "unavailable";
type StatisticalConfidenceState = "descriptive" | "moderate" | "insufficient";

export type ObservatoryMetricExplanation = {
  id: ObservatoryMetricId;
  version: typeof OBSERVATORY_METRIC_EXPLANATION_VERSION;
  title: string;
  meaning: string;
  formula: string;
  unit: string;
  sources: readonly string[];
  period: { from: Date; to: Date; asOf: Date; timeZone: typeof OBSERVATORY_METRIC_TIME_ZONE; boundary: "[desde, hasta)" };
  syntheticExample: { scenario: string; result: string };
  limitations: readonly string[];
  evidence: {
    dataQuality: { state: DataQualityState; explanation: string };
    statisticalConfidence: { state: StatisticalConfidenceState; explanation: string };
  };
  humanRecommendation: string;
};

type ExplanationInput = {
  from: Date;
  to: Date;
  asOf: Date;
  observations: number;
  duplicateObservationsExcluded: number;
  withoutAttribution: number;
  salesWithoutLedger: number | null;
  currency: string | null;
  seasonalityAvailable: boolean;
  anomaliesAvailable: boolean;
  commercialBridgeAvailable: boolean;
  economicBridgeAvailable: boolean;
  riskAvailable: boolean;
};

type MetricSpec = Omit<ObservatoryMetricExplanation, "version" | "period" | "evidence"> & {
  area: "seasonality" | "anomalies" | "commercial" | "economic" | "risk" | "quality";
};

const SPECS: readonly MetricSpec[] = [
  { id: "seasonality.weekly_volume", area: "seasonality", title: "Volumen semanal", meaning: "Número de leads asignados en cada semana completa y cerrada.", formula: "Conteo de leads únicos cuya asignación cae dentro de la semana cerrada.", unit: "Leads", sources: ["Asignación del lead"], syntheticExample: { scenario: "Una semana cerrada contiene 42 asignaciones únicas.", result: "Volumen semanal = 42 leads." }, limitations: ["Describe el calendario observado; no explica por qué cambia el volumen."], humanRecommendation: "Compara varias semanas completas antes de ajustar capacidad o campañas." },
  { id: "seasonality.weekday_volume", area: "seasonality", title: "Volumen por día de la semana", meaning: "Volumen habitual de cada día usando la mediana y su dispersión.", formula: "Mediana de leads diarios; IQR = percentil 75 − percentil 25.", unit: "Leads por día", sources: ["Asignación del lead", "Calendario Europe/Madrid"], syntheticExample: { scenario: "Los lunes cerrados registran 8, 10, 10 y 14 leads.", result: "Mediana = 10; el IQR muestra la variación central." }, limitations: ["Festivos y cambios de inversión pueden alterar el patrón."], humanRecommendation: "Usa el patrón como contexto operativo, no como predicción automática." },
  { id: "seasonality.weekday_conversion", area: "seasonality", title: "Conversión por día de la semana", meaning: "Conversión descriptiva de cohortes maduras según su día de asignación.", formula: "Ventas maduras ÷ leads maduros × 100; resumen por mediana entre días equivalentes.", unit: "Porcentaje", sources: ["Asignación del lead", "Venta confirmada"], syntheticExample: { scenario: "20 leads maduros asignados en martes generan 4 ventas.", result: "Conversión = 20%." }, limitations: ["La mezcla de campañas y perfiles puede explicar diferencias aparentes."], humanRecommendation: "Revisa mezcla y tamaño de muestra antes de cambiar turnos o reparto." },
  { id: "anomalies.volume", area: "anomalies", title: "Anomalía de volumen", meaning: "Señala un cambio material de volumen frente al periodo anterior comparable.", formula: "Compara media diaria actual con mediana histórica; exige >3 MAD, >2 leads/día y ≥20% de materialidad.", unit: "Leads por día y estado", sources: ["Asignación del lead"], syntheticExample: { scenario: "La referencia es 10 leads/día, MAD 1, y el periodo actual 16.", result: "La diferencia 6 supera 3 MAD, 2 leads y 20%: anomalía." }, limitations: ["Una anomalía no identifica causa ni distingue cambios planificados."], humanRecommendation: "Confirma primero campañas, carga y calidad de importación antes de actuar." },
  { id: "anomalies.conversion", area: "anomalies", title: "Anomalía de conversión", meaning: "Señala una separación material entre conversiones maduras actuales y de referencia.", formula: "Compara intervalos Wilson 95%; exige muestras mínimas y diferencia ≥5 puntos porcentuales.", unit: "Porcentaje y estado", sources: ["Asignación del lead", "Venta confirmada"], syntheticExample: { scenario: "La conversión pasa de 10% a 18% con intervalos que no se solapan.", result: "Si se cumplen las muestras mínimas, se marca anomalía." }, limitations: ["No controla por todas las diferencias de campaña, producto o dificultad."], humanRecommendation: "Segmenta y revisa el proceso comercial antes de atribuir el cambio a una persona." },
  { id: "bridge.commercial_delta", area: "commercial", title: "Cambio de ventas", meaning: "Diferencia de ventas maduras entre el periodo actual y el anterior comparable.", formula: "Ventas actuales − ventas de referencia.", unit: "Ventas", sources: ["Asignación del lead", "Venta confirmada"], syntheticExample: { scenario: "Hay 18 ventas actuales y 14 de referencia.", result: "Delta comercial = +4 ventas." }, limitations: ["Es una diferencia aritmética, no una estimación causal."], humanRecommendation: "Lee el delta junto a volumen, conversión y madurez de las cohortes." },
  { id: "bridge.volume_contribution", area: "commercial", title: "Contribución de volumen", meaning: "Parte aritmética del cambio de ventas asociada al cambio de muestra madura.", formula: "(Muestra actual − muestra de referencia) × tasa media de conversión.", unit: "Ventas equivalentes", sources: ["Asignación del lead", "Venta confirmada"], syntheticExample: { scenario: "La muestra crece 20 leads y la tasa media es 15%.", result: "Contribución de volumen = 3 ventas equivalentes." }, limitations: ["La descomposición simétrica no demuestra causalidad."], humanRecommendation: "Úsala para formular hipótesis y valida después la causa operativa." },
  { id: "bridge.conversion_contribution", area: "commercial", title: "Contribución de conversión", meaning: "Parte aritmética residual del cambio de ventas asociada a la diferencia de tasa.", formula: "Delta de ventas − contribución de volumen.", unit: "Ventas equivalentes", sources: ["Asignación del lead", "Venta confirmada"], syntheticExample: { scenario: "El delta es +5 y la contribución de volumen +3.", result: "Contribución de conversión = +2." }, limitations: ["Incluye cualquier diferencia no explicada por volumen; no identifica su origen."], humanRecommendation: "Contrasta campañas, perfiles y calidad antes de concluir que mejoró el equipo." },
  { id: "bridge.economic_margin", area: "economic", title: "Cambio de margen realizado", meaning: "Cambio del margen de caja realizado en una moneda única.", formula: "Cobros − reembolsos/chargebacks − comisiones − costes directos, actual menos referencia.", unit: "Importe monetario", sources: ["Ledger financiero append-only", "Reversiones financieras"], syntheticExample: { scenario: "Cobros 10.000 €, devoluciones 500 €, comisiones 1.000 € y costes 2.000 €.", result: "Margen realizado = 6.500 € antes de publicidad." }, limitations: ["No mezcla monedas ni incluye hechos ausentes del ledger."], humanRecommendation: "Concilia eventos incompletos antes de tomar decisiones de rentabilidad." },
  { id: "risk.top1", area: "risk", title: "Concentración Top 1", meaning: "Porcentaje del volumen concentrado en el grupo principal de una dimensión.", formula: "Leads del grupo mayor ÷ leads atribuidos de la dimensión × 100.", unit: "Porcentaje", sources: ["Atribución de fuente, campaña, caller, closer o perfil"], syntheticExample: { scenario: "60 de 100 leads pertenecen al principal grupo.", result: "Top 1 = 60%." }, limitations: ["No considera por sí solo el comportamiento del resto de grupos."], humanRecommendation: "Revisa resiliencia y capacidad antes de reducir una concentración útil." },
  { id: "risk.top3", area: "risk", title: "Concentración Top 3", meaning: "Porcentaje acumulado en los tres grupos con más leads.", formula: "Suma de leads de los tres grupos mayores ÷ total atribuido × 100.", unit: "Porcentaje", sources: ["Atribución de fuente, campaña, caller, closer o perfil"], syntheticExample: { scenario: "Los tres grupos principales reúnen 80 de 100 leads.", result: "Top 3 = 80%." }, limitations: ["Puede ocultar diferencias importantes dentro de esos grupos."], humanRecommendation: "Combínalo con HHI y exposición económica antes de diversificar." },
  { id: "risk.hhi", area: "risk", title: "Índice HHI", meaning: "Concentración de toda la distribución, no solo de los grupos principales.", formula: "Suma del cuadrado de la cuota de cada grupo.", unit: "Índice de 0 a 1", sources: ["Atribución de fuente, campaña, caller, closer o perfil"], syntheticExample: { scenario: "Dos grupos tienen una cuota del 50% cada uno.", result: "HHI = 0,5² + 0,5² = 0,5." }, limitations: ["Un HHI alto describe dependencia; no implica que sea perjudicial."], humanRecommendation: "Evalúa alternativas y coste de diversificación antes de redistribuir." },
  { id: "risk.absolute_exposure", area: "economic", title: "Exposición económica absoluta", meaning: "Suma del valor absoluto de los márgenes asociados a una dimensión.", formula: "Σ |margen realizado del grupo| en una única moneda.", unit: "Importe monetario", sources: ["Ledger financiero", "Atribución comercial"], syntheticExample: { scenario: "Dos grupos muestran +3.000 € y −1.000 €.", result: "Exposición absoluta = 4.000 €." }, limitations: ["No compensa ganancias y pérdidas y requiere cobertura económica."], humanRecommendation: "Comprueba la cobertura del ledger antes de priorizar el riesgo monetario." },
  { id: "risk.negative_margin", area: "economic", title: "Margen negativo absoluto", meaning: "Exposición acumulada de los grupos con margen realizado negativo.", formula: "Σ |margen negativo|; los márgenes positivos no lo compensan.", unit: "Importe monetario", sources: ["Ledger financiero", "Atribución comercial"], syntheticExample: { scenario: "Dos grupos pierden 400 € y 600 €.", result: "Margen negativo absoluto = 1.000 €." }, limitations: ["No incluye pérdidas todavía no registradas ni convierte monedas."], humanRecommendation: "Investiga devoluciones, costes y conciliación antes de intervenir." },
  { id: "quality.unique_observations", area: "quality", title: "Leads únicos observados", meaning: "Número de leads únicos usados por la instantánea del servidor.", formula: "Conteo por identificador interno tras deduplicar; los identificadores nunca se muestran.", unit: "Leads", sources: ["Asignación del lead"], syntheticExample: { scenario: "Se reciben 102 filas correspondientes a 100 leads.", result: "Observaciones únicas = 100." }, limitations: ["Un lead presente no garantiza que todos sus campos estén completos."], humanRecommendation: "Contrasta esta cobertura con atribución y ledger antes de interpretar resultados." },
  { id: "quality.duplicates_excluded", area: "quality", title: "Observaciones duplicadas excluidas", meaning: "Filas repetidas retiradas antes de calcular métricas.", formula: "Filas observadas − leads únicos conservados.", unit: "Filas", sources: ["Asignación del lead"], syntheticExample: { scenario: "Hay 102 filas y 100 leads únicos.", result: "Duplicados excluidos = 2." }, limitations: ["Indica repetición técnica, no duplicados comerciales entre personas."], humanRecommendation: "Si aumenta, revisa el origen de la consulta o importación." },
  { id: "quality.without_attribution", area: "quality", title: "Leads sin atribución", meaning: "Leads sin valor identificable en una o más dimensiones de dependencia.", formula: "Conteo de leads con fuente, campaña, caller, closer o perfil ausente.", unit: "Leads", sources: ["Atribución comercial del lead"], syntheticExample: { scenario: "7 de 100 leads carecen de alguna atribución.", result: "Sin atribución = 7." }, limitations: ["No distingue si la ausencia es esperada o un error de captura."], humanRecommendation: "Corrige primero la captura si la ausencia impide comparar segmentos." },
  { id: "quality.sales_without_ledger", area: "economic", title: "Ventas sin registro económico", meaning: "Ventas confirmadas sin eventos económicos comparables en la moneda seleccionada.", formula: "Ventas confirmadas − ventas con al menos un evento de ledger válido antes del cierre.", unit: "Ventas", sources: ["Venta confirmada", "Ledger financiero"], syntheticExample: { scenario: "Hay 12 ventas y 10 tienen evento económico.", result: "Ventas sin registro económico = 2." }, limitations: ["No se evalúa cuando no existe una moneda única."], humanRecommendation: "Completa o concilia el ledger antes de interpretar margen y exposición." },
];

export function buildObservatoryMetricExplanations(input: ExplanationInput): Record<ObservatoryMetricId, ObservatoryMetricExplanation> {
  const period: ObservatoryMetricExplanation["period"] = { from: input.from, to: input.to, asOf: input.asOf, timeZone: OBSERVATORY_METRIC_TIME_ZONE, boundary: "[desde, hasta)" };
  const globalQuality = input.observations === 0
    ? { state: "unavailable" as const, explanation: "No hay observaciones en el periodo." }
    : input.withoutAttribution > 0 || input.duplicateObservationsExcluded > 0
      ? { state: "limited" as const, explanation: `${input.withoutAttribution} sin atribución y ${input.duplicateObservationsExcluded} observaciones repetidas excluidas.` }
      : { state: "available" as const, explanation: "No se detectaron carencias de atribución ni repeticiones en la instantánea." };
  const availability = (area: MetricSpec["area"]) => area === "seasonality" ? input.seasonalityAvailable
    : area === "anomalies" ? input.anomaliesAvailable
      : area === "commercial" ? input.commercialBridgeAvailable
        : area === "economic" ? input.economicBridgeAvailable
          : area === "risk" ? input.riskAvailable
            : input.observations > 0;
  const result = {} as Record<ObservatoryMetricId, ObservatoryMetricExplanation>;
  for (const spec of SPECS) {
    const economicUnavailable = spec.area === "economic" && (!input.currency || input.salesWithoutLedger === null);
    const dataQuality = economicUnavailable
      ? { state: "unavailable" as const, explanation: "No hay una moneda única y cobertura de ledger evaluable." }
      : spec.id === "quality.without_attribution" && input.withoutAttribution > 0
        ? { state: "limited" as const, explanation: `${input.withoutAttribution} leads carecen de alguna atribución.` }
        : globalQuality;
    const confidence = spec.area === "seasonality" || spec.area === "anomalies"
      ? availability(spec.area)
        ? { state: "moderate" as const, explanation: "La muestra supera los mínimos visibles; sigue siendo evidencia observacional." }
        : { state: "insufficient" as const, explanation: "La muestra no supera los mínimos temporales o estadísticos de esta métrica." }
      : availability(spec.area)
        ? { state: "descriptive" as const, explanation: "Es una descomposición o concentración descriptiva, no una inferencia causal." }
        : { state: "insufficient" as const, explanation: "No hay evidencia suficiente o comparable para calcular esta métrica." };
    result[spec.id] = { ...spec, version: OBSERVATORY_METRIC_EXPLANATION_VERSION, period, evidence: { dataQuality, statisticalConfidence: confidence } };
    delete (result[spec.id] as Partial<MetricSpec>).area;
  }
  return result;
}
