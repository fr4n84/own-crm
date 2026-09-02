import { TRPCError } from "@trpc/server";

import { alias } from "@crm-fran/db";
import { and, asc, db, eq, gte, inArray, lte } from "@crm-fran/db";
import {
  calendarEvents,
  calendarPreferences,
  user,
} from "@crm-fran/db/schema/index";
import {
  COMMERCIAL_ROLE_IDS,
  isCallerRoleId,
  isCloserRoleId,
} from "@crm-fran/db/schema/auth";

import { permittedProcedure } from "../trpc/trpc";
import { router } from "../index";
import {
  createCalendarEventInputSchema,
  listCalendarEventsInputSchema,
  updateCalendarPreferencesInputSchema,
} from "../calendar/calendar-input";

const caller = alias(user, "calendar_caller");
const closer = alias(user, "calendar_closer");

export const calendarRouter = router({
  list: permittedProcedure(["leads:read"])
    .input(listCalendarEventsInputSchema)
    .query(async ({ input }) =>
      db
        .select({
          id: calendarEvents.id,
          title: calendarEvents.title,
          date: calendarEvents.date,
          startTime: calendarEvents.startTime,
          durationMinutes: calendarEvents.durationMinutes,
          callerId: calendarEvents.callerId,
          closerId: calendarEvents.closerId,
          caller: { id: caller.id, name: caller.name },
          closer: { id: closer.id, name: closer.name },
        })
        .from(calendarEvents)
        .leftJoin(caller, eq(caller.id, calendarEvents.callerId))
        .leftJoin(closer, eq(closer.id, calendarEvents.closerId))
        .where(
          and(
            gte(calendarEvents.date, input.from),
            lte(calendarEvents.date, input.to),
          ),
        )
        .orderBy(asc(calendarEvents.date), asc(calendarEvents.startTime)),
    ),

  listAssignees: permittedProcedure(["leads:read"]).query(async () =>
    db
      .select({ id: user.id, name: user.name, roleId: user.roleId })
      .from(user)
      .where(inArray(user.roleId, [...COMMERCIAL_ROLE_IDS]))
      .orderBy(asc(user.name)),
  ),

  getPreferences: permittedProcedure(["leads:read"]).query(
    async ({ ctx }) => {
      const [preferences] = await db
        .select()
        .from(calendarPreferences)
        .where(eq(calendarPreferences.userId, ctx.session.user.id))
        .limit(1);

      return (
        preferences ?? {
          userId: ctx.session.user.id,
          agendaDurationMinutes: 60,
        }
      );
    },
  ),

  updatePreferences: permittedProcedure(["leads:write"])
    .input(updateCalendarPreferencesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [preferences] = await db
        .insert(calendarPreferences)
        .values({ userId: ctx.session.user.id, ...input })
        .onConflictDoUpdate({
          target: calendarPreferences.userId,
          set: { ...input, updatedAt: new Date() },
        })
        .returning();

      return preferences;
    }),

  create: permittedProcedure(["leads:write"])
    .input(createCalendarEventInputSchema)
    .mutation(async ({ ctx, input }) => {
      const assignedIds = [input.callerId, input.closerId].filter(
        (id): id is string => Boolean(id),
      );
      const assignedUsers =
        assignedIds.length > 0
          ? await db
              .select({ id: user.id, roleId: user.roleId })
              .from(user)
              .where(inArray(user.id, assignedIds))
          : [];
      const rolesById = new Map(
        assignedUsers.map((assignedUser) => [
          assignedUser.id,
          assignedUser.roleId,
        ]),
      );

      if (
        (input.callerId && !isCallerRoleId(rolesById.get(input.callerId))) ||
        (input.closerId && !isCloserRoleId(rolesById.get(input.closerId)))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid caller or closer assignment",
        });
      }

      const [event] = await db
        .insert(calendarEvents)
        .values({
          id: crypto.randomUUID(),
          title: input.title,
          date: input.date,
          startTime: input.startTime,
          durationMinutes: input.durationMinutes,
          callerId: input.callerId ?? null,
          closerId: input.closerId ?? null,
          createdById: ctx.session.user.id,
        })
        .returning();

      return event;
    }),
});
