import { parse } from "csv-parse/sync";

import { normalizeLeadEmail, normalizeLeadPhone } from "../lead-identity";

type LeadCandidate = { id: string; name: string; normalizedEmail: string | null; normalizedPhone: string | null };
type CsvRow = Record<string, string | undefined>;

const requiredHeaders = ["external_reference", "amount", "currency", "occurred_at"] as const;

export function previewProviderPayments(input: { csv: string; leads: readonly LeadCandidate[] }) {
  const records = parse(input.csv, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as CsvRow[];
  if (records.length === 0) throw new Error("El CSV no contiene cobros");
  const first = records[0]!;
  const missing = requiredHeaders.filter((header) => !(header in first));
  if (missing.length > 0) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}`);
  const referenceCounts = new Map<string, number>();
  for (const record of records) {
    const reference = record.external_reference?.trim() ?? "";
    referenceCounts.set(reference, (referenceCounts.get(reference) ?? 0) + 1);
  }
  return records.map((record, index) => {
    const externalReference = record.external_reference?.trim() ?? "";
    if (!externalReference || externalReference.length > 300) throw new Error(`Referencia externa inválida en fila ${index + 2}`);
    const rawAmount = record.amount?.trim() ?? "";
    if (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount)) throw new Error(`Importe inválido en fila ${index + 2}`);
    const amountCents = Math.round(Number(rawAmount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647) throw new Error(`Importe inválido en fila ${index + 2}`);
    const currency = record.currency?.trim().toUpperCase() ?? "";
    if (!/^[A-Z]{3}$/.test(currency) || !Intl.supportedValuesOf("currency").includes(currency)) throw new Error(`Moneda inválida en fila ${index + 2}`);
    const occurredAt = record.occurred_at?.trim() ?? "";
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) || Number.isNaN(new Date(occurredAt).getTime())) throw new Error(`Fecha inválida en fila ${index + 2}`);
    const leadId = record.lead_id?.trim() || null;
    const email = normalizeLeadEmail(record.lead_email).normalized;
    const phone = record.lead_phone?.trim() ? normalizeLeadPhone(record.lead_phone).normalized : null;
    const candidates = input.leads.filter((lead) =>
      (leadId && lead.id === leadId)
      || (email && lead.normalizedEmail === email)
      || (phone && lead.normalizedPhone === phone));
    const repeated = (referenceCounts.get(externalReference) ?? 0) > 1;
    const matchStatus = repeated ? "duplicate" as const : candidates.length === 1 ? "matched" as const : candidates.length > 1 ? "ambiguous" as const : "unmatched" as const;
    return {
      rowNumber: index + 2,
      externalReference,
      amountCents,
      currency,
      occurredAt,
      leadReference: { leadId, email, phone },
      matchStatus,
      matchedLeadId: matchStatus === "matched" ? candidates[0]!.id : null,
      candidates: candidates.map(({ id, name }) => ({ id, name })),
    };
  });
}
