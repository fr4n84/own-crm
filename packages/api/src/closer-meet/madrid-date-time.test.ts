import { describe, expect, it } from "vitest";

import {
  madridLocalScheduleSchema,
  parseMadridLocalDateTime,
} from "./madrid-date-time";

describe("parseMadridLocalDateTime", () => {
  it("resolves winter and summer offsets in Europe/Madrid", () => {
    expect(parseMadridLocalDateTime("2026-01-15", "10:30")).toEqual(new Date("2026-01-15T09:30:00.000Z"));
    expect(parseMadridLocalDateTime("2026-07-15", "10:30")).toEqual(new Date("2026-07-15T08:30:00.000Z"));
  });

  it("rejects nonexistent and ambiguous wall-clock times", () => {
    expect(() => parseMadridLocalDateTime("2026-03-29", "02:30")).toThrow("does not identify one valid Europe/Madrid instant");
    expect(() => parseMadridLocalDateTime("2026-10-25", "02:30")).toThrow("does not identify one valid Europe/Madrid instant");
  });

  it("validates the local scheduling contract before conversion", () => {
    expect(madridLocalScheduleSchema.parse({
      scheduledDate: "2026-09-10",
      scheduledTime: "10:45",
    })).toEqual({
      scheduledDate: "2026-09-10",
      scheduledTime: "10:45",
    });

    expect(() => madridLocalScheduleSchema.parse({
      scheduledDate: "2026-02-30",
      scheduledTime: "10:45",
    })).toThrow();
    expect(() => madridLocalScheduleSchema.parse({
      scheduledDate: "2026-09-10",
      scheduledTime: "10:10",
    })).toThrow();
  });
});
