import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, eq, inArray } from "@crm-fran/db";
import {
  leadMarketingAttributions,
  leads,
  marketingAngles,
  marketingAttributionRuleVersions,
  marketingCampaigns,
  marketingCreativeVersions,
  roles,
  user,
} from "@crm-fran/db/schema/index";

import { createLead } from "../leads/services/create-lead";
import { marketingAttributionService } from "./service";

describe("marketing attribution service", () => {
  const actorId = crypto.randomUUID();
  const leadIds: string[] = [];
  const campaignIds: string[] = [];
  const angleIds: string[] = [];
  const creativeIds: string[] = [];
  const ruleIds: string[] = [];

  beforeAll(async () => {
    await db
      .insert(roles)
      .values({ id: "role-marketing-test", name: "Marketing Test", permissions: ["*"] })
      .onConflictDoNothing();
    await db.insert(user).values({
      id: actorId,
      name: "Marketing Admin",
      email: `${actorId}@test.com`,
      roleId: "role-marketing-test",
    });
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, actorId));
    await db.delete(roles).where(eq(roles.id, "role-marketing-test"));
  });

  afterEach(async () => {
    if (leadIds.length > 0) await db.delete(leads).where(inArray(leads.id, leadIds));
    if (ruleIds.length > 0) {
      await db
        .delete(marketingAttributionRuleVersions)
        .where(inArray(marketingAttributionRuleVersions.id, ruleIds));
    }
    if (creativeIds.length > 0) {
      await db
        .delete(marketingCreativeVersions)
        .where(inArray(marketingCreativeVersions.id, creativeIds));
    }
    if (angleIds.length > 0) {
      await db.delete(marketingAngles).where(inArray(marketingAngles.id, angleIds));
    }
    if (campaignIds.length > 0) {
      await db
        .delete(marketingCampaigns)
        .where(inArray(marketingCampaigns.id, campaignIds));
    }
    leadIds.length = 0;
    campaignIds.length = 0;
    angleIds.length = 0;
    creativeIds.length = 0;
    ruleIds.length = 0;
  });

  it("backfills imported leads and automatically resolves future leads", async () => {
    const utmContent = `test-creative-${crypto.randomUUID()}`;
    const importedLeadId = crypto.randomUUID();
    leadIds.push(importedLeadId);
    await db.insert(leads).values({
      id: importedLeadId,
      name: "Imported marketing lead",
      email: null,
      phone: "600000101",
      utmContent,
      createdAt: new Date("2026-08-10T10:00:00.000Z"),
      updatedAt: new Date("2026-08-10T10:00:00.000Z"),
    });

    const saved = await marketingAttributionService.saveMapping({
      leadSource: null,
      utmContent,
      campaignSource: "Meta Ads",
      campaignName: "Campaign test",
      creativeName: "Creative test",
      creativeFormat: "video",
      angleName: "Freedom test",
      actorId,
    });
    campaignIds.push(saved.campaign.id);
    if (saved.angle) angleIds.push(saved.angle.id);
    creativeIds.push(saved.creative!.id);
    ruleIds.push(saved.rule!.id);

    expect(saved.processed).toBe(1);
    const [attributedImported] = await db
      .select()
      .from(leadMarketingAttributions)
      .where(eq(leadMarketingAttributions.leadId, importedLeadId));
    expect(attributedImported?.matchKind).toBe("backfill");
    const [updatedImported] = await db
      .select({
        source: leads.source,
        campaign: leads.campaign,
        creative: leads.creative,
        angle: leads.acquisitionAngle,
      })
      .from(leads)
      .where(eq(leads.id, importedLeadId));
    expect(updatedImported).toEqual({
      source: "Meta Ads",
      campaign: "Campaign test",
      creative: "Creative test",
      angle: "Freedom test",
    });

    const futureLead = await createLead({
      name: "Future marketing lead",
      email: `${crypto.randomUUID()}@test.com`,
      phone: "600000102",
      source: "Meta Ads",
      utmContent,
      type: "maestra",
    });
    leadIds.push(futureLead.id);
    expect(futureLead.campaign).toBe("Campaign test");
    expect(futureLead.creative).toBe("Creative test");

    const [futureAttribution] = await db
      .select()
      .from(leadMarketingAttributions)
      .where(eq(leadMarketingAttributions.leadId, futureLead.id));
    expect(futureAttribution?.matchKind).toBe("automatic");
  });
});
