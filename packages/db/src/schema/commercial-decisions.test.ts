import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  commercialDecisionEvents,
  commercialDecisionWeeks,
  commercialDecisions,
} from "./commercial-decisions";

describe("commercial decisions schema", () => {
  it("stores a frozen decision snapshot independently from leads", () => {
    expect(commercialDecisions.weekStart).toBeDefined();
    expect(commercialDecisions.sourceFingerprint).toBeDefined();
    expect(commercialDecisions.evidence).toBeDefined();
    expect(commercialDecisions.estimatedImpactCents).toBeDefined();
    expect(commercialDecisions.confidencePercent).toBeDefined();
    expect(commercialDecisions.assignedToId).toBeDefined();
    expect(commercialDecisions.rank).toBeDefined();
    expect("leadId" in commercialDecisions).toBe(false);
  });

  it("enforces one source snapshot per week and keeps lifecycle events separately", () => {
    const config = getTableConfig(commercialDecisions);

    expect(config.indexes.map((index) => index.config.name)).toContain(
      "commercial_decisions_week_source_unique",
    );
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "commercial_decisions_week_rank_unique",
    );
    expect(commercialDecisionEvents.decisionId).toBeDefined();
    expect(commercialDecisionEvents.actorId).toBeDefined();
    expect(commercialDecisionEvents.toStatus).toBeDefined();
    expect(commercialDecisionWeeks.weekStart).toBeDefined();
    expect(commercialDecisionWeeks.materializedAt).toBeDefined();
  });

  it("makes lifecycle events immutable in the generated migration", () => {
    const migration = readFileSync(
      new URL("../migrations/0025_nice_whistler.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("commercial_decision_events_immutable");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
  });
});
