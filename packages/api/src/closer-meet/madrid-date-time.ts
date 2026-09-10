import { z } from "zod/v4";

const MADRID_TIME_ZONE = "Europe/Madrid";
const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const localTimePattern = /^(\d{2}):(\d{2})$/;

const scheduledDateSchema = z.string()
  .regex(localDatePattern, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const match = localDatePattern.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return candidate.getUTCFullYear() === year
      && candidate.getUTCMonth() === month - 1
      && candidate.getUTCDate() === day;
  }, "Date must be a valid calendar date");

const scheduledTimeSchema = z.string()
  .regex(localTimePattern, "Time must use HH:mm")
  .refine((value) => {
    const match = localTimePattern.exec(value);
    if (!match) return false;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour <= 23 && minute <= 59 && minute % 15 === 0;
  }, "Time must be valid and use 15-minute intervals");

export const madridLocalScheduleSchema = z.object({
  scheduledDate: scheduledDateSchema,
  scheduledTime: scheduledTimeSchema,
});

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MADRID_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function madridParts(date: Date) {
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function parseMadridLocalDateTime(day: string, time: string) {
  const {
    scheduledDate,
    scheduledTime,
  } = madridLocalScheduleSchema.parse({
    scheduledDate: day,
    scheduledTime: time,
  });
  const dateMatch = localDatePattern.exec(scheduledDate)!;
  const timeMatch = localTimePattern.exec(scheduledTime)!;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const date = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const candidates = [1, 2]
    .map((offsetHours) => new Date(Date.UTC(year, month - 1, date, hour - offsetHours, minute)))
    .filter((candidate) => {
      const parts = madridParts(candidate);
      return parts.year === dateMatch[1]
        && parts.month === dateMatch[2]
        && parts.day === dateMatch[3]
        && parts.hour === timeMatch[1]
        && parts.minute === timeMatch[2];
    });

  if (candidates.length !== 1) {
    throw new Error("The selected date and time does not identify one valid Europe/Madrid instant");
  }
  return candidates[0]!;
}
