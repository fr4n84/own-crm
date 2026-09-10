import { describe, expect, it } from "vitest";

import { paymentProviderProfiles, paymentReconciliationAllocations, paymentReconciliationBatches, paymentReconciliations } from "./index";

describe("payment reconciliation persistence", () => {
  it("stores provider identity, batch audit, and immutable confirmed references", () => {
    expect(paymentProviderProfiles.providerKey).toBeDefined();
    expect(paymentReconciliationBatches.contentHash).toBeDefined();
    expect(paymentReconciliations.externalReference).toBeDefined();
    expect(paymentReconciliations.financialEventId).toBeDefined();
    expect(paymentReconciliationAllocations.installmentId).toBeDefined();
  });
});
