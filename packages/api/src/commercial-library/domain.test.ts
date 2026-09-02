import { describe, expect, it } from "vitest";
import { commercialLibraryAdvisoryLockKey, experimentEvidenceLabel, latestLibraryVersions, latestVisibleLibraryVersions, normalizeCommercialLibraryEvidenceLabel, planLibraryTransition, planManualLibraryVersionAppend } from "./domain";

describe("commercial library domain", () => {
  it("enforces draft, publish and archive transitions", () => {
    expect(planLibraryTransition([], "create_draft", "script")).toEqual({ version: 1, status: "draft", type: "script" });
    expect(planLibraryTransition([{ version: 1, status: "draft", type: "script" }], "publish")).toEqual({ version: 2, status: "published", type: "script" });
    expect(planLibraryTransition([{ version: 2, status: "published", type: "script" }], "archive")).toEqual({ version: 3, status: "archived", type: "script" });
    expect(() => planLibraryTransition([], "publish", "script")).toThrow("start as a draft");
    expect(() => planLibraryTransition([{ version: 3, status: "archived", type: "script" }], "publish")).toThrow("Invalid library transition");
    expect(() => planLibraryTransition([{ version: 1, status: "draft", type: "script" }], "create_draft", "playbook")).toThrow("type is immutable");
  });

  it("selects latest lineage before applying caller visibility", () => {
    const current = latestLibraryVersions([
      { lineageKey: "active", version: 1, status: "draft" as const },
      { lineageKey: "active", version: 2, status: "published" as const },
      { lineageKey: "revoked", version: 2, status: "published" as const },
      { lineageKey: "revoked", version: 3, status: "archived" as const },
    ]);
    expect(current).toEqual(expect.arrayContaining([
      expect.objectContaining({ lineageKey: "active", version: 2 }),
      expect.objectContaining({ lineageKey: "revoked", version: 3 }),
    ]));
    expect(latestVisibleLibraryVersions(current).map((row) => row.lineageKey)).toEqual(["active"]);
  });

  it("labels approved experiments as supported without claiming causality and downgrades legacy causal rows", () => {
    expect(experimentEvidenceLabel({ status: "completed", finalDecision: "approved", approvedById: "admin" })).toBe("experiment_supported");
    expect(experimentEvidenceLabel({ status: "active", finalDecision: null, approvedById: "admin" })).toBe("observational");
    expect(normalizeCommercialLibraryEvidenceLabel("causal")).toBe("experiment_supported");
    expect(normalizeCommercialLibraryEvidenceLabel("experiment_supported")).toBe("experiment_supported");
    expect(normalizeCommercialLibraryEvidenceLabel(undefined)).toBe("observational");
  });

  it("uses one advisory-lock namespace and appends a coherent manual parent chain", () => {
    expect(commercialLibraryAdvisoryLockKey("lineage-1")).toBe("commercial-library:lineage-1");
    const draft = planManualLibraryVersionAppend([], "create_draft", "playbook");
    expect(draft).toEqual({ version: 1, status: "draft", type: "playbook", parentVersionId: null, changeKind: "manual", changeReason: null, restoredFromVersionId: null });
    const published = planManualLibraryVersionAppend([{ id: "v1", version: 1, status: "draft", type: "playbook" }], "publish");
    expect(published).toMatchObject({ version: 2, status: "published", parentVersionId: "v1", changeKind: "manual", restoredFromVersionId: null });
    const archived = planManualLibraryVersionAppend([{ id: "v1", version: 1, status: "draft", type: "playbook" }, { id: "v2", version: 2, status: "published", type: "playbook" }], "archive");
    expect(archived).toMatchObject({ version: 3, status: "archived", parentVersionId: "v2", changeKind: "manual", restoredFromVersionId: null });
  });
});
