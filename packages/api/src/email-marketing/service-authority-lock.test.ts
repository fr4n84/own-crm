import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const currentAuthority = {
    id: "authority-1",
    normalizedEmail: "person@example.com",
    status: "revoked",
    active: true,
    reason: "complaint",
    source: "admin_record",
    evidence: { note: "Existing evidence" },
    occurredAt: new Date("2026-09-09T09:00:00.000Z"),
    liftedAt: null,
    version: 1,
  };
  const lockedLimit = vi.fn().mockResolvedValue([currentAuthority]);
  const forLock = vi.fn(() => ({ limit: lockedLimit }));
  const unlockedLimit = vi.fn().mockResolvedValue([currentAuthority]);
  const where = vi.fn(() => ({ for: forLock, limit: unlockedLimit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  const tx = { select, update, insert };
  const transaction = vi.fn(async (operation: (value: typeof tx) => unknown) => operation(tx));
  return { transaction, forLock, unlockedLimit, lockedLimit };
});

vi.mock("@crm-fran/db", () => ({
  and: vi.fn(),
  db: { transaction: database.transaction },
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
}));

import { emailMarketingService } from "./service";

const baseInput = {
  email: "person@example.com",
  source: "admin_record",
  evidence: "Verified written evidence",
  occurredAt: new Date("2026-09-09T10:00:00.000Z"),
  actorId: "admin-1",
};

describe("email marketing authority serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("locks current consent authority before incrementing its version", async () => {
    await emailMarketingService.recordConsent(baseInput);

    expect(database.forLock).toHaveBeenCalledWith("update");
    expect(database.unlockedLimit).not.toHaveBeenCalled();
    expect(database.lockedLimit).toHaveBeenCalledWith(1);
  });

  it("locks current suppression authority before incrementing its version", async () => {
    await emailMarketingService.suppress({ ...baseInput, reason: "complaint" });

    expect(database.forLock).toHaveBeenCalledWith("update");
    expect(database.unlockedLimit).not.toHaveBeenCalled();
    expect(database.lockedLimit).toHaveBeenCalledWith(1);
  });
});
