import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), append: vi.fn() }));
vi.mock("@crm-fran/db", () => ({ db: { transaction: mocks.transaction }, eq: vi.fn(() => "where"), sql: vi.fn((parts: TemplateStringsArray) => parts.join("?")) }));
vi.mock("./lead-activity", () => ({ appendLeadActivity: mocks.append }));

import {
  attributionChanges,
  normalizeAcquisitionAttribution,
  updateAcquisitionAttribution,
} from "./acquisition-attribution";

const empty = {
  source: null,
  campaign: null,
  ad: null,
  creative: null,
  acquisitionAngle: null,
};

describe("acquisition attribution contract", () => {
  beforeEach(() => vi.clearAllMocks());
  it("normalizes bounded fields and blank values", () => {
    expect(normalizeAcquisitionAttribution({ ...empty, source: " Meta ", ad: " " })).toEqual({
      ...empty,
      source: "Meta",
    });
  });

  it("does not create a change for an exact no-op", () => {
    expect(attributionChanges(empty, empty)).toBeNull();
  });

  it("captures the minimal before and after attribution snapshots", () => {
    expect(attributionChanges(empty, { ...empty, ad: "Vídeo 1" })).toEqual({
      before: empty,
      after: { ...empty, ad: "Vídeo 1" },
    });
  });

  it("updates and appends the before/after event in one transaction", async () => {
    const order: string[] = [];
    const returning = vi.fn().mockResolvedValue([{ id: "lead-1", name: "Lead", email: "lead@example.com", ...empty, ad: "Vídeo 1", phone: "600", questions: [], type: "maestra", state: "sin asignar" }]);
    const whereUpdate = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where: whereUpdate }));
    const update = vi.fn(() => ({ set }));
    const whereSelect = vi.fn().mockImplementation(async () => { order.push("select"); return [{ id: "lead-1", name: "Lead", email: "lead@example.com", ...empty }]; });
    const from = vi.fn(() => ({ where: whereSelect }));
    const select = vi.fn(() => ({ from }));
    const execute = vi.fn().mockImplementation(async () => { order.push("lock"); });
    const tx = { execute, select, update };
    mocks.transaction.mockImplementation((work: (value: typeof tx) => unknown) => work(tx));

    await expect(updateAcquisitionAttribution({ leadId: "lead-1", actorId: "admin", attribution: { ...empty, ad: " Vídeo 1 " } })).resolves.toMatchObject({ changed: true });
    expect(set).toHaveBeenCalledWith({ ...empty, ad: "Vídeo 1" });
    expect(order.slice(0, 2)).toEqual(["lock", "select"]);
    expect(await updateAcquisitionAttribution({ leadId: "lead-1", actorId: "admin", attribution: { ...empty, ad: "Vídeo 1" } })).toEqual({ lead: { id: "lead-1", name: "Lead", email: "lead@example.com", source: null, campaign: null, ad: "Vídeo 1", creative: null, acquisitionAngle: null }, changed: true });
    expect(mocks.append).toHaveBeenCalledWith(tx, expect.objectContaining({
      kind: "lead_attribution_updated",
      metadata: { before: empty, after: { ...empty, ad: "Vídeo 1" } },
    }));
  });

  it("does not update or append an event for an exact no-op", async () => {
    const update = vi.fn();
    const tx = { execute: vi.fn(), select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "lead-1", name: "Lead", email: "lead@example.com", ...empty }]) })) })), update };
    mocks.transaction.mockImplementation((work: (value: typeof tx) => unknown) => work(tx));

    await expect(updateAcquisitionAttribution({ leadId: "lead-1", actorId: "admin", attribution: empty })).resolves.toEqual({ lead: { id: "lead-1", name: "Lead", email: "lead@example.com", ...empty }, changed: false });
    expect(update).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
  });
});
