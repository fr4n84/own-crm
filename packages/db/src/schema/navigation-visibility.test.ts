import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { navigationVisibilitySettings } from "./navigation-visibility";

describe("navigation visibility persistence", () => {
  it("uses one versioned server-owned settings row", () => {
    expect(navigationVisibilitySettings.id.name).toBe("id");
    expect(navigationVisibilitySettings.roleIdsByModule.name).toBe("role_ids_by_module");
    expect(navigationVisibilitySettings.version.name).toBe("version");
  });

  it("ships the minimal migration without applying it in tests", () => {
    const sql = readFileSync(new URL("../migrations/0030_absent_wasp.sql", import.meta.url), "utf8");
    expect(sql).toContain('CREATE TABLE "navigation_visibility_settings"');
    expect(sql).toContain('CHECK ("navigation_visibility_settings"."version" >= 1)');
    expect(sql).toContain('ON DELETE set null');
  });
});
