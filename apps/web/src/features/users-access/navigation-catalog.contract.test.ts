import { describe, expect, it } from "vitest";

import { NAVIGATION_MODULE_IDS } from "@crm-fran/api/navigation-visibility";
import { PRIMARY_NAVIGATION_ITEMS } from "@crm-fran/ui/lib/navigation-policy";

describe("navigation catalog contract", () => {
  it("keeps the server allowlist identical to the sidebar catalog", () => {
    expect(PRIMARY_NAVIGATION_ITEMS.map((module) => module.id)).toEqual(NAVIGATION_MODULE_IDS);
  });
});
