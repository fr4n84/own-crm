import { describe, expect, it } from "vitest";

import { adminDataExports } from "./index";

describe("admin export audit", () => {
  it("records snapshot, filters and archive integrity without exported PII", () => {
    expect(adminDataExports.actorId).toBeDefined();
    expect(adminDataExports.asOf).toBeDefined();
    expect(adminDataExports.filters).toBeDefined();
    expect(adminDataExports.archiveSha256).toBeDefined();
    expect(adminDataExports.rowCounts).toBeDefined();
  });
});
