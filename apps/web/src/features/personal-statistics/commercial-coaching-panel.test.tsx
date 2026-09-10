import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoachingReviewList } from "./commercial-coaching-panel";

describe("CoachingReviewList", () => {
  it("shows a private review draft, uncertainty and non-punitive controls before confirmation", () => {
    const onReview = vi.fn();
    render(<CoachingReviewList onReview={onReview} analyses={[{
      id: "a1", status: "draft", role: "caller", summary: "Revisa cómo se validó la necesidad.", requiresPersonalReview: true,
      reviewReasons: ["uncertain_evidence"], createdAt: new Date("2026-09-08T10:00:00Z"), lead: { id: "l1", name: "Lead" },
      criteria: [{ key: "discovery", rating: "unknown", evidenceSignals: ["evidence_insufficient"], recommendation: "Formula una pregunta abierta." }],
      excludedFromCompensation: true, excludedFromAutomaticAssignment: true, disciplinaryUseProhibited: true,
    }]} />);
    expect(screen.getByText("Requiere revisión personal")).toBeInTheDocument();
    expect(screen.getByText("Evidencia insuficiente")).toBeInTheDocument();
    expect(screen.getByText(/no se usa para sanciones, salarios/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar análisis" }));
    expect(onReview).toHaveBeenCalledWith("a1", "confirmed");
  });
});
