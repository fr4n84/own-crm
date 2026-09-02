import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ delete: vi.fn() }));

vi.mock("@crm-fran/db", () => ({
  db: { delete: mocks.delete },
  eq: vi.fn(() => "lead-id-filter"),
}));

import { deleteLead } from "./delete-lead";

describe("deleteLead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hard-deletes the complete lead aggregate and preserves the public DTO", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    mocks.delete.mockReturnValue({ where });

    await expect(deleteLead("lead-1")).resolves.toEqual({
      success: true,
      id: "lead-1",
    });
    expect(where).toHaveBeenCalledWith("lead-id-filter");
  });
});
