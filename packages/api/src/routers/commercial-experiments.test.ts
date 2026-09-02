import { describe, expect, it } from "vitest";

import { commercialExperimentsRouter, commercialExperimentCreateInput } from "./commercial-experiments";
import type { Context } from "../context";

describe("commercial experiment router contracts", () => {
  it("validates required hypotheses, instructions, and bounded experiment configuration", () => {
    expect(() => commercialExperimentCreateInput.parse({ name: "Test", hypothesis: "", interventionType: "assignment_routing", primaryMetric: "sale", treatmentConfig: {}, treatmentInstructions: {}, allocationPercent: 101, minimumSamplePerArm: 0, maturationDays: -1, guardrailTolerancePp: -1 })).toThrow();
  });

  it("registers the list and controlled mutation endpoints", () => {
    expect(commercialExperimentsRouter._def.procedures).toMatchObject({ list: expect.anything(), detail: expect.anything(), create: expect.anything(), updateDraft: expect.anything(), activate: expect.anything(), enrollNew: expect.anything(), markTreatmentApplied: expect.anything(), stop: expect.anything(), complete: expect.anything(), recordFinalDecision: expect.anything() });
  });

  it("rejects non-admin callers for every read and mutation endpoint before service work", async () => {
    const caller = commercialExperimentsRouter.createCaller({
      session: { user: { id: "non-admin", roleId: "caller", name: "Caller", email: "caller@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } },
      role: { id: "caller", name: "Caller", permissions: ["leads:read"] }, permissions: ["leads:read"],
    } as Context);
    const create = { name: "Experiment", hypothesis: "Hypothesis", interventionType: "assignment_routing" as const, primaryMetric: "sale" as const, treatmentConfig: {}, treatmentInstructions: { instrucciones: "Manual" }, allocationPercent: 50, minimumSamplePerArm: 1, maturationDays: 0, guardrailTolerancePp: 0 };
    const calls = [
      () => caller.list(), () => caller.detail({ experimentId: "exp" }), () => caller.create(create), () => caller.updateDraft({ experimentId: "exp", name: "Updated" }), () => caller.activate({ experimentId: "exp" }), () => caller.enrollNew({ experimentId: "exp" }), () => caller.markTreatmentApplied({ assignmentId: "assignment" }), () => caller.stop({ experimentId: "exp" }), () => caller.complete({ experimentId: "exp" }), () => caller.recordFinalDecision({ experimentId: "exp", decision: "inconclusive", notes: "Notes" }),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
