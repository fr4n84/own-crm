import { describe, expect, it } from "vitest";
import { createCalendarEventInputSchema } from "../calendar/calendar-input";
import { quarterHourTimeSchema } from "./time-slot";

describe("quarter-hour scheduling", () => {
  it.each(["00:00", "09:15", "14:30", "23:45"])("accepts %s", (value) => {
    expect(quarterHourTimeSchema.parse(value)).toBe(value);
  });
  it.each(["09:01", "12:14", "18:44", "24:00", "9:15"])("rejects %s", (value) => {
    expect(quarterHourTimeSchema.safeParse(value).success).toBe(false);
  });
  it("rejects manual events outside quarter-hour slots", () => {
    expect(createCalendarEventInputSchema.safeParse({ title: "Evento", date: "2026-08-20", startTime: "10:17", durationMinutes: 30 }).success).toBe(false);
  });
});
