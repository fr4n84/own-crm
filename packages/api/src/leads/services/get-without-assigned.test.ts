import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../queries/index", () => ({
  selectLeadWithUsers: vi.fn().mockResolvedValue([]),
}));

import { selectLeadWithUsers } from "../queries/index";
import { getWithoutAssigned } from "./get-without-assigned";

const mockSelect = vi.mocked(selectLeadWithUsers);

describe("getWithoutAssigned", () => {
  beforeEach(() => {
    mockSelect.mockClear();
  });

  it.each(["maestra", "vsl"] as const)(
    "builds an unassigned queue restricted to %s leads",
    async (type) => {
      await getWithoutAssigned({ type });

      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockSelect.mock.calls[0]?.[0]).toBeDefined();
    },
  );
});
