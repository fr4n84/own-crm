import { describe, expect, it } from "vitest";

import {
  RANKING_METRIC,
  deriveCloserRankingMetrics,
  scoreMetrics,
} from "./ranking-metrics";

describe("ranking metrics", () => {
  it("credits a show for every attended closer result except no-show", () => {
    expect(deriveCloserRankingMetrics(undefined, "Venta")).toEqual([
      RANKING_METRIC.CALLER_SHOW,
      RANKING_METRIC.CLOSER_SALE,
    ]);
    expect(deriveCloserRankingMetrics(undefined, "No-show")).toEqual([]);
  });

  it("credits a follow-up conversion when the next attended result changes", () => {
    expect(deriveCloserRankingMetrics("Seguimiento", "Reagenda")).toContain(
      RANKING_METRIC.CLOSER_FOLLOW_UP_SHOW,
    );
    expect(deriveCloserRankingMetrics("Seguimiento", "Seguimiento")).not.toContain(
      RANKING_METRIC.CLOSER_FOLLOW_UP_SHOW,
    );
  });

  it("calculates league points from configurable weights", () => {
    expect(
      scoreMetrics(
        { caller_lead_taken: 2, caller_appointment: 1 },
        { caller_lead_taken: 1, caller_appointment: 3 },
      ),
    ).toBe(5);
  });
});
