import { describe, expect, it } from "vitest";

import {
  findDuplicateSignals,
  normalizeLeadEmail,
  normalizeLeadPhone,
} from "./lead-identity";

describe("lead identity normalization", () => {
  it("normalizes email without replacing the original value", () => {
    expect(normalizeLeadEmail("  María@Example.COM ")).toEqual({
      original: "María@Example.COM",
      normalized: "maría@example.com",
    });
  });

  it("normalizes Spanish national and international phone formats", () => {
    expect(normalizeLeadPhone("612 34 56 78", "ES")).toEqual({
      original: "612 34 56 78",
      normalized: "+34612345678",
    });
    expect(normalizeLeadPhone("0034 612-345-678", "ES").normalized).toBe(
      "+34612345678",
    );
    expect(normalizeLeadPhone("+34 612 345 678", "ES").normalized).toBe(
      "+34612345678",
    );
    expect(normalizeLeadPhone("extension 22", "ES").normalized).toBeNull();
  });

  it("treats exact contact matches as reviewable conflicts and names only as warnings", () => {
    expect(
      findDuplicateSignals(
        { name: "María López", normalizedEmail: "maria@example.com", normalizedPhone: "+34612345678" },
        { name: "Maria Lopes", normalizedEmail: "maria@example.com", normalizedPhone: "+34612345678" },
      ),
    ).toMatchObject({
      reasons: ["exact_email", "exact_phone", "similar_name"],
      level: "review",
    });
    expect(
      findDuplicateSignals(
        { name: "José Pérez", normalizedEmail: null, normalizedPhone: null },
        { name: "Jose Peres", normalizedEmail: null, normalizedPhone: null },
      ),
    ).toMatchObject({ reasons: ["similar_name"], level: "warning" });
  });
});
