import { describe, expect, it } from "vitest";

import { buildCoachingCohortComparison, coachingAnalysisDraftSchema, selectCoachingRubric } from "./domain";

describe("commercial coaching domain", () => {
  it("keeps uncertainty explicit and rejects transcript-shaped evidence", () => {
    const draft = coachingAnalysisDraftSchema.parse({ rubricVersion: "caller-v1", criteria: [{ key: "discovery", rating: "unknown", evidenceSignals: ["evidence_insufficient"], recommendation: "Confirma la necesidad antes de proponer." }], summary: "Análisis pendiente de revisión humana.", requiresPersonalReview: true, reviewReasons: ["uncertain_evidence"] });
    expect(draft.criteria[0]?.rating).toBe("unknown");
    expect(JSON.stringify(draft)).not.toMatch(/transcript|quote|audio/i);
    expect(() => coachingAnalysisDraftSchema.parse({ ...draft, transcript: "raw" })).toThrow();
  });

  it("selects the most specific active version without inventing a match", () => {
    const rubrics = [{ id: "global", version: "caller-v1", role: "caller" as const, product: null, campaign: null, active: true }, { id: "campaign", version: "caller-c1-v2", role: "caller" as const, product: null, campaign: "C1", active: true }];
    expect(selectCoachingRubric({ rubrics, role: "caller", product: null, campaign: "C1" })?.id).toBe("campaign");
    expect(selectCoachingRubric({ rubrics, role: "closer", product: null, campaign: "C1" })).toBeNull();
  });

  it("publishes only anonymous agent-balanced cohorts of at least five analyses and three agents", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ agentId: `agent-${index % 3}`, role: "caller" as const, difficulty: "campaign:C1", criteria: [{ key: "discovery", rating: index < 3 ? "strength" as const : "improve" as const }] }));
    expect(buildCoachingCohortComparison(rows)).toEqual([{ role: "caller", difficulty: "campaign:C1", sample: 6, agentSample: 3, criteria: [{ key: "discovery", strengthRate: 50, comparableSample: 6 }], notice: "Comparación agregada y anónima; no clasifica personas ni llamadas." }]);
    expect(buildCoachingCohortComparison(rows.slice(0, 4))).toEqual([]);
    expect(buildCoachingCohortComparison(rows.map((row) => ({ ...row, agentId: "single-agent" })))).toEqual([]);
  });
});
