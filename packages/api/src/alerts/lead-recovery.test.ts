import { describe, expect, it } from "vitest";

import {
  getLeadRecoveryTransition,
  isRecoverableNoContactAlert,
} from "./lead-recovery";

describe("getLeadRecoveryTransition", () => {
  it.each([
    [0, { impactCount: 1, poolStatus: "recovered" }],
    [1, { impactCount: 2, poolStatus: "recovered" }],
    [2, { impactCount: 3, poolStatus: "discarded" }],
  ] as const)("moves impact %s to the expected pool", (impactCount, expected) => {
    expect(getLeadRecoveryTransition(impactCount)).toEqual(expected);
  });

  it("does not recycle a discarded lead", () => {
    expect(getLeadRecoveryTransition(3)).toBeNull();
  });
});

describe("isRecoverableNoContactAlert", () => {
  const dueAlert = {
    kind: "no_contact",
    nextShowAt: new Date("2026-08-18T09:00:00.000Z"),
    resolvedAt: null,
    dismissedAt: null,
    targetUserId: "caller-1",
  };

  it("accepts the first unresolved expiration for the current caller", () => {
    expect(
      isRecoverableNoContactAlert(
        dueAlert,
        { callerId: "caller-1", closerId: null, poolStatus: "new" },
        new Date("2026-08-18T09:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it.each([
    [{ ...dueAlert, resolvedAt: new Date() }, "resolved"],
    [{ ...dueAlert, dismissedAt: new Date() }, "dismissed"],
    [{ ...dueAlert, targetUserId: "caller-2" }, "stale caller"],
    [{ ...dueAlert, nextShowAt: new Date("2026-08-18T10:00:00.000Z") }, "not due"],
  ])("rejects a %s alert", (alert, _reason) => {
    expect(
      isRecoverableNoContactAlert(
        alert,
        { callerId: "caller-1", closerId: null, poolStatus: "new" },
        new Date("2026-08-18T09:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("rejects leads that reached a closer or were discarded", () => {
    expect(
      isRecoverableNoContactAlert(
        dueAlert,
        { callerId: "caller-1", closerId: "closer-1", poolStatus: "new" },
        new Date("2026-08-18T09:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isRecoverableNoContactAlert(
        dueAlert,
        { callerId: "caller-1", closerId: null, poolStatus: "discarded" },
        new Date("2026-08-18T09:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
