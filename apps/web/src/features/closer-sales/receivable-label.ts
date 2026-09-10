export type ReceivableOverview = {
  outstandingCents: number;
  overdueCents: number;
  nextDueOn: string | null;
};

export const formatReceivableMoney = (cents: number, currency = "EUR") => new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency,
}).format(cents / 100);

const formatDay = (day: string) => {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
};

export function describeReceivable(receivable: ReceivableOverview) {
  if (receivable.outstandingCents === 0) {
    return { state: "Cobrado", detail: "Sin saldo pendiente", tone: "settled" as const };
  }
  if (receivable.overdueCents > 0) {
    return {
      state: `Atrasado · ${formatReceivableMoney(receivable.overdueCents)}`,
      detail: `Pendiente total · ${formatReceivableMoney(receivable.outstandingCents)}`,
      tone: "overdue" as const,
    };
  }
  return {
    state: `Pendiente · ${formatReceivableMoney(receivable.outstandingCents)}`,
    detail: receivable.nextDueOn ? `Próximo vencimiento · ${formatDay(receivable.nextDueOn)}` : "Sin próximo vencimiento",
    tone: "open" as const,
  };
}
