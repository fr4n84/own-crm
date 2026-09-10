import { describe, expect, it } from "vitest";
import { commercialCoachingAnalyses, commercialCoachingRubrics } from "./index";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("commercial coaching persistence", () => {
  it("stores structured review state and immutable non-punitive controls", () => {
    expect(commercialCoachingRubrics.version).toBeDefined();
    expect(commercialCoachingRubrics.product).toBeDefined();
    expect(commercialCoachingRubrics.campaign).toBeDefined();
    expect(commercialCoachingAnalyses.criteria).toBeDefined();
    expect("transcript" in commercialCoachingAnalyses).toBe(false);
    expect("audio" in commercialCoachingAnalyses).toBe(false);
    expect(commercialCoachingAnalyses.excludedFromCompensation).toBeDefined();
    expect(commercialCoachingAnalyses.excludedFromAutomaticAssignment).toBeDefined();
    expect(commercialCoachingAnalyses.disciplinaryUseProhibited).toBeDefined();
  });

  it("seeds versioned caller and closer rubrics without applying the migration", () => {
    const migration = readFileSync(fileURLToPath(new URL("../migrations/0045_commercial_coaching.sql", import.meta.url)), "utf8");
    expect(migration).toContain("'caller-v1'");
    expect(migration).toContain("'closer-v1'");
    expect(migration).toContain("commercial_coaching_non_punitive_check");
  });
});
