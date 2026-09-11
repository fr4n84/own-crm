import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { emailMarketingAudienceMembers, emailMarketingAudienceSnapshots, emailMarketingCampaigns, emailMarketingContentVersions, emailMarketingExportAudits, emailMarketingPermissions, emailMarketingSuppressions } from "./index";

describe("email marketing persistence", () => {
  it("separates consent, suppression, draft copy, and immutable snapshot records", () => {
    expect(emailMarketingPermissions.normalizedEmail).toBeDefined();
    expect(emailMarketingPermissions.status).toBeDefined();
    expect(emailMarketingSuppressions.active).toBeDefined();
    expect(emailMarketingCampaigns.status).toBeDefined();
    expect(emailMarketingContentVersions.approvedById).toBeDefined();
    expect(emailMarketingContentVersions.origin).toBeDefined();
    expect(emailMarketingAudienceSnapshots.criteria).toBeDefined();
    expect(emailMarketingExportAudits.contentHash).toBeDefined();
    expect("csv" in emailMarketingExportAudits).toBe(false);
    expect("email" in emailMarketingExportAudits).toBe(false);
    expect("phone" in emailMarketingExportAudits).toBe(false);
    expect(emailMarketingAudienceSnapshots.sourceKind).toBeDefined();
    expect(emailMarketingAudienceMembers.decision).toBeDefined();
    expect(emailMarketingAudienceMembers.reason).toBeDefined();
    expect("leadName" in emailMarketingAudienceMembers).toBe(false);
    expect("normalizedEmail" in emailMarketingAudienceMembers).toBe(false);
    expect(emailMarketingAudienceMembers.leadId.notNull).toBe(false);
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

  it("generates a privacy migration after 0050", () => {
    const migration = readFileSync(fileURLToPath(new URL("../migrations/0051_email_marketing_preparation.sql", import.meta.url)), "utf8");
    expect(migration).toContain('DROP COLUMN "lead_name"');
    expect(migration).toContain('DROP COLUMN "normalized_email"');
    expect(migration).toContain("ON DELETE set null");
    expect(migration).toContain("NEW.lead_id IS NULL");
    expect(migration).toContain("OLD.evidence::jsonb - 'selectedLeadId'");
    expect(migration).toContain('DROP TRIGGER "email_marketing_audience_members_immutable"');
    expect(migration).toContain('CREATE TRIGGER "email_marketing_export_audits_immutable"');
    expect(migration).toContain("NEW.id IS NOT DISTINCT FROM OLD.id");
    expect(migration).toContain("NEW.snapshot_id IS NOT DISTINCT FROM OLD.snapshot_id");
    expect(migration).toContain("NEW.decision IS NOT DISTINCT FROM OLD.decision");
    expect(migration).toContain("NEW.reason IS NOT DISTINCT FROM OLD.reason");
    expect(migration).toContain("NEW.created_at IS NOT DISTINCT FROM OLD.created_at");
    expect(migration).toContain("NEW.evidence := ((OLD.evidence::jsonb - 'selectedLeadId') || '{\"anonymized\":true}'::jsonb)::json");
    expect(migration).toContain("RAISE EXCEPTION 'Email marketing audience snapshots are immutable'");
    expect(migration).not.toMatch(/\b(?:outbox|provider_message|tracking_pixel)\b/i);
  });
});

