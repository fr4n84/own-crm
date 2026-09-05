export function formatSalePaymentPlan(record: {
  paymentMethod: "fullpay" | "financed" | null;
  financingProvider: string | null;
  installmentMonths: number | null;
}) {
  if (record.paymentMethod === "fullpay") return "Fullpay";
  if (record.paymentMethod === "financed") {
    return `Financiada · ${record.financingProvider ?? "Sin financiera"} · ${record.installmentMonths ?? "?"} meses`;
  }
  return "Sin clasificar";
}
