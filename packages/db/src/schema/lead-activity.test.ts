import { describe, expect, it } from "vitest";

import { getTableConfig } from "drizzle-orm/pg-core";
import { leadActivityEvents, LEAD_ACTIVITY_KIND } from "./lead-activity";

describe("lead activity schema", () => {
  it("stores immutable lead-scoped events with a stable dedupe key", () => {
    expect(leadActivityEvents.leadId).toBeDefined();
    expect(leadActivityEvents.kind).toBeDefined();
    expect(leadActivityEvents.actorId).toBeDefined();
    expect(leadActivityEvents.metadata).toBeDefined();
    expect(leadActivityEvents.dedupeKey).toBeDefined();
    expect(leadActivityEvents.occurredAt).toBeDefined();
  });

  it("exposes an immutable current-attribution update kind", () => {
    expect(LEAD_ACTIVITY_KIND.LEAD_ATTRIBUTION_UPDATED).toBe(
      "lead_attribution_updated",
    );
  });

	it("follows aggregate lifecycle for deleted leads and actors", () => {
		const foreignKeys = getTableConfig(leadActivityEvents).foreignKeys;
		expect(foreignKeys).toHaveLength(2);
		expect(foreignKeys.map((foreignKey) => foreignKey.onDelete).sort()).toEqual([
			"cascade",
			"set null",
		]);
	});
});
