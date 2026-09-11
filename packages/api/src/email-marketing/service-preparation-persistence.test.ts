import { beforeEach, describe, expect, it, vi } from "vitest";

const copyRuntime = vi.hoisted(() => ({
  generate: vi.fn(),
}));

const database = vi.hoisted(() => {
  type QueryRows = readonly unknown[];
  const state = {
    selectRows: [] as QueryRows[],
    insertReturningRows: [] as QueryRows[],
    updateReturningRows: [] as QueryRows[],
  };
  const select = vi.fn(() => query(state.selectRows.shift() ?? []));
  const insertCalls: Array<{ table: unknown; values?: unknown; onConflict?: unknown }> = [];
  const updateCalls: Array<{ table: unknown; values?: unknown }> = [];
  const transactionOptions: unknown[] = [];

  function query(rows: QueryRows) {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "for", "orderBy", "limit", "innerJoin", "leftJoin"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (
      resolve: (value: QueryRows) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject);
    return chain;
  }

  const insert = vi.fn((table: unknown) => {
    const call: { table: unknown; values?: unknown; onConflict?: unknown } = { table };
    insertCalls.push(call);
    const chain: Record<string, unknown> = {};
    chain.values = vi.fn((values: unknown) => {
      call.values = values;
      return chain;
    });
    chain.onConflictDoNothing = vi.fn((options: unknown) => {
      call.onConflict = options;
      return chain;
    });
    chain.returning = vi.fn(async () => state.insertReturningRows.shift() ?? []);
    chain.then = (
      resolve: (value: undefined) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(undefined).then(resolve, reject);
    return chain;
  });

  const update = vi.fn((table: unknown) => {
    const call: { table: unknown; values?: unknown } = { table };
    updateCalls.push(call);
    const chain: Record<string, unknown> = {};
    chain.set = vi.fn((values: unknown) => {
      call.values = values;
      return chain;
    });
    chain.where = vi.fn(() => chain);
    chain.returning = vi.fn(async () => state.updateReturningRows.shift() ?? []);
    chain.then = (
      resolve: (value: undefined) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(undefined).then(resolve, reject);
    return chain;
  });

  const tx = { select, insert, update };
  const transaction = vi.fn(async (
    operation: (value: typeof tx) => unknown,
    options?: unknown,
  ) => {
    transactionOptions.push(options);
    return operation(tx);
  });

  function reset() {
    state.selectRows = [];
    state.insertReturningRows = [];
    state.updateReturningRows = [];
    insertCalls.length = 0;
    updateCalls.length = 0;
    transactionOptions.length = 0;
    vi.clearAllMocks();
  }

  return { state, select, insertCalls, updateCalls, transaction, transactionOptions, reset };
});

vi.mock("@crm-fran/db", () => ({
  and: vi.fn((...values: unknown[]) => values),
  db: { transaction: database.transaction },
  desc: vi.fn((value: unknown) => value),
  eq: vi.fn((...values: unknown[]) => values),
  inArray: vi.fn((...values: unknown[]) => values),
  isNull: vi.fn((value: unknown) => value),
  lt: vi.fn((...values: unknown[]) => values),
}));

vi.mock("./copy-runtime", () => ({
  generateEmailMarketingCopyDraft: copyRuntime.generate,
}));

import { buildCsv } from "./preparation";
import {
  EmailMarketingConflictError,
  emailMarketingService,
} from "./service";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const eligibleContact = {
  leadId: "lead-1",
  name: "Ada",
  email: "ada@example.com",
  phone: "+34600000001",
};
const noExclusions = { missing: 0, revoked: 0, suppressed: 0, duplicate: 0 };

function exportReadRows() {
  return [
    [{ id: "snapshot-1" }],
    [{ leadId: "lead-1" }],
    [eligibleContact],
    [{ email: eligibleContact.email, status: "granted" }],
    [{ email: eligibleContact.email, active: false }],
  ] as const;
}

describe("email marketing preparation persistence", () => {
  beforeEach(() => {
    database.reset();
    copyRuntime.generate.mockResolvedValue({
      subject: "Prepared subject",
      previewText: "Prepared preview",
      bodyText: "Prepared body",
      status: "draft",
      origin: "ai",
    });
  });

  it("paginates live audience details with a stable next cursor", async () => {
    database.state.selectRows = [
      [{ id: "snapshot-1" }],
      [
        {
          id: "member-3",
          decision: "included",
          frozenReason: "eligible",
          leadId: "lead-3",
          name: "Ada",
          email: "ada@example.com",
          phone: "+34600000003",
          source: "Meta",
          campaign: "Autumn",
          utmContent: "video",
          theme: "Freedom",
          questions: [],
          permissionStatus: "granted",
          suppressionActive: false,
        },
        {
          id: "member-2",
          decision: "included",
          frozenReason: "eligible",
          leadId: "lead-2",
          name: "Grace",
          email: "grace@example.com",
          phone: "+34600000002",
          source: null,
          campaign: null,
          utmContent: null,
          theme: null,
          questions: [],
          permissionStatus: "granted",
          suppressionActive: false,
        },
        {
          id: "member-1",
          decision: "excluded",
          frozenReason: "no_active_consent",
          leadId: "lead-1",
          name: "Linus",
          email: "linus@example.com",
          phone: "+34600000001",
          source: null,
          campaign: null,
          utmContent: null,
          theme: null,
          questions: [],
          permissionStatus: null,
          suppressionActive: false,
        },
      ],
    ];

    const page = await emailMarketingService.listAudienceMembers({
      snapshotId: "snapshot-1",
      limit: 2,
    });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: "member-3",
      decision: "included",
      contact: { name: "Ada", email: "ada@example.com", phone: "+34600000003" },
    });
    expect(page.nextCursor).toBe("member-2");
    expect(database.transactionOptions).toContainEqual({ isolationLevel: "repeatable read" });
  });

  it("audits a new export without persisting its CSV or contact PII", async () => {
    database.state.selectRows = [...exportReadRows()];
    database.state.insertReturningRows = [[{ id: "audit-1" }]];

    const result = await emailMarketingService.exportAudience({
      snapshotId: "snapshot-1",
      purpose: "Prepare a local audience",
      operationId: "operation-1",
      actorId: "admin-1",
    });

    const audit = database.insertCalls.find((call) =>
      typeof call.values === "object"
      && call.values !== null
      && "operationId" in call.values
    );
    expect(audit?.onConflict).toEqual({ target: expect.anything() });
    expect(audit?.values).toMatchObject({
      snapshotId: "snapshot-1",
      actorId: "admin-1",
      purpose: "Prepare a local audience",
      exportedCount: 1,
      exclusions: noExclusions,
      operationId: "operation-1",
    });
    expect(audit?.values).not.toHaveProperty("csv");
    expect(audit?.values).not.toHaveProperty("email");
    expect(audit?.values).not.toHaveProperty("phone");
    expect(result).toMatchObject({ exportedCount: 1, exclusions: noExclusions, idempotent: false });
  });

  it("returns the existing audit when concurrent exports reuse the same operation", async () => {
    const csv = buildCsv([{ name: eligibleContact.name, email: eligibleContact.email, phone: eligibleContact.phone }]);
    const contentHash = await sha256(csv);
    database.state.selectRows = [
      ...exportReadRows(),
      [{
        id: "audit-existing",
        snapshotId: "snapshot-1",
        actorId: "admin-1",
        purpose: "Prepare a local audience",
        contentHash,
        exportedCount: 1,
        exclusions: noExclusions,
        operationId: "operation-1",
      }],
    ];
    database.state.insertReturningRows = [[]];

    const result = await emailMarketingService.exportAudience({
      snapshotId: "snapshot-1",
      purpose: "Prepare a local audience",
      operationId: "operation-1",
      actorId: "admin-1",
    });

    const audit = database.insertCalls.find((call) =>
      typeof call.values === "object"
      && call.values !== null
      && "operationId" in call.values
    );
    expect(audit?.onConflict).toEqual({ target: expect.anything() });
    expect(result).toEqual({
      csv,
      contentHash,
      exportedCount: 1,
      exclusions: noExclusions,
      idempotent: true,
    });
  });

  it("turns cross-snapshot operation reuse into a domain conflict", async () => {
    const csv = buildCsv([{ name: eligibleContact.name, email: eligibleContact.email, phone: eligibleContact.phone }]);
    const contentHash = await sha256(csv);
    database.state.selectRows = [
      ...exportReadRows(),
      [{
        id: "audit-existing",
        snapshotId: "snapshot-other",
        actorId: "admin-1",
        purpose: "Prepare a local audience",
        contentHash,
        exportedCount: 1,
        exclusions: noExclusions,
        operationId: "operation-1",
      }],
    ];
    database.state.insertReturningRows = [[]];

    await expect(emailMarketingService.exportAudience({
      snapshotId: "snapshot-1",
      purpose: "Prepare a local audience",
      operationId: "operation-1",
      actorId: "admin-1",
    })).rejects.toBeInstanceOf(EmailMarketingConflictError);
  });

  it("persists AI output only as a draft with aggregate context", async () => {
    database.state.selectRows = [
      [{ id: "campaign-1", name: "Autumn campaign" }],
      [{ id: "snapshot-1" }],
      [{ leadId: "lead-1" }],
      [{ questions: [] }],
      [{ id: "campaign-1" }],
      [{ version: 2 }],
    ];
    database.state.insertReturningRows = [[{
      id: "copy-3",
      campaignId: "campaign-1",
      version: 3,
      subject: "Prepared subject",
      previewText: "Prepared preview",
      bodyText: "Prepared body",
      origin: "ai",
      status: "draft",
      createdById: "admin-1",
    }]];

    const draft = await emailMarketingService.generateCopyDraft({
      campaignId: "campaign-1",
      actorId: "admin-1",
    });

    expect(copyRuntime.generate).toHaveBeenCalledWith({
      productContext: "Autumn campaign",
      motivationSummary: "[]",
    });
    const storedCopy = database.insertCalls.find((call) =>
      typeof call.values === "object"
      && call.values !== null
      && "origin" in call.values
    );
    expect(storedCopy?.values).toMatchObject({
      campaignId: "campaign-1",
      version: 3,
      origin: "ai",
      status: "draft",
      createdById: "admin-1",
    });
    expect(storedCopy?.values).not.toHaveProperty("approvedById");
    expect(draft).toMatchObject({ id: "copy-3", status: "draft", origin: "ai" });
  });

  it("persists AI approval only when a different human approves", async () => {
    const target = {
      id: "copy-1",
      campaignId: "campaign-1",
      status: "draft",
      origin: "ai",
      createdById: "admin-1",
    };
    database.state.selectRows = [[target]];

    await expect(emailMarketingService.approveCopyVersion({
      campaignId: "campaign-1",
      contentVersionId: "copy-1",
      actorId: "admin-1",
    })).rejects.toBeInstanceOf(EmailMarketingConflictError);
    expect(database.updateCalls).toHaveLength(0);

    database.reset();
    database.state.selectRows = [[target], [{ includedCount: 1 }]];
    database.state.updateReturningRows = [[{
      ...target,
      status: "approved",
      approvedById: "admin-2",
    }]];

    const approved = await emailMarketingService.approveCopyVersion({
      campaignId: "campaign-1",
      contentVersionId: "copy-1",
      actorId: "admin-2",
    });

    expect(database.updateCalls.some((call) =>
      typeof call.values === "object"
      && call.values !== null
      && "approvedById" in call.values
      && call.values.approvedById === "admin-2"
    )).toBe(true);
    expect(approved).toMatchObject({ status: "approved", approvedById: "admin-2" });
  });
});
