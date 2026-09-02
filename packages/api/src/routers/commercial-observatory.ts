import { z } from "zod";

import { madridDayKey } from "../commercial-observatory/domain";
import { getCommercialObservatory } from "../commercial-observatory/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const isoCurrency = z.string().regex(/^[A-Z]{3}$/);
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toISOString().slice(0, 10) === value;
}, "invalid calendar day");

export const commercialObservatoryInput = z.object({
  from: calendarDay,
  to: calendarDay.refine((value) => value <= madridDayKey(new Date()), "to cannot be in the future"),
  currency: isoCurrency.optional(),
}).superRefine((value, context) => {
  if (value.from > value.to) context.addIssue({ code: "custom", path: ["to"], message: "to must not be before from" });
  if (value.from >= madridDayKey(new Date())) context.addIssue({ code: "custom", path: ["from"], message: "range must contain at least one closed Madrid day" });
});

export const commercialObservatoryRouter = router({
  overview: permittedProcedure(["*"])
    .input(commercialObservatoryInput)
    .query(({ input }) => getCommercialObservatory(input)),
});
