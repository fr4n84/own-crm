import { CloserSalesView } from "@/features/closer-sales/closer-sales-view";
import { Can } from "@crm-fran/ui/permissions/can";

export default function CloserSalesPage() {
  return <Can permission="sales:read"><CloserSalesView /></Can>;
}
