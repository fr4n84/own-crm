import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const durationSchema = z.number().int().min(5).max(720);

export const listCalendarEventsInputSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((value) => value.to >= value.from, {
    message: "The end date must not be before the start date",
    path: ["to"],
  });

export const createCalendarEventInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  date: dateSchema,
  startTime: timeSchema,
  durationMinutes: durationSchema,
  callerId: z.string().min(1).nullable().optional(),
  closerId: z.string().min(1).nullable().optional(),
});

export const updateCalendarPreferencesInputSchema = z.object({
  agendaDurationMinutes: durationSchema,
});
