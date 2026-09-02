import type { AgendaLead } from "../agendas/agenda-utils";
import { formatLocalDate } from "../agendas/agenda-utils";

export const CALENDAR_HOURS = Array.from({ length: 15 }, (_, index) => index + 9);

export type CalendarDay = {
  date: Date;
  key: string;
  weekdayLabel: string;
  dateLabel: string;
  dayNumber: number;
  isToday: boolean;
};

export function getCalendarDays(start: Date, count = 3): CalendarDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setHours(12, 0, 0, 0);
    date.setDate(start.getDate() + index);

    const today = new Date();

    return {
      date,
      key: formatLocalDate(date),
      weekdayLabel: new Intl.DateTimeFormat("es-ES", {
        weekday: "long",
      }).format(date),
      dateLabel: new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
      }).format(date),
      dayNumber: date.getDate(),
      isToday: formatLocalDate(date) === formatLocalDate(today),
    };
  });
}

type CalendarAssignment = {
  callerId?: string | null;
  closerId?: string | null;
  caller?: { id: string } | null;
  closer?: { id: string } | null;
};

export function filterCalendarEntries<T extends CalendarAssignment>(
  entries: readonly T[],
  callerId: string,
  closerId: string,
): T[] {
  return entries.filter((entry) => {
    const entryCallerId = entry.callerId ?? entry.caller?.id;
    const entryCloserId = entry.closerId ?? entry.closer?.id;

    return (
      (callerId === "all" || entryCallerId === callerId) &&
      (closerId === "all" || entryCloserId === closerId)
    );
  });
}

export function groupAgendaLeadsBySlot<
  T extends Pick<AgendaLead, "scheduledDate" | "scheduledTime">,
>(leads: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const lead of leads) {
    const match = /^(\d{2}):(\d{2})/.exec(lead.scheduledTime);
    const hour = match?.[1] ? Number(match[1]) : Number.NaN;
    if (
      lead.scheduledDate === "Sin asignar" ||
      !Number.isInteger(hour) ||
      hour < 9 ||
      hour > 23
    ) {
      continue;
    }

    const key = `${lead.scheduledDate}-${String(hour).padStart(2, "0")}`;
    const slot = groups.get(key) ?? [];
    slot.push(lead);
    groups.set(key, slot);
  }

  for (const slot of groups.values()) {
    slot.sort((first, second) =>
      first.scheduledTime.localeCompare(second.scheduledTime),
    );
  }

  return groups;
}
