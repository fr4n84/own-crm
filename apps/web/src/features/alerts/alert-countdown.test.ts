import { describe, expect, it } from "vitest";

import {
  formatAlertCountdown,
  getAlertCountdownDeadline,
  getAlertCountdownDuration,
  getAlertCountdownRemaining,
  getAlertRemaining,
} from "./alert-countdown";

describe("alert countdown", () => {
  it("uses 24 hours for no-contact and 12 hours for other kinds", () => {
    expect(getAlertCountdownDuration("no_contact")).toBe(24 * 60 * 60 * 1000);
    expect(getAlertCountdownDuration("follow_up")).toBe(12 * 60 * 60 * 1000);
  });

  it("calculates the deadline from creation time", () => {
    const createdAt = "2026-08-10T12:00:00.000Z";

    expect(getAlertCountdownDeadline(createdAt, "no_contact")).toBe(
      Date.parse("2026-08-11T12:00:00.000Z"),
    );
  });

  it("returns remaining time relative to the supplied current timestamp", () => {
    const createdAt = "2026-08-10T12:00:00.000Z";
    const now = Date.parse("2026-08-10T13:30:05.000Z");

    expect(getAlertCountdownRemaining(createdAt, "no_contact", now)).toBe(
      22 * 60 * 60 * 1000 + 29 * 60 * 1000 + 55 * 1000,
    );
  });

  it("counts future calls down to their scheduled display time", () => {
    const now = Date.parse("2026-08-10T12:00:00.000Z");

    expect(
      getAlertRemaining(
        {
          kind: "future_call",
          createdAt: "2026-08-10T10:00:00.000Z",
          nextShowAt: "2026-08-11T12:00:00.000Z",
        },
        now,
      ),
    ).toBe(24 * 60 * 60 * 1000);
  });

  it("formats positive, zero, and negative durations", () => {
    expect(
      formatAlertCountdown(
        12 * 60 * 60 * 1000 + 34 * 60 * 1000 + 56 * 1000,
      ),
    ).toBe("12:34:56");
    expect(formatAlertCountdown(0)).toBe("00:00:00");
    expect(formatAlertCountdown(-12 * 60 * 1000 - 35 * 1000)).toBe(
      "-00:12:35",
    );
  });
});
