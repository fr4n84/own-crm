import { z } from "zod";

import { isIsoCurrency } from "../ask-crm/domain";
import { askCrmService } from "../ask-crm/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const overrides = z.object({
  fromDay: calendarDay.optional(),
  toDay: calendarDay.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).refine(isIsoCurrency, "Unsupported ISO currency").optional(),
  horizon: z.union([z.literal(30), z.literal(60), z.literal(90)]).optional(),
  dimension: z.enum(["source", "campaign", "profile", "ad", "creative", "angle", "caller", "closer"]).optional(),
  metric: z.enum(["sales", "margin", "reaction"]).optional(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.fromDay) !== Boolean(value.toDay)) context.addIssue({ code: "custom", message: "Both period boundaries are required" });
  if (value.fromDay && value.toDay) {
    const from = Date.parse(`${value.fromDay}T00:00:00.000Z`);
    const to = Date.parse(`${value.toDay}T00:00:00.000Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) context.addIssue({ code: "custom", path: ["toDay"], message: "Invalid period" });
    else if ((to - from) / 86_400_000 + 1 > 366) context.addIssue({ code: "custom", path: ["toDay"], message: "Period cannot exceed 366 days" });
  }
});

export const askCrmInput = z.object({
  question: z.string().trim().min(3).max(280),
  overrides: overrides.optional(),
}).strict();

const admin = permittedProcedure(["*"]);

export const askCrmRouter = router({
  catalog: admin.query(() => askCrmService.catalog()),
  ask: admin.input(askCrmInput).query(({ input }) => askCrmService.ask(input)),
});
