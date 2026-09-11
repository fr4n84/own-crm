import { z } from "zod/v4";

type FrozenMember = Readonly<{ leadId: string | null }>;
type CurrentContact = Readonly<{
  leadId: string;
  name: string;
  email: string | null;
  phone: string;
  permission: "granted" | "revoked" | null;
  suppressed: boolean;
}>;
export type ExportContact = Readonly<{ name: string; email: string; phone: string }>;

export function revalidateFrozenAudience(input: {
  members: readonly FrozenMember[];
  contacts: readonly CurrentContact[];
}) {
  const contactByLead = new Map(input.contacts.map((contact) => [contact.leadId, contact]));
  const eligible: ExportContact[] = [];
  const selectedEmails = new Set<string>();
  const exclusions = { missing: 0, revoked: 0, suppressed: 0, duplicate: 0 };
  for (const member of input.members) {
    const contact = member.leadId ? contactByLead.get(member.leadId) : undefined;
    if (!contact?.email) {
      exclusions.missing += 1;
    } else if (contact.suppressed) {
      exclusions.suppressed += 1;
    } else if (contact.permission === null) {
      exclusions.missing += 1;
    } else if (contact.permission !== "granted") {
      exclusions.revoked += 1;
    } else if (selectedEmails.has(contact.email)) {
      exclusions.duplicate += 1;
    } else {
      selectedEmails.add(contact.email);
      eligible.push({ name: contact.name, email: contact.email, phone: contact.phone });
    }
  }
  return { eligible, exclusions };
}

function csvCell(value: string) {
  const safe = /^[\t\r ]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function buildCsv(rows: readonly ExportContact[]) {
  return [
    "name,email,phone",
    ...rows.map((row) => [row.name, row.email, row.phone].map(csvCell).join(",")),
  ].join("\r\n") + "\r\n";
}

export type SegmentCandidate = Readonly<{
  source: string | null;
  campaign: string | null;
  utmContent: string | null;
  theme: string | null;
  confirmedFeedback: readonly string[];
}>;

export type SegmentCriteria = Readonly<{
  combine: "union" | "intersection" | "exclusion";
  groups: readonly Readonly<{
    sources?: readonly string[];
    campaigns?: readonly string[];
    utmContents?: readonly string[];
    themes?: readonly string[];
    confirmedFeedback?: readonly string[];
  }>[];
}>;

function matchesValue(value: string | null, allowed: readonly string[] | undefined) {
  if (!allowed || allowed.length === 0) return true;
  const normalizedValue = value?.trim().toLocaleLowerCase("es") ?? "";
  return allowed.some((candidate) => candidate.trim().toLocaleLowerCase("es") === normalizedValue);
}

function matchesGroup(candidate: SegmentCandidate, group: SegmentCriteria["groups"][number]) {
  return matchesValue(candidate.source, group.sources)
    && matchesValue(candidate.campaign, group.campaigns)
    && matchesValue(candidate.utmContent, group.utmContents)
    && matchesValue(candidate.theme, group.themes)
    && (!group.confirmedFeedback || group.confirmedFeedback.length === 0
      || candidate.confirmedFeedback.some((value) => matchesValue(value, group.confirmedFeedback)));
}

export function matchesSegmentCriteria(candidate: SegmentCandidate, criteria?: SegmentCriteria | null) {
  if (!criteria || criteria.groups.length === 0) return true;
  const matches = criteria.groups.map((group) => matchesGroup(candidate, group));
  if (criteria.combine === "intersection") return matches.every(Boolean);
  if (criteria.combine === "exclusion") return !matches.some(Boolean);
  return matches.some(Boolean);
}

export function canApprovePreparedCopy(input: {
  origin: "manual" | "ai";
  creatorId: string;
  approverId: string;
}) {
  return input.origin === "manual" || input.creatorId !== input.approverId;
}
const generatedCopy = z.object({
  subject: z.string().trim().min(1).max(250),
  previewText: z.string().trim().max(500).nullable(),
  bodyText: z.string().trim().min(1).max(100_000),
}).strict();

type ResponsesClient = {
  responses: {
    create(input: Record<string, unknown>): Promise<unknown>;
  };
};

export async function generateEmailCopyDraft(
  client: ResponsesClient,
  input: {
    model: string;
    productContext: string;
    motivationSummary: string;
  },
) {
  const response = await client.responses.create({
    model: input.model,
    store: false,
    instructions:
      "Create a marketing email draft for human review. Use only the approved aggregate product and motivation context. " +
      "Do not infer personal or sensitive traits. Never claim approval, export, delivery, or sending.",
    input: JSON.stringify({
      productContext: input.productContext,
      confirmedAggregateMotivations: input.motivationSummary,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "email_marketing_copy_draft",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            subject: { type: "string" },
            previewText: { type: ["string", "null"] },
            bodyText: { type: "string" },
          },
          required: ["subject", "previewText", "bodyText"],
        },
      },
    },
  });
  const raw = response && typeof response === "object" && "output_parsed" in response
    ? response.output_parsed
    : response && typeof response === "object" && "output_text" in response
      ? JSON.parse(String(response.output_text))
      : null;
  return {
    ...generatedCopy.parse(raw),
    status: "draft" as const,
    origin: "ai" as const,
  };
}
