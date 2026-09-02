import { describe, expect, it } from "vitest";

import type { AgendaLead } from "../agendas/agenda-utils";
import {
  CALENDAR_HOURS,
  filterCalendarEntries,
  getCalendarDays,
  groupAgendaLeadsBySlot,
} from "./calendar-utils";

function agenda(overrides: Partial<AgendaLead> = {}): AgendaLead {
  return {
    id: "lead-1",
    name: "Ana",
    caller: { id: "caller-1", name: "Caller" },
    closer: { id: "closer-1", name: "Closer" },
    questions: [],
    scheduledDate: "2026-08-17",
    scheduledTime: "09:30",
    ...overrides,
  };
}

describe("calendar utilities", () => {
  it("creates hourly rows from 09:00 through 23:00", () => {
    expect(CALENDAR_HOURS).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });

  it("creates three consecutive local days", () => {
    const days = getCalendarDays(new Date(2026, 7, 17, 15));

    expect(days.map((day) => day.key)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ]);
    expect(days.map((day) => day.dayNumber)).toEqual([17, 18, 19]);
  });

  it("creates the selected number of days", () => {
    expect(getCalendarDays(new Date(2026, 7, 17), 5)).toHaveLength(5);
  });

  it("combines caller and closer filters independently", () => {
    const entries = [
      { id: "both", callerId: "caller-a", closerId: "closer-a" },
      { id: "caller", callerId: "caller-a", closerId: "closer-b" },
      { id: "closer", callerId: "caller-b", closerId: "closer-a" },
    ];

    expect(filterCalendarEntries(entries, "caller-a", "all").map((e) => e.id)).toEqual([
      "both",
      "caller",
    ]);
    expect(filterCalendarEntries(entries, "all", "closer-a").map((e) => e.id)).toEqual([
      "both",
      "closer",
    ]);
    expect(filterCalendarEntries(entries, "caller-a", "closer-a").map((e) => e.id)).toEqual([
      "both",
    ]);
  });

  it("groups valid agendas by date and hour and sorts them by time", () => {
    const groups = groupAgendaLeadsBySlot([
      agenda({ id: "late", scheduledTime: "09:45" }),
      agenda({ id: "early", scheduledTime: "09:15" }),
      agenda({ id: "last", scheduledTime: "23:10" }),
      agenda({ id: "invalid", scheduledTime: "Sin asignar" }),
      agenda({ id: "too-early", scheduledTime: "08:30" }),
    ]);

    expect(groups.get("2026-08-17-09")?.map((lead) => lead.id)).toEqual([
      "early",
      "late",
    ]);
    expect(groups.get("2026-08-17-23")?.map((lead) => lead.id)).toEqual([
      "last",
    ]);
    expect(groups.has("2026-08-17-08")).toBe(false);
  });
});
