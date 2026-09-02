import { z } from "zod";

import { madridDayKey } from "../commercial-observatory/domain";
import { getDashboardSummary } from "../dashboard/dashboard-summary";
import { getConversionFunnel } from "../dashboard/conversion-funnel-service";
import {
  getQualityControls,
  updateQualitySettings,
} from "../dashboard/quality-controls-service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const calendarDay = date.refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toISOString().slice(0, 10) === value;
}, "Invalid calendar day");

export const dashboardSummaryInput = z
  .object({
    from: calendarDay,
    to: calendarDay.refine(
      (value) => value <= madridDayKey(new Date()),
      "The end date cannot be in the future",
    ),
  })
  .superRefine((input, context) => {
    if (input.from > input.to) {
      context.addIssue({
        code: "custom",
        message: "The end date cannot be before the start date",
        path: ["to"],
      });
    }
    if (input.from >= madridDayKey(new Date())) {
      context.addIssue({
        code: "custom",
        message: "The range must contain at least one closed Madrid day",
        path: ["from"],
      });
    }
  });

const conversionFunnelInput = z
  .object({
    from: date,
    to: date,
    callerId: z.string().min(1).optional(),
    closerId: z.string().min(1).optional(),
    type: z.enum(["maestra", "vsl"]).optional(),
  })
  .refine((input) => input.from <= input.to, {
    message: "The end date cannot be before the start date",
    path: ["to"],
  });

const qualityControlsInput = z
  .object({
    from: date,
    to: date,
    callerId: z.string().min(1).optional(),
    closerId: z.string().min(1).optional(),
  })
  .refine((input) => input.from <= input.to, {
    message: "The end date cannot be before the start date",
    path: ["to"],
  });

const qualitySettingsInput = z.object({
  callerAbandonedHours: z.number().int().min(0).max(8760),
  closerAbandonedHours: z.number().int().min(0).max(8760),
  callerFollowUpGraceHours: z.number().int().min(0).max(8760),
  closerFollowUpGraceHours: z.number().int().min(0).max(8760),
  callerLowConversionPercent: z.number().int().min(0).max(100),
  closerLowConversionPercent: z.number().int().min(0).max(100),
});

export const dashboardRouter = router({
  summary: permittedProcedure(["leads:read"])
    .input(dashboardSummaryInput)
    .query(({ input }) => getDashboardSummary(input)),
  conversionFunnel: permittedProcedure(["leads:read"])
    .input(conversionFunnelInput)
    .query(({ input }) => getConversionFunnel(input)),
  qualityControls: permittedProcedure(["leads:read"])
    .input(qualityControlsInput)
    .query(({ input }) => getQualityControls(input)),
  updateQualitySettings: permittedProcedure(["settings:write"])
    .input(qualitySettingsInput)
    .mutation(({ ctx, input }) => updateQualitySettings(ctx.session.user.id, input)),
});
