import { parse } from "csv-parse/sync";

import {
  LEAD_POOL_STATUS,
  LEAD_QA_ROLE,
  LEAD_TYPE,
  leads,
  type LeadQASession,
} from "../schema/leads";
import { LEAD_STATE, type LeadState } from "../schema/state";

type LeadInsert = typeof leads.$inferInsert;

type CsvRecord = Record<string, string | undefined>;

type ImportUser = {
  id: string;
  name: string;
};

const REQUIRED_HEADERS = [
  "LEADS",
  "Fecha",
  "Nombre",
  "Correo",
  "Tel",
  "",
  "Caller",
  "Contactado",
  "Respuesta",
  "3 impactos",
  "ULTIMO CONTACTO",
  "FEEDABCK",
  "utm_content",
] as const;

const SPANISH_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function normalized(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function value(record: CsvRecord, header: string) {
  return record[header]?.trim() ?? "";
}

export function parseSpanishLeadDate(source: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)\s*\|\s*([\p{L}]+)\s+(\d{1,2}),\s*(\d{4})$/iu.exec(source.trim());
  if (!match) throw new Error(`Fecha de lead no válida: "${source}"`);

  const [, hourText, minuteText, meridiem, monthText, dayText, yearText] = match;
  const month = SPANISH_MONTHS[normalized(monthText ?? "")];
  if (month === undefined) throw new Error(`Mes de lead no válido: "${monthText}"`);

  const hour12 = Number(hourText);
  const minute = Number(minuteText);
  const day = Number(dayText);
  const year = Number(yearText);
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59 || day < 1 || day > 31) {
    throw new Error(`Fecha de lead no válida: "${source}"`);
  }

  const hour = hour12 % 12 + (meridiem?.toLowerCase() === "pm" ? 12 : 0);
  const date = new Date(year, month, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    throw new Error(`Fecha de lead no válida: "${source}"`);
  }
  return date;
}

function canonicalState(sourceState: string): LeadState {
  const state = normalized(sourceState);
  if (state.includes("numero erroneo")) return LEAD_STATE.NUMERO_ERRONEO;
  if (state === "asignado" || state === "agenda directa") return LEAD_STATE.ASIGNADO;
  return LEAD_STATE.SIN_ASIGNAR;
}

function leadType(sourceState: string) {
  return normalized(sourceState) === "asignado"
    ? LEAD_TYPE.MAESTRA
    : LEAD_TYPE.VSL;
}

function poolStatus(sourceState: string) {
  const state = normalized(sourceState);
  return state === "repetido" || state === "fake"
    ? LEAD_POOL_STATUS.DISCARDED
    : LEAD_POOL_STATUS.NEW;
}

function canonicalCallerOutcome(source: string) {
  const outcome = normalized(source);
  if (outcome === "no interesad@" || outcome === "no interesado" || outcome === "no interesada") return "No interesado";
  if (outcome === "no encaja") return "No encaja";
  if (outcome === "agenda llamada") return "Agenda";
  if (outcome === "llamar futuro") return "Llamar a futuro";
  return null;
}

function noContactImpactCount(impactOutcome: string, feedback: string) {
  const source = normalized(`${impactOutcome} ${feedback}`);
  if (source.includes("tercer impacto") || source.includes("tres impactos")) return 3;
  if (source.includes("segundo impacto") || source.includes("mensaje 2")) return 2;
  if (source.includes("primer impacto") || source.includes("mensaje 1")) return 1;
  return 0;
}

function importQuestions({
  record,
  callerId,
}: {
  record: CsvRecord;
  callerId: string | null;
}): LeadQASession {
  const questions: LeadQASession = [];
  const add = (questionKey: string, question: string, answer: string) => {
    if (!answer) return;
    questions.push({ questionKey, question, answer, authorRole: LEAD_QA_ROLE.CALLER, authorId: callerId });
  };

  const impactOutcome = value(record, "3 impactos");
  add("csvContacted", "Contactado (importado)", value(record, "Contactado"));
  add("csvImpactOutcome", "3 impactos (importado)", impactOutcome);
  add("csvLastContact", "Último contacto (importado)", value(record, "ULTIMO CONTACTO"));
  add("csvSourceState", "Estado de origen (importado)", value(record, ""));

  const callerOutcome = canonicalCallerOutcome(impactOutcome);
  if (callerOutcome) add("callerOutcome", "¿Qué ha sucedido?", callerOutcome);
  return questions;
}

function assertHeaders(records: readonly CsvRecord[]) {
  const first = records[0];
  if (!first) throw new Error("El CSV no contiene registros");
  const missing = REQUIRED_HEADERS.filter((header) => !Object.hasOwn(first, header));
  if (missing.length > 0) {
    const labels = missing.map((header) => header || "<columna sin nombre>").join(", ");
    throw new Error(`Faltan columnas obligatorias en el CSV: ${labels}`);
  }
}

export function buildLeadCsvImport({
  csv,
  users,
  createId,
}: {
  csv: string;
  users: readonly ImportUser[];
  createId: () => string;
}) {
  const records = parse(csv, {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as CsvRecord[];
  assertHeaders(records);

  const userIdsByName = new Map<string, string>();
  for (const user of users) {
    const name = normalized(user.name);
    if (userIdsByName.has(name)) throw new Error(`Hay más de un usuario llamado "${user.name}"`);
    userIdsByName.set(name, user.id);
  }

  const imported: LeadInsert[] = [];
  const seenEmails = new Set<string>();
  let duplicateEmailRows = 0;
  let missingEmailRows = 0;
  let ignoredRows = 0;

  records.forEach((record, index) => {
    if (normalized(value(record, "LEADS")) !== "true") {
      ignoredRows += 1;
      return;
    }

    const callerName = value(record, "Caller");
    const callerId = callerName ? userIdsByName.get(normalized(callerName)) : undefined;
    if (callerName && !callerId) {
      throw new Error(`Caller "${callerName}" no encontrado en la fila ${index + 2}`);
    }

    const rawEmail = value(record, "Correo");
    const email = rawEmail || null;
    if (!email) {
      missingEmailRows += 1;
    } else {
      const normalizedEmail = email.toLowerCase();
      if (seenEmails.has(normalizedEmail)) duplicateEmailRows += 1;
      seenEmails.add(normalizedEmail);
    }

    const sourceState = value(record, "");
    const impactOutcome = value(record, "3 impactos");
    const feedback = value(record, "FEEDABCK") || "sin asignar";
    const createdAt = parseSpanishLeadDate(value(record, "Fecha"));
    const resolvedCallerId = callerId ?? null;

    imported.push({
      id: createId(),
      name: value(record, "Nombre") || "Sin nombre",
      email,
      phone: value(record, "Tel"),
      state: canonicalState(sourceState),
      callerId: resolvedCallerId,
      closerId: null,
      response: value(record, "Respuesta") || "sin asignar",
      feedback,
      createdAt,
      updatedAt: createdAt,
      questions: importQuestions({ record, callerId: resolvedCallerId }),
      type: leadType(sourceState),
      poolStatus: poolStatus(sourceState),
      noContactImpactCount: noContactImpactCount(impactOutcome, feedback),
      source: null,
      campaign: null,
      ad: null,
      creative: null,
      acquisitionAngle: null,
      utmContent: value(record, "utm_content") || null,
    });
  });

  return {
    leads: imported,
    summary: {
      sourceRows: records.length,
      activeRows: imported.length,
      ignoredRows,
      duplicateEmailRows,
      missingEmailRows,
    },
  };
}
