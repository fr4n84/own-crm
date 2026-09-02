export type SaleFinancialValues = {
  saleAmountCents: number;
  amountPaidCents: number;
  currency: string;
  soldAt: Date;
};

export type CurrentSaleFinancialValues = SaleFinancialValues & {
  contractedSaleEventId: string | null;
  paymentReceivedEventId: string | null;
};

export function buildSaleFinancialPlan(
  current: CurrentSaleFinancialValues | null,
  next: SaleFinancialValues,
) {
  const contractedChanged = !current
    || current.saleAmountCents !== next.saleAmountCents
    || current.currency !== next.currency
    || current.soldAt.getTime() !== next.soldAt.getTime();
  const paymentChanged = contractedChanged
    || current.amountPaidCents !== next.amountPaidCents;

  return {
    reverseContractedSaleEventId:
      contractedChanged ? current?.contractedSaleEventId ?? null : null,
    reversePaymentReceivedEventId:
      paymentChanged ? current?.paymentReceivedEventId ?? null : null,
    createContractedSale: contractedChanged,
    createPaymentReceived: paymentChanged && next.amountPaidCents > 0,
  };
}
