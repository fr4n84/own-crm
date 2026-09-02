import { describe, expect, it } from "vitest";

import { createCommercialExperimentsRepository } from "./runtime";

function sqlShape(value: unknown): string {
  const seen = new Set<object>();
  const visit = (item: unknown): string[] => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object" || seen.has(item)) return [];
    seen.add(item);
    return Object.values(item).flatMap(visit);
  };
  return visit(value).join(" ");
}

describe("commercial experiment production repository SQL", () => {
  it("excludes the current experiment from active same-intervention conflict lookup", async () => {
    let predicate: Parameters<{ where(condition: unknown): unknown }["where"]>[0];
    const database = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: (condition: unknown) => { predicate = condition; return []; } }) }) }),
    } as unknown;
    const repository = createCommercialExperimentsRepository(database as never);
    await repository.findConflictingLeadIds({ experimentId: "current-experiment", interventionType: "assignment_routing", leadIds: ["lead-1"] });
    const query = sqlShape(predicate);
    expect(query).toContain("<>");
    expect(query).toContain("current-experiment");
  });

  it("uses transaction advisory locks for each lead and intervention before conflict checks", async () => {
    const statements: unknown[] = [];
    const database = { execute: async (statement: unknown) => { statements.push(statement); } } as unknown;
    const repository = createCommercialExperimentsRepository(database as never);
    await repository.lockLeadInterventions({ interventionType: "assignment_routing", leadIds: ["lead-b", "lead-a"] });
    expect(statements).toHaveLength(2);
    const first = sqlShape(statements[0]);
    expect(first).toContain("pg_advisory_xact_lock");
    expect(first).toContain("assignment_routing:lead-a");
  });

  it("locks the experiment row before authoritative enrollment status is read", async () => {
    const locks: string[] = [];
    const database = {
      select: () => ({ from: () => ({ where: () => ({ for: (mode: string) => { locks.push(mode); return []; } }) }) }),
    } as unknown;
    const repository = createCommercialExperimentsRepository(database as never);
    await repository.lockExperiment("experiment");
    expect(locks).toEqual(["update"]);
  });

  it("makes lifecycle, final decision, and treatment application updates conditional in SQL", async () => {
    const predicates: unknown[] = [];
    const database = {
      update: () => ({ set: () => ({ where: (condition: unknown) => { predicates.push(condition); return { returning: async () => [] }; } }) }),
      select: () => ({ from: () => ({ where: () => ({}) }) }),
    } as unknown;
    const repository = createCommercialExperimentsRepository(database as never);
    await repository.updateExperiment("exp", { status: "active" }, { expectedStatus: "draft" });
    await repository.updateExperiment("exp", { finalDecision: "approved" }, { expectedStatus: "completed", requireNoFinalDecision: true });
    await repository.markTreatmentApplied({ assignmentId: "assignment", actorId: "admin", at: new Date("2026-08-01T00:00:00Z") });
    const queries = predicates.map(sqlShape).join("\n");
    expect(queries).toContain("final_decision");
    expect(queries).toContain("status");
    expect(queries).toContain("treatment_applied_at");
  });
});
