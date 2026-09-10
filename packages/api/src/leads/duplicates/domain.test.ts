import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

import { assertMergeableRelationships, buildDuplicatePage, mergeQuestions, processDuplicateBatchEntries, tryAutomaticDuplicateMerge } from "./domain";

describe("lead duplicate merge domain", () => {
  it("blocks ambiguous one-to-one records and experiment collisions", () => {
    expect(() =>
      assertMergeableRelationships({
        sourceHasSale: true,
        targetHasSale: true,
        sourceHasAttribution: false,
        targetHasAttribution: false,
        sourceExperimentIds: [],
        targetExperimentIds: [],
      }),
    ).toThrow(/venta/i);
    expect(() =>
      assertMergeableRelationships({
        sourceHasSale: false,
        targetHasSale: false,
        sourceHasAttribution: false,
        targetHasAttribution: false,
        sourceExperimentIds: ["experiment-1"],
        targetExperimentIds: ["experiment-1"],
      }),
    ).toThrow(/experiment/i);
  });

  it("combines feedback questions without dropping either lead or duplicating identical entries", () => {
    const shared = { questionKey: "fit", question: "Encaje", answer: "Sí", authorRole: "caller" as const, authorId: "caller-1" };
    expect(
      mergeQuestions([shared], [shared, { ...shared, answer: "No", authorId: "caller-2" }]),
    ).toHaveLength(2);
  });
});

describe("duplicate review paging and batches", () => {
  it("returns a stable createdAt/id cursor and keeps the lookahead row out of the page", () => {
    const rows = [
      { id: "a", createdAt: new Date("2026-09-10T10:00:00.000Z") },
      { id: "b", createdAt: new Date("2026-09-10T10:00:00.000Z") },
      { id: "c", createdAt: new Date("2026-09-10T11:00:00.000Z") },
    ];
    expect(buildDuplicatePage(rows, 2)).toEqual({
      items: rows.slice(0, 2),
      nextCursor: { createdAt: "2026-09-10T10:00:00.000Z", id: "b" },
    });
    expect(buildDuplicatePage(rows.slice(0, 2), 2)).toEqual({ items: rows.slice(0, 2), nextCursor: null });
  });

  it("continues after stale/conflicting cases and exposes every result", async () => {
    const merge = vi.fn()
      .mockResolvedValueOnce({ canonicalLeadId: "lead-a", aliasLeadId: "lead-b", auditId: "audit-a" })
      .mockRejectedValueOnce(new TRPCError({ code: "CONFLICT", message: "El caso ya no está pendiente" }));
    await expect(processDuplicateBatchEntries([
      { caseId: "case-a", canonicalLeadId: "lead-a" },
      { caseId: "case-b", canonicalLeadId: "lead-c" },
    ], "admin", merge)).resolves.toEqual([
      { caseId: "case-a", status: "merged", canonicalLeadId: "lead-a", aliasLeadId: "lead-b", auditId: "audit-a" },
      { caseId: "case-b", status: "failed", code: "CONFLICT", message: "El caso ya no está pendiente" },
    ]);
    expect(merge).toHaveBeenNthCalledWith(1, { caseId: "case-a", canonicalLeadId: "lead-a", actorId: "admin" });
    expect(merge).toHaveBeenNthCalledWith(2, { caseId: "case-b", canonicalLeadId: "lead-c", actorId: "admin" });
  });

  it("leaves an exact triple case manual when current merge guards report a conflict", async () => {
    const merge = vi.fn().mockRejectedValue(new TRPCError({ code: "CONFLICT", message: "Ambos leads tienen una venta" }));
    await expect(tryAutomaticDuplicateMerge(
      { caseId: "case-a", canonicalLeadId: "existing", actorId: "admin" },
      merge,
    )).resolves.toBeNull();
    expect(merge).toHaveBeenCalledOnce();
  });
});