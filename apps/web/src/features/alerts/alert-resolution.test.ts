import { describe, expect, it } from "vitest";

import {
  getAppointmentOutcomeLabel,
  shouldResolveSourceAlert,
} from "./alert-resolution";

describe("alert resolution", () => {
  it("offers Reagenda only after an Agenda exists", () => {
    expect(getAppointmentOutcomeLabel("appointment")).toBe("Reagenda");
    expect(getAppointmentOutcomeLabel("rescheduled")).toBe("Reagenda");
    expect(getAppointmentOutcomeLabel("follow_up")).toBe("Agenda");
    expect(getAppointmentOutcomeLabel("future_call")).toBe("Agenda");
  });

  it("keeps the same alert active when it becomes a reschedule", () => {
    expect(
      shouldResolveSourceAlert({
        sourceAlertId: "alert-1",
        nextAlertId: "alert-1",
      }),
    ).toBe(false);
  });

  it("resolves terminal alerts and alerts replaced by a new one", () => {
    expect(
      shouldResolveSourceAlert({
        sourceAlertId: "alert-1",
        nextAlertId: undefined,
      }),
    ).toBe(true);
    expect(
      shouldResolveSourceAlert({
        sourceAlertId: "alert-1",
        nextAlertId: "alert-2",
      }),
    ).toBe(true);
  });
});
