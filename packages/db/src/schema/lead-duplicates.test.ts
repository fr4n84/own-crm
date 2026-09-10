import { describe, expect, it } from "vitest";

import {
  leadAliases,
  leadDuplicateCases,
  leadMergeAudit,
  leads,
} from "./index";

describe("lead duplicate persistence", () => {
  it("stores normalized identity, merge state, review cases, aliases and audit", () => {
    expect(leads.normalizedEmail).toBeDefined();
    expect(leads.normalizedPhone).toBeDefined();
    expect(leads.mergedIntoLeadId).toBeDefined();
    expect(leadDuplicateCases.status).toBeDefined();
    expect(leadDuplicateCases.reasons).toBeDefined();
    expect(leadAliases.canonicalLeadId).toBeDefined();
    expect(leadMergeAudit.snapshot).toBeDefined();
  });
});
