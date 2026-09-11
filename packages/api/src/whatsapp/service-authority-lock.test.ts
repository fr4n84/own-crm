import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const rows = new Map<unknown, Record<string, unknown>>();
  const labels = new Map<unknown, string>();
  const lockOrder: string[] = [];
  const updates: Array<{ table: unknown; values: Record<string, unknown>; predicate: unknown }> = [];

  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: () => {
        const limit = vi.fn(async () => {
          const row = rows.get(table);
          return row ? [row] : [];
        });
        return {
          limit,
          for: (mode: string) => {
            if (mode === "update") lockOrder.push(labels.get(table) ?? "unknown");
            return { limit };
          },
        };
      },
    }),
  }));

  const update = vi.fn((table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: (predicate: unknown) => {
        updates.push({ table, values, predicate });
        const row = rows.get(table);
        if (row) Object.assign(row, values);
        return {
          returning: async () => row ? [row] : [],
          then: (resolve: (value?: unknown) => unknown, reject: (reason?: unknown) => unknown) => (
            Promise.resolve().then(resolve, reject)
          ),
        };
      },
    }),
  }));

  const insert = vi.fn(() => ({ values: vi.fn(async () => undefined) }));
  const tx = { select, update, insert };
  const transaction = vi.fn(async (operation: (value: typeof tx) => unknown) => operation(tx));

  return { rows, labels, lockOrder, updates, transaction };
});

vi.mock("@crm-fran/db", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ operation: "and", conditions })),
  asc: vi.fn(),
  db: { transaction: database.transaction },
  desc: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ operation: "eq", column, value })),
  gte: vi.fn(),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ operation: "inArray", column, values })),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  ne: vi.fn(),
  sql: vi.fn(),
}));

import {
  LEAD_POOL_STATUS,
  LEAD_STATE,
  WHATSAPP_CONSENT_STATUS,
  WHATSAPP_OUTBOX_STATUS,
  leads,
  whatsappConsents,
  whatsappOutboxMessages,
} from "@crm-fran/db/schema/index";

import { approveWhatsappMessage, whatsappService } from "./service";

const lead = {
  id: "lead-1",
  phone: "+34600111222",
  noContactImpactCount: 3,
  poolStatus: LEAD_POOL_STATUS.DISCARDED,
  state: LEAD_STATE.SIN_ASIGNAR,
};
const consent = {
  id: "consent-1",
  leadId: lead.id,
  normalizedPhone: "+34600111222",
  status: WHATSAPP_CONSENT_STATUS.GRANTED,
  occurredAt: new Date("2026-09-11T09:00:00.000Z"),
  version: 1,
};
const message = {
  id: "message-1",
  leadId: lead.id,
  normalizedRecipient: consent.normalizedPhone,
  consentId: consent.id,
  consentVersion: consent.version,
  bodyText: "Hello",
  origin: "manual" as const,
  contextHash: null,
  status: WHATSAPP_OUTBOX_STATUS.PENDING_APPROVAL,
  idempotencyKey: "submission-1",
  submittedById: "author-1",
  submittedAt: new Date("2026-09-11T09:05:00.000Z"),
  approvedById: null,
  approvedAt: null,
  cancelledById: null,
  cancelledAt: null,
  updatedAt: new Date("2026-09-11T09:05:00.000Z"),
};

function predicateContainsValue(predicate: unknown, expected: unknown): boolean {
  if (!predicate || typeof predicate !== "object") return false;
  if ("value" in predicate && predicate.value === expected) return true;
  if ("values" in predicate && Array.isArray(predicate.values) && predicate.values.includes(expected)) return true;
  if ("conditions" in predicate && Array.isArray(predicate.conditions)) {
    return predicate.conditions.some((condition) => predicateContainsValue(condition, expected));
  }
  return false;
}

describe("WhatsApp consent authority serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.rows.clear();
    database.labels.clear();
    database.lockOrder.length = 0;
    database.updates.length = 0;
    database.rows.set(leads, { ...lead });
    database.rows.set(whatsappConsents, { ...consent });
    database.rows.set(whatsappOutboxMessages, { ...message });
    database.labels.set(leads, "lead");
    database.labels.set(whatsappConsents, "consent");
    database.labels.set(whatsappOutboxMessages, "message");
  });

  it("locks consent before the outbox message when approving", async () => {
    await approveWhatsappMessage({ messageId: message.id, actorId: "approver-1" });

    expect(database.lockOrder).toEqual(["consent", "message"]);
  });

  it("cancels an already-approved message when consent is revoked", async () => {
    const storedMessage = database.rows.get(whatsappOutboxMessages);
    Object.assign(storedMessage!, {
      status: WHATSAPP_OUTBOX_STATUS.APPROVED,
      approvedById: "approver-1",
      approvedAt: new Date("2026-09-11T09:10:00.000Z"),
    });

    await whatsappService.revokeConsent({
      leadId: lead.id,
      source: "admin_record",
      evidence: "The person withdrew consent",
      occurredAt: new Date("2026-09-11T10:00:00.000Z"),
      actorId: "admin-1",
    });

    const approvedCancellation = database.updates.find((operation) => (
      operation.table === whatsappOutboxMessages
      && operation.values.status === WHATSAPP_OUTBOX_STATUS.CANCELLED
      && predicateContainsValue(operation.predicate, WHATSAPP_OUTBOX_STATUS.APPROVED)
    ));
    expect(approvedCancellation?.values).toMatchObject({ approvedById: null, approvedAt: null });
  });
});
