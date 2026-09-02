import { describe, expect, it } from "vitest";

import { calendarEvents, calendarPreferences } from "./calendar";

describe("calendar schema", () => {
  it("defaults CRM agenda duration to one hour", () => {
    expect(calendarPreferences.agendaDurationMinutes.default).toBe(60);
  });

  it("allows caller and closer assignments to be optional", () => {
    expect(calendarEvents.callerId.notNull).toBe(false);
    expect(calendarEvents.closerId.notNull).toBe(false);
  });
});
