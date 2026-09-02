import { describe, expect, it } from "vitest";

import { getEffectiveAlertSeverity } from "./alert-relevance";

const HOUR_MS = 60 * 60 * 1000;
const createdAt = new Date("2099-01-01T00:00:00.000Z");

describe("effective alert relevance", () => {
  it("automatically raises condition severity as the deadline approaches", () => {
    expect(
      getEffectiveAlertSeverity(
        { kind: "follow_up", severity: "warning", createdAt },
        {
          mode: "condition",
          urgentThresholdHours: 2,
          warningThresholdHours: 6,
          conditionSeverities: {
            no_contact: "urgent",
            follow_up: "info",
            future_call: "warning",
            appointment: "urgent",
            rescheduled: "warning",
          },
        },
        createdAt.getTime() + 11 * HOUR_MS,
      ),
    ).toBe("urgent");
  });

  it("never lowers a configured condition severity", () => {
    expect(
      getEffectiveAlertSeverity(
        { kind: "appointment", severity: "info", createdAt },
        {
          mode: "condition",
          urgentThresholdHours: 2,
          warningThresholdHours: 6,
          conditionSeverities: {
            no_contact: "urgent",
            follow_up: "info",
            future_call: "info",
            appointment: "urgent",
            rescheduled: "info",
          },
        },
        createdAt.getTime(),
      ),
    ).toBe("urgent");
  });

  it("uses the scheduled display time when the alert provides one", () => {
    expect(
      getEffectiveAlertSeverity(
        {
          kind: "future_call",
          severity: "info",
          createdAt,
          nextShowAt: new Date(createdAt.getTime() + 24 * HOUR_MS),
        },
        {
          mode: "condition",
          urgentThresholdHours: 2,
          warningThresholdHours: 6,
          conditionSeverities: {
            no_contact: "urgent",
            follow_up: "info",
            future_call: "info",
            appointment: "info",
            rescheduled: "info",
          },
        },
        createdAt.getTime() + 19 * HOUR_MS,
      ),
    ).toBe("warning");
  });

  it("changes relevance as the configured deadline approaches", () => {
    const preferences = {
      mode: "time" as const,
      urgentThresholdHours: 2,
      warningThresholdHours: 6,
      conditionSeverities: {
        no_contact: "urgent" as const,
        follow_up: "info" as const,
        future_call: "info" as const,
        appointment: "info" as const,
        rescheduled: "info" as const,
      },
    };

    expect(
      getEffectiveAlertSeverity(
        { kind: "follow_up", severity: "urgent", createdAt },
        preferences,
        createdAt.getTime() + 5 * HOUR_MS,
      ),
    ).toBe("info");
    expect(
      getEffectiveAlertSeverity(
        { kind: "follow_up", severity: "info", createdAt },
        preferences,
        createdAt.getTime() + 8 * HOUR_MS,
      ),
    ).toBe("warning");
    expect(
      getEffectiveAlertSeverity(
        { kind: "follow_up", severity: "info", createdAt },
        preferences,
        createdAt.getTime() + 11 * HOUR_MS,
      ),
    ).toBe("urgent");
  });

  it("keeps expired alerts urgent in time mode", () => {
    expect(
      getEffectiveAlertSeverity(
        { kind: "follow_up", severity: "info", createdAt },
        {
          mode: "time",
          urgentThresholdHours: 2,
          warningThresholdHours: 6,
          conditionSeverities: {
            no_contact: "urgent",
            follow_up: "info",
            future_call: "info",
            appointment: "info",
            rescheduled: "info",
          },
        },
        createdAt.getTime() + 13 * HOUR_MS,
      ),
    ).toBe("urgent");
  });
});
