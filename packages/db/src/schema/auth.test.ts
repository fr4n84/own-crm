import { describe, expect, it } from "vitest";

import {
  CALLER_ROLE_IDS,
  CLOSER_ROLE_IDS,
  ROLE_ID,
  isCallerRoleId,
  isCloserRoleId,
} from "./auth";

describe("commercial role capabilities", () => {
  it("treats the combined role as both caller and closer", () => {
    expect(isCallerRoleId(ROLE_ID.COMBINED)).toBe(true);
    expect(isCloserRoleId(ROLE_ID.COMBINED)).toBe(true);
    expect(CALLER_ROLE_IDS).toContain(ROLE_ID.COMBINED);
    expect(CLOSER_ROLE_IDS).toContain(ROLE_ID.COMBINED);
  });

  it("keeps the specialist roles isolated", () => {
    expect(isCallerRoleId(ROLE_ID.CALLER)).toBe(true);
    expect(isCloserRoleId(ROLE_ID.CALLER)).toBe(false);
    expect(isCloserRoleId(ROLE_ID.CLOSER)).toBe(true);
    expect(isCallerRoleId(ROLE_ID.CLOSER)).toBe(false);
  });
});
