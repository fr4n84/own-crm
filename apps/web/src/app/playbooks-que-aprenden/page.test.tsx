import { describe, expect, it, vi } from "vitest";

import LegacyLearningPlaybooksPage from "./page";

const redirect = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
}));

vi.mock("next/navigation", () => ({ redirect }));

describe("legacy learning playbooks route", () => {
  it("redirects to the internal decision-centre tab", () => {
    expect(() => LegacyLearningPlaybooksPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/centro-de-decisiones/playbooks");
  });
});
