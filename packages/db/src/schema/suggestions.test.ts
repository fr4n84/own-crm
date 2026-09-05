import { describe, expect, it } from "vitest";

import { suggestions } from "./suggestions";

describe("suggestions privacy schema", () => {
  it("keeps anonymity explicit and the author nullable", () => {
    expect(suggestions.isAnonymous.notNull).toBe(true);
    expect(suggestions.authorUserId.notNull).toBe(false);
  });
});
