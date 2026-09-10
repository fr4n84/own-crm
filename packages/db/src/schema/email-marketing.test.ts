import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { emailMarketingAudienceMembers, emailMarketingAudienceSnapshots, emailMarketingCampaigns, emailMarketingContentVersions, emailMarketingPermissions, emailMarketingSuppressions } from "./index";

describe("email marketing persistence", () => {
  it("separates consent, suppression, draft copy, and immutable snapshot records", () => {
    expect(emailMarketingPermissions.normalizedEmail).toBeDefined();
    expect(emailMarketingPermissions.status).toBeDefined();
    expect(emailMarketingSuppressions.active).toBeDefined();
    expect(emailMarketingCampaigns.status).toBeDefined();
    expect(emailMarketingContentVersions.approvedById).toBeDefined();
    expect(emailMarketingAudienceSnapshots.sourceKind).toBeDefined();
    expect(emailMarketingAudienceMembers.decision).toBeDefined();
    expect(emailMarketingAudienceMembers.reason).toBeDefined();
    expect("query" in emailMarketingAudienceSnapshots).toBe(false);
    expect("sentAt" in emailMarketingCampaigns).toBe(false);
  });

  it("generates migration 0047 with safety constraints and no delivery tables", () => {
    const migration = readFileSync(fileURLToPath(new URL("../migrations/0047_email_marketing_foundation.sql", import.meta.url)), "utf8");
    expect(migration).toContain("email_marketing_permission_status_check");
    expect(migration).toContain("email_marketing_suppression_shape_check");
    expect(migration).toContain("email_marketing_campaign_status_check");
    expect(migration).toContain("email_marketing_audience_member_shape_check");
    expect(migration).toContain("email_marketing_audience_snapshots_immutable");
    expect(migration).toContain("email_marketing_audience_members_immutable");
    expect(migration).not.toContain("outbox");
    expect(migration).not.toContain("tracking_pixel");
    expect(migration).not.toContain("provider_message");
  });
});

