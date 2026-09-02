import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { commercialLibraryVersions, COMMERCIAL_LIBRARY_STATUS } from "./commercial-library";

describe("commercial library schema", () => {
  it("stores append-only version lineage and approval evidence", () => {
    expect(commercialLibraryVersions.lineageKey).toBeDefined();
    expect(commercialLibraryVersions.version).toBeDefined();
    expect(commercialLibraryVersions.targeting).toBeDefined();
    expect(commercialLibraryVersions.evidence).toBeDefined();
    expect(COMMERCIAL_LIBRARY_STATUS.PUBLISHED).toBe("published");
  });
  it("generates append-only storage with optimistic lineage uniqueness", () => {
    const migration = readFileSync(new URL("../migrations/0028_commercial_library_versions.sql", import.meta.url), "utf8");
    expect(migration).toContain("commercial_library_lineage_version_uidx");
    expect(migration).toContain("commercial_library_versions_append_only");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
  });
});
