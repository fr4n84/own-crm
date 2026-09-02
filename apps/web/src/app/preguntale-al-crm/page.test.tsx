import { describe, expect, it, vi } from "vitest";

import LegacyAskCrmPage from "./page";

const redirect = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
}));

vi.mock("next/navigation", () => ({ redirect }));

describe("legacy Pregúntale al CRM route", () => {
  it("redirects safely to the internal decision-centre tab", () => {
    expect(() => LegacyAskCrmPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(
      "/centro-de-decisiones/preguntale-al-crm",
    );
  });
});
