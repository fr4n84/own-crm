import { z } from "zod/v4";

const QUARTER_HOUR_MESSAGE = "La hora debe usar intervalos exactos de 15 minutos";

export const quarterHourTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(?:00|15|30|45)$/, QUARTER_HOUR_MESSAGE);

export function isQuarterHourTime(value: string) {
  return quarterHourTimeSchema.safeParse(value).success;
}

export { QUARTER_HOUR_MESSAGE };
