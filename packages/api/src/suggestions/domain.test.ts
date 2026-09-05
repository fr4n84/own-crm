import { describe, expect, it } from "vitest";

import { suggestionAuthorId, suggestionInput } from "./domain";

describe("suggestion privacy", () => {
  it("removes authorship for anonymous suggestions", () => {
    expect(suggestionAuthorId({ anonymous: true, userId: "user-1" })).toBeNull();
    expect(suggestionAuthorId({ anonymous: false, userId: "user-1" })).toBe("user-1");
  });

  it("trims and bounds the body", () => {
    expect(suggestionInput.parse({ body: "  Mejora  ", anonymous: false }).body).toBe("Mejora");
    expect(() => suggestionInput.parse({ body: " ", anonymous: false })).toThrow();
    expect(() => suggestionInput.parse({ body: "x".repeat(4001), anonymous: false })).toThrow();
  });
});
