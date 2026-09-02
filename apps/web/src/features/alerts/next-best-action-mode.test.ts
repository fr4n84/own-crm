import { describe, expect, it } from "vitest";

import { availableWorkModes, normalizeWorkMode } from "./next-best-action-mode";

describe("next best action work mode", () => {
  it("offers both modes to wildcard admins and the combined role", () => {
    expect(availableWorkModes("role-admin", ["*"])).toEqual(["caller", "closer"]);
    expect(availableWorkModes("role-caller", ["alerts:read"])).toEqual(["caller"]);
    expect(availableWorkModes("role-closer", ["alerts:read"])).toEqual(["closer"]);
    expect(availableWorkModes("role-caller-closer", ["alerts:read"])).toEqual(["caller", "closer"]);
  });

  it("normalizes persisted values without escalating the role", () => {
    expect(normalizeWorkMode("closer", ["caller"])).toBe("caller");
    expect(normalizeWorkMode("caller", ["closer"])).toBe("closer");
    expect(normalizeWorkMode("closer", ["caller", "closer"])).toBe("closer");
  });
});
