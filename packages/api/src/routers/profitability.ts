import { z } from "zod";

import { profitabilityService } from "../profitability/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, "Fecha inválida");

const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));
const isoCurrency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((value) => supportedCurrencies.has(value), "Moneda ISO-4217 no válida");
const zonedDateTime = z
  .string()
  .datetime({ offset: true })
  .refine((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value), "La fecha debe incluir zona horaria");
const integerCents = z.number().int().positive().max(2_147_483_647);

export const profitabilityOverviewInput = z
  .object({ from: calendarDay, to: calendarDay, currency: isoCurrency.default("EUR") })
  .refine((value) => value.from <= value.to, {
    message: "El intervalo está invertido",
  });

export const profitabilitySpendInput = z
  .object({
    id: z.string().min(1).optional(),
    source: z.string().trim().min(1).max(120),
    campaign: z.string().trim().min(1).max(200),
    periodStart: calendarDay,
    periodEnd: calendarDay,
    spendEuros: z.number().positive().max(21_000_000),
    referenceSaleValueEuros: z.number().positive().max(21_000_000),
    currency: isoCurrency.default("EUR"),
  })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "El periodo está invertido",
  });

const financialKind = z.enum([
  "contracted_sale",
  "discount",
  "payment_received",
  "refund",
  "chargeback",
  "commission",
  "cost",
]);

export const recordFinancialEventInput = z.object({
  leadId: z.string().min(1),
  kind: financialKind,
  amountCents: integerCents,
  currency: isoCurrency,
  occurredAt: zonedDateTime,
  idempotencyKey: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2_000).optional(),
  externalReference: z.string().trim().max(300).optional(),
});

export const reverseFinancialEventInput = z.object({
  leadId: z.string().min(1),
  eventId: z.string().min(1),
  occurredAt: zonedDateTime,
  idempotencyKey: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2_000).optional(),
});

export const attributionLeadSearchInput = z.object({
  query: z.string().trim().max(120).default(""),
  limit: z.number().int().min(1).max(50).default(25),
});

const startOfDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
const endOfDay = (value: string) => new Date(`${value}T23:59:59.999Z`);
const admin = permittedProcedure(["*"]);

export const profitabilityRouter = router({
  attributionLeads: admin
    .input(attributionLeadSearchInput)
    .query(({ input }) => profitabilityService.searchAttributionLeads(input)),
  overview: admin
    .input(profitabilityOverviewInput)
    .query(({ input }) => profitabilityService.overview({ from: startOfDay(input.from), to: endOfDay(input.to), currency: input.currency })),
  saveSpend: admin
    .input(profitabilitySpendInput)
    .mutation(({ ctx, input }) => profitabilityService.saveSpend({
      id: input.id,
      source: input.source,
      campaign: input.campaign,
      periodStart: startOfDay(input.periodStart),
      periodEnd: endOfDay(input.periodEnd),
      spendCents: Math.round(input.spendEuros * 100),
      referenceSaleValueCents: Math.round(input.referenceSaleValueEuros * 100),
      currency: input.currency,
      actorId: ctx.session.user.id,
    })),
  deleteSpend: admin
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => profitabilityService.deleteSpend(input.id)),
  listFinancialLedger: admin
    .input(z.object({ leadId: z.string().min(1) }))
    .query(({ input }) => profitabilityService.listFinancialLedger(input.leadId)),
  recordFinancialEvent: admin
    .input(recordFinancialEventInput)
    .mutation(({ ctx, input }) => profitabilityService.recordFinancialEvent({
      ...input,
      occurredAt: new Date(input.occurredAt),
      actorId: ctx.session.user.id,
    })),
  reverseFinancialEvent: admin
    .input(reverseFinancialEventInput)
    .mutation(({ ctx, input }) => profitabilityService.reverseFinancialEvent({
      ...input,
      occurredAt: new Date(input.occurredAt),
      actorId: ctx.session.user.id,
    })),
});
