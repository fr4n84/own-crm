import { describe, expect, it } from "vitest";

import {
  createCalendarEventInputSchema,
  updateCalendarPreferencesInputSchema,
} from "./calendar-input";

describe("calendar input", () => {
  it("accepts a manual event with independent caller and closer assignments", () => {
    const result = createCalendarEventInputSchema.parse({
      title: "Reunión interna",
      date: "2026-08-20",
      startTime: "10:30",
      durationMinutes: 45,
      callerId: "caller-1",
      closerId: "closer-1",
    });

    expect(result.durationMinutes).toBe(45);
  });

  it("rejects invalid durations", () => {
    expect(() =>
      createCalendarEventInputSchema.parse({
        title: "Evento",
        date: "2026-08-20",
        startTime: "10:30",
        durationMinutes: 0,
      }),
    ).toThrow();
    expect(() =>
      updateCalendarPreferencesInputSchema.parse({ agendaDurationMinutes: 721 }),
    ).toThrow();
  });
});
