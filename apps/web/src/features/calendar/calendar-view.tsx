"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { isCallerRoleId, isCloserRoleId } from "@/lib/role-capabilities";
import { Field, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { useIsMobile } from "@crm-fran/ui/hooks/use-mobile";
import { Can } from "@crm-fran/ui/permissions/can";

import { filterAgendaLeads } from "@/features/agendas/agenda-utils";
import LeadViewDrawer from "@/features/leads/lead-view-drawer";
import { trpc } from "@/utils/trpc";

import styles from "../../app/calendar/calendar.module.css";
import {
  CalendarEventDetailsDialog,
  CalendarEventDialog,
} from "./calendar-event-dialog";
import { CalendarSettingsDialog } from "./calendar-settings-dialog";
import {
  CALENDAR_HOURS,
  filterCalendarEntries,
  getCalendarDays,
  groupAgendaLeadsBySlot,
} from "./calendar-utils";
import {
  useCalendarAssignees,
  useCalendarEvents,
  useCalendarPreferences,
} from "./use-calendar";

type CalendarEntry = {
  id: string;
  title: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  callerId: string | null;
  closerId: string | null;
  caller: { id: string; name: string } | null;
  closer: { id: string; name: string } | null;
  source: "agenda" | "manual";
  questions?: Array<{
    questionKey: string;
    question: string;
    answer: string;
    authorRole: "caller" | "closer";
    authorId: string | null;
  }>;
  feedback?: string;
};

const VIEW_DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

export function CalendarView() {
  const isMobile = useIsMobile();
  const [startDate, setStartDate] = useState(() => new Date());
  const [viewDays, setViewDays] = useState(3);
  const [hasAppliedMobileDefault, setHasAppliedMobileDefault] = useState(false);
  const [callerFilter, setCallerFilter] = useState("all");
  const [closerFilter, setCloserFilter] = useState("all");
  const days = getCalendarDays(startDate, viewDays);
  const firstDay = days[0];
  const lastDay = days.at(-1);
  const leadsQuery = useQuery(trpc.leads.listAll.queryOptions());
  const eventsQuery = useCalendarEvents(firstDay?.key ?? "", lastDay?.key ?? "");
  const assigneesQuery = useCalendarAssignees();
  const preferencesQuery = useCalendarPreferences();

  useEffect(() => {
    if (!isMobile || hasAppliedMobileDefault) return;
    setViewDays(1);
    setHasAppliedMobileDefault(true);
  }, [hasAppliedMobileDefault, isMobile]);

  if (
    leadsQuery.isLoading ||
    eventsQuery.isLoading ||
    assigneesQuery.isLoading ||
    preferencesQuery.isLoading
  ) {
    return <Skeleton className="h-[48rem] w-full" />;
  }

  if (
    leadsQuery.isError ||
    eventsQuery.isError ||
    assigneesQuery.isError ||
    preferencesQuery.isError
  ) {
    return <p>Error al cargar el calendario.</p>;
  }

  const agendaDuration = preferencesQuery.data?.agendaDurationMinutes ?? 60;
  const assignees = assigneesQuery.data ?? [];
  const callers = assignees.filter((person) => isCallerRoleId(person.roleId));
  const closers = assignees.filter((person) => isCloserRoleId(person.roleId));
  const agendaEntries: CalendarEntry[] = filterAgendaLeads(
    leadsQuery.data ?? [],
  ).map((lead) => ({
    id: `agenda-${lead.id}`,
    title: lead.name,
    scheduledDate: lead.scheduledDate,
    scheduledTime: lead.scheduledTime,
    durationMinutes: agendaDuration,
    callerId: lead.caller?.id ?? null,
    closerId: lead.closer?.id ?? null,
    caller: lead.caller,
    closer: lead.closer,
    source: "agenda",
    questions: lead.questions.map((question) => ({
      questionKey: question.questionKey ?? "",
      question: question.question ?? question.questionKey ?? "",
      answer: question.answer,
      authorRole: question.authorRole,
      authorId: question.authorId ?? null,
    })),
    feedback: lead.feedback,
  }));
  const manualEntries: CalendarEntry[] = (eventsQuery.data ?? []).map(
    (event) => ({
      id: `manual-${event.id}`,
      title: event.title,
      scheduledDate: event.date,
      scheduledTime: event.startTime,
      durationMinutes: event.durationMinutes,
      callerId: event.callerId,
      closerId: event.closerId,
      caller: event.caller?.id ? event.caller : null,
      closer: event.closer?.id ? event.closer : null,
      source: "manual",
    }),
  );
  const filteredEntries = filterCalendarEntries(
    [...agendaEntries, ...manualEntries],
    callerFilter,
    closerFilter,
  );
  const entriesBySlot = groupAgendaLeadsBySlot(filteredEntries);

  const moveDays = (amount: number) => {
    setStartDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount);
      return next;
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Vista del calendario</CardTitle>
          <CardDescription>
            Los filtros de caller y closer funcionan de forma independiente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Caller</FieldLabel>
              <Select value={callerFilter} onValueChange={(value) => setCallerFilter(value ?? "all")}>
                <SelectTrigger aria-label="Filtrar calendario por caller">
                  <SelectValue placeholder="Todos los callers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Todos los callers</SelectItem>
                    {callers.map((person) => (
                      <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Closer</FieldLabel>
              <Select value={closerFilter} onValueChange={(value) => setCloserFilter(value ?? "all")}>
                <SelectTrigger aria-label="Filtrar calendario por closer">
                  <SelectValue placeholder="Todos los closers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Todos los closers</SelectItem>
                    {closers.map((person) => (
                      <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Días visibles</FieldLabel>
              <Select value={String(viewDays)} onValueChange={(value) => setViewDays(Number(value ?? 3))}>
                <SelectTrigger aria-label="Elegir días visibles">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {VIEW_DAY_OPTIONS.map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count} {count === 1 ? "día" : "días"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
        <Can permission="leads:write">
          <CardFooter className="flex-wrap gap-2">
            <CalendarEventDialog assignees={assignees} defaultDuration={agendaDuration} />
            <CalendarSettingsDialog agendaDurationMinutes={agendaDuration} />
          </CardFooter>
        </Can>
      </Card>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{firstDay?.dateLabel} – {lastDay?.dateLabel}</CardTitle>
            <CardDescription>Agendas y citas entre las 09:00 y las 23:00.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Ver días anteriores" onClick={() => moveDays(-viewDays)}>
              <ChevronLeft data-icon="inline-start" />
            </Button>
            <Button variant="outline" onClick={() => setStartDate(new Date())}>Hoy</Button>
            <Button variant="outline" size="icon" aria-label="Ver días siguientes" onClick={() => moveDays(viewDays)}>
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-x-auto px-0 pb-0">
          <div
            className={styles.calendarGrid}
            style={{
              gridTemplateColumns: `4rem repeat(${viewDays}, minmax(13rem, 1fr))`,
              minWidth: `${4 + viewDays * 13}rem`,
            }}
          >
            <div className={styles.cornerCell}>Hora</div>
            {days.map((day) => (
              <div key={day.key} className={styles.dayHeader}>
                <span className={styles.weekday}>{day.weekdayLabel}</span>
                <strong className={day.isToday ? styles.todayNumber : styles.dayNumber}>{day.dayNumber}</strong>
              </div>
            ))}

            {CALENDAR_HOURS.flatMap((hour) => [
              <div key={`hour-${hour}`} className={styles.hourCell}>
                {String(hour).padStart(2, "0")}:00
              </div>,
              ...days.map((day) => {
                const slotKey = `${day.key}-${String(hour).padStart(2, "0")}`;
                const entries = entriesBySlot.get(slotKey) ?? [];

                return (
                  <div key={slotKey} className={styles.timeSlot}>
                    {entries.map((entry) => {
                      const trigger = <EventContent entry={entry} />;

                      return entry.source === "agenda" ? (
                        <LeadViewDrawer
                          key={entry.id}
                          callerOnly
                          lead={{
                            id: entry.id,
                            questions: entry.questions ?? [],
                            feedback: entry.feedback,
                          }}
                          trigger={trigger}
                          triggerAriaLabel={`Ver feedback del caller de ${entry.title}`}
                        />
                      ) : (
                        <CalendarEventDetailsDialog
                          key={entry.id}
                          title={entry.title}
                          durationMinutes={entry.durationMinutes}
                          callerName={entry.caller?.name}
                          closerName={entry.closer?.name}
                          trigger={trigger}
                        />
                      );
                    })}
                  </div>
                );
              }),
            ])}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EventContent({ entry }: { entry: CalendarEntry }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden">
      <strong className="truncate">{entry.title}</strong>
      <span className="shrink-0 font-mono text-[10px] opacity-80">{entry.scheduledTime}</span>
      <span className="shrink-0 text-[10px] opacity-75">· {entry.durationMinutes} min</span>
      <span className="truncate text-[10px] opacity-75">· {entry.closer?.name ?? entry.caller?.name ?? "Sin asignar"}</span>
    </span>
  );
}
