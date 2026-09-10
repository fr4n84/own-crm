import { describe, expect, it } from "vitest";

import { describeReceivable } from "./receivable-label";

describe("receivable presentation", () => {
  it("distinguishes settled, upcoming, and overdue accounts", () => {
    expect(describeReceivable({ outstandingCents: 0, overdueCents: 0, nextDueOn: null })).toEqual({
      state: "Cobrado",
      detail: "Sin saldo pendiente",
      tone: "settled",
    });
    expect(describeReceivable({ outstandingCents: 8_000, overdueCents: 0, nextDueOn: "2026-10-15" })).toEqual({
      state: "Pendiente · 80,00 €",
      detail: "Próximo vencimiento · 15/10/2026",
      tone: "open",
    });
    expect(describeReceivable({ outstandingCents: 8_000, overdueCents: 3_000, nextDueOn: "2026-09-01" })).toEqual({
      state: "Atrasado · 30,00 €",
      detail: "Pendiente total · 80,00 €",
      tone: "overdue",
    });
  });
});
