import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { commercialPlaybookEditInput, commercialPlaybookGenerateInput, commercialPlaybookRollbackInput } from "./commercial-playbooks";

describe("commercial playbooks router contract", () => {
  it("accepts candidate identity only and rejects client-owned evidence", () => {
    expect(commercialPlaybookGenerateInput.parse({ candidateKey: "playbook:abc" })).toEqual({ candidateKey: "playbook:abc" });
    expect(() => commercialPlaybookGenerateInput.parse({ candidateKey: "playbook:abc", sampleSize: 999, evidenceLabel: "causal" })).toThrow();
  });

  it("requires optimistic versions and mandatory human reasons", () => {
    expect(commercialPlaybookEditInput.safeParse({ lineageKey: "proposal:1", expectedVersion: 1, title: "Title", content: "Content", changeSummary: "Summary" }).success).toBe(true);
    expect(commercialPlaybookRollbackInput.safeParse({ libraryLineageKey: "library:1", expectedCurrentVersion: 2, restoreVersionId: "library-v1", decisionReason: "Regression" }).success).toBe(true);
    expect(commercialPlaybookRollbackInput.safeParse({ libraryLineageKey: "library:1", expectedCurrentVersion: 2, restoreVersionId: "library-v1", decisionReason: "" }).success).toBe(false);
  });

  it("keeps every endpoint wildcard-admin-only and registers the router", () => {
    const routerSource = readFileSync(new URL("./commercial-playbooks.ts", import.meta.url), "utf8");
    const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(routerSource).toContain('const admin = permittedProcedure(["*"])');
    expect(routerSource).not.toContain('permittedProcedure(["leads:write"])');
    expect(indexSource).toContain("commercialPlaybooks: commercialPlaybooksRouter");
  });

  it("does not expose operational lead, alert, assignment, rule or NBA writes", () => {
    const serviceSource = readFileSync(new URL("../commercial-playbooks/service.ts", import.meta.url), "utf8");
    expect(serviceSource).not.toMatch(/\.update\(leads|\.insert\(alerts|\.update\(commercialExperimentAssignments|nextBestAction|assignmentRule/i);
  });

  it("freezes library evidence at the server as-of instead of reading future versions", () => {
    const runtimeSource = readFileSync(new URL("../commercial-playbooks/runtime.ts", import.meta.url), "utf8");
    expect(runtimeSource).toContain("lte(commercialLibraryVersions.createdAt, asOf)");
  });

  it("shares the exact library advisory-lock key with every manual writer", () => {
    const runtimeSource = readFileSync(new URL("../commercial-playbooks/runtime.ts", import.meta.url), "utf8");
    const manualWriterSource = readFileSync(new URL("../commercial-library/service.ts", import.meta.url), "utf8");
    expect(runtimeSource).toContain("commercialLibraryAdvisoryLockKey(lineageKey)");
    expect(manualWriterSource).toContain("commercialLibraryAdvisoryLockKey(input.lineageKey)");
    expect(runtimeSource).not.toContain("`commercial-library:${lineageKey}`");
  });
});
