import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  COMMERCIAL_EXPERIMENT_ARM,
  COMMERCIAL_EXPERIMENT_FINAL_DECISION,
  COMMERCIAL_EXPERIMENT_INTERVENTION_TYPE,
  COMMERCIAL_EXPERIMENT_PRIMARY_METRIC,
  COMMERCIAL_EXPERIMENT_STATUS,
  commercialExperimentAssignments,
  commercialExperimentAssignmentsRelations,
  commercialExperiments,
  commercialExperimentsRelations,
} from "./commercial-experiments";

describe("commercial experiments schema", () => {
  it("defines the controlled experiment vocabulary", () => {
    expect(Object.values(COMMERCIAL_EXPERIMENT_INTERVENTION_TYPE)).toEqual([
      "assignment_routing",
      "speed_priority",
      "follow_up_cadence",
      "next_best_action",
    ]);
    expect(Object.values(COMMERCIAL_EXPERIMENT_PRIMARY_METRIC)).toEqual(["contacted", "appointment", "show", "sale"]);
    expect(Object.values(COMMERCIAL_EXPERIMENT_STATUS)).toEqual(["draft", "active", "stopped", "completed"]);
    expect(Object.values(COMMERCIAL_EXPERIMENT_ARM)).toEqual(["control", "treatment"]);
    expect(Object.values(COMMERCIAL_EXPERIMENT_FINAL_DECISION)).toEqual(["inconclusive", "rejected", "approved"]);
  });

  it("stores experiment defaults and decision audit metadata", () => {
    expect(commercialExperiments.status).toBeDefined();
    expect(commercialExperiments.allocationPercent).toBeDefined();
    expect(commercialExperiments.minimumSamplePerArm).toBeDefined();
    expect(commercialExperiments.maturationDays).toBeDefined();
    expect(commercialExperiments.finalDecision).toBeDefined();
    expect(commercialExperiments.finalDecisionById).toBeDefined();
    expect(commercialExperiments.finalDecisionAt).toBeDefined();
    expect(commercialExperiments.finalDecisionNotes).toBeDefined();
    expect(commercialExperiments.createdAt).toBeDefined();
    expect(commercialExperiments.updatedAt).toBeDefined();
  });

  it("preserves immutable assignment context and treatment application audit fields", () => {
    expect(commercialExperimentAssignments.frozenContext).toBeDefined();
    expect(commercialExperimentAssignments.treatmentAppliedAt).toBeDefined();
    expect(commercialExperimentAssignments.treatmentAppliedById).toBeDefined();
    expect(commercialExperimentAssignmentsRelations).toBeDefined();
    expect(commercialExperimentsRelations).toBeDefined();
  });

  it("declares database checks and access indexes for safe cohort analysis", () => {
    const experimentConfig = getTableConfig(commercialExperiments);
    const assignmentConfig = getTableConfig(commercialExperimentAssignments);

    expect(experimentConfig.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      "commercial_experiments_allocation_percent_check",
      "commercial_experiments_minimum_sample_per_arm_check",
      "commercial_experiments_maturation_days_check",
      "commercial_experiments_guardrail_tolerance_pp_check",
      "commercial_experiments_intervention_type_check",
      "commercial_experiments_primary_metric_check",
      "commercial_experiments_status_check",
      "commercial_experiments_final_decision_check",
    ]));
    expect(experimentConfig.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining([
      "commercial_experiments_status_intervention_idx",
      "commercial_experiments_created_by_idx",
    ]));
    expect(assignmentConfig.indexes.find((index) => index.config.name === "commercial_experiment_assignments_experiment_lead_unique")?.config.unique).toBe(true);
    expect(assignmentConfig.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining([
      "commercial_experiment_assignments_experiment_arm_enrolled_idx",
      "commercial_experiment_assignments_lead_idx",
    ]));
    expect(assignmentConfig.checks.map((check) => check.name)).toContain("commercial_experiment_assignments_arm_check");
  });
});