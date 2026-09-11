import { describe, expect, it, vi } from "vitest";

import {
  buildCsv,
  canApprovePreparedCopy,
  generateEmailCopyDraft,
  matchesSegmentCriteria,
  revalidateFrozenAudience,
} from "./preparation";

describe("email marketing export preparation", () => {
  it("lets current revocation and suppression override a frozen inclusion", () => {
    const result = revalidateFrozenAudience({
      members: [
        { leadId: "lead-ok" },
        { leadId: "lead-revoked" },
        { leadId: "lead-suppressed" },
        { leadId: "lead-suppressed-no-consent" },
      ],
      contacts: [
        { leadId: "lead-ok", name: "Ada", email: "ada@example.com", phone: "+34600000001", permission: "granted", suppressed: false },
        { leadId: "lead-revoked", name: "Grace", email: "grace@example.com", phone: "+34600000002", permission: "revoked", suppressed: false },
        { leadId: "lead-suppressed", name: "Linus", email: "linus@example.com", phone: "+34600000003", permission: "granted", suppressed: true },
        { leadId: "lead-suppressed-no-consent", name: "Katherine", email: "katherine@example.com", phone: "+34600000004", permission: null, suppressed: true },
      ],
    });

    expect(result.eligible).toEqual([{ name: "Ada", email: "ada@example.com", phone: "+34600000001" }]);
    expect(result.exclusions).toEqual({ missing: 0, revoked: 1, suppressed: 2, duplicate: 0 });
  });

  it("exports only name, email, and phone while neutralizing formulas in every cell", () => {
    const csv = buildCsv([
      { name: "=HYPERLINK(\"bad\")", email: "+cmd@example.com", phone: "@SUM(1+1)" },
    ]);
    expect(csv.split("\r\n")[0]).toBe("name,email,phone");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+cmd@example.com");
    expect(csv).toContain("'@SUM(1+1)");
    expect(csv).not.toContain("lead_id");
    expect(csv).not.toContain("lead-1");
    expect(csv).not.toContain(',=HYPERLINK');
  });

  it("deduplicates contacts that converge on the same current normalized email", () => {
    const result = revalidateFrozenAudience({
      members: [{ leadId: "lead-original" }, { leadId: "lead-merged" }],
      contacts: [
        { leadId: "lead-original", name: "Ada", email: "shared@example.com", phone: "+34600000001", permission: "granted", suppressed: false },
        { leadId: "lead-merged", name: "Grace", email: "shared@example.com", phone: "+34600000002", permission: "granted", suppressed: false },
      ],
    });

    expect(result.eligible).toEqual([
      { name: "Ada", email: "shared@example.com", phone: "+34600000001" },
    ]);
    expect(result.exclusions).toEqual({ missing: 0, revoked: 0, suppressed: 0, duplicate: 1 });
  });
});

describe("email marketing segment criteria", () => {
  const candidate = {
    source: "Meta",
    campaign: "Otoño",
    utmContent: "video-1",
    theme: "Libertad",
    confirmedFeedback: ["time_freedom"],
  };

  it("supports union, intersection, and exclusion across bounded groups", () => {
    const bySource = { sources: ["meta"] };
    const byOutcome = { confirmedFeedback: ["time_freedom"] };
    const noMatch = { campaigns: ["otra"] };

    expect(matchesSegmentCriteria(candidate, { combine: "union", groups: [noMatch, byOutcome] })).toBe(true);
    expect(matchesSegmentCriteria(candidate, { combine: "intersection", groups: [bySource, byOutcome] })).toBe(true);
    expect(matchesSegmentCriteria(candidate, { combine: "intersection", groups: [bySource, noMatch] })).toBe(false);
    expect(matchesSegmentCriteria(candidate, { combine: "exclusion", groups: [byOutcome] })).toBe(false);
    expect(matchesSegmentCriteria(candidate, { combine: "exclusion", groups: [noMatch] })).toBe(true);
  });
});

describe("AI copy preparation", () => {
  it("requires another human to approve AI-origin copy", () => {
    expect(canApprovePreparedCopy({ origin: "ai", creatorId: "admin-1", approverId: "admin-1" })).toBe(false);
    expect(canApprovePreparedCopy({ origin: "ai", creatorId: "admin-1", approverId: "admin-2" })).toBe(true);
    expect(canApprovePreparedCopy({ origin: "manual", creatorId: "admin-1", approverId: "admin-1" })).toBe(true);
  });
  it("uses store:false and can only return a draft for human review", async () => {
    const create = vi.fn(async () => ({
      output_parsed: { subject: "Draft subject", previewText: "Preview", bodyText: "Draft body" },
    }));

    const draft = await generateEmailCopyDraft({ responses: { create } }, {
      model: "safe-model",
      productContext: "Approved product summary",
      motivationSummary: "Aggregated confirmed commercial feedback",
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ store: false }));
    expect(draft).toEqual(expect.objectContaining({ status: "draft", origin: "ai" }));
    expect(draft).not.toHaveProperty("approvedById");
  });
});
