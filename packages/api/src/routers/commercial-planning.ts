import { z } from "zod";

import { getCommercialPlanning } from "../commercial-planning/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const boundedMoney = z.number().int().min(0).max(2_000_000_000);
const boundedCount = z.number().int().min(0).max(100_000);
const boundedRate = z.number().int().min(0).max(10_000);
const boundedPositiveRate = z.number().int().min(1).max(10_000);
const boundedDailyVolume = z.number().min(0).max(100_000);

const capacityInput = z.object({
  availableCallers: boundedCount.optional(),
  callerCapacityPerDay: boundedDailyVolume.optional(),
  availableClosers: boundedCount.optional(),
  closerCapacityPerDay: boundedDailyVolume.optional(),
  targetUtilizationBps: boundedPositiveRate.optional(),
}).strict();

const commissionInput = z.object({
  fixedPerSaleCents: boundedMoney.optional(),
  collectionsPercentBps: boundedRate.optional(),
  callerShareBps: boundedRate.optional(),
  goalSales: boundedCount.optional(),
  goalBonusCents: boundedMoney.optional(),
  stretchSales: boundedCount.optional(),
  stretchBonusCents: boundedMoney.optional(),
}).strict().superRefine((value, context) => {
  if (value.goalSales !== undefined && value.stretchSales !== undefined && value.stretchSales < value.goalSales) context.addIssue({ code: "custom", path: ["stretchSales"], message: "stretch must not be below goal" });
});

const scenarioInput = z.object({
  leadVolumePerDay: boundedDailyVolume.optional(),
  appointmentRateBps: boundedRate.optional(),
  saleRateBps: boundedRate.optional(),
  collectionPerSaleCents: boundedMoney.optional(),
  refundPerSaleCents: boundedMoney.optional(),
  directCostPerSaleCents: boundedMoney.optional(),
  adSpendPerDayCents: boundedMoney.optional(),
  seasonalityEnabled: z.boolean().optional(),
  seasonalityFactorBps: z.number().int().min(1_000).max(30_000).optional(),
  capacity: capacityInput.optional(),
  commission: commissionInput.optional(),
}).strict().superRefine((value, context) => {
  const factor = value.seasonalityEnabled ? (value.seasonalityFactorBps ?? 10_000) / 10_000 : 1;
  const leads = (value.leadVolumePerDay ?? 0) * 90 * factor;
  const sales = leads * (value.saleRateBps ?? 0) / 10_000;
  const collections = sales * (value.collectionPerSaleCents ?? 0);
  const refunds = sales * (value.refundPerSaleCents ?? 0);
  const directCosts = sales * (value.directCostPerSaleCents ?? 0);
  const fixedCommission = sales * (value.commission?.fixedPerSaleCents ?? 0);
  const percentCommission = collections * (value.commission?.collectionsPercentBps ?? 0) / 10_000;
  const advertisingSpend = 90 * (value.adSpendPerDayCents ?? 0);
  const bonus = Math.max(value.commission?.goalBonusCents ?? 0, value.commission?.stretchBonusCents ?? 0);
  const candidates = [leads, sales, collections, refunds, directCosts, fixedCommission, percentCommission, advertisingSpend, collections + refunds + directCosts + fixedCommission + percentCommission + advertisingSpend + bonus];
  if (candidates.some((candidate) => !Number.isSafeInteger(Math.round(candidate)))) context.addIssue({ code: "custom", message: "scenario exceeds safe integer arithmetic" });
});

export const commercialPlanningInput = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  horizons: z.tuple([z.literal(30), z.literal(60), z.literal(90)]),
  scenario: scenarioInput,
}).strict();

export const commercialPlanningRouter = router({
  overview: permittedProcedure(["*"])
    .input(commercialPlanningInput)
    .query(({ input }) => getCommercialPlanning({ currency: input.currency, scenario: input.scenario })),
});
