"use client";
import { ChartAreaInteractive } from "@crm-fran/ui/components/chart-area-interactive";
import { ConversionFunnel } from "@/features/dashboard/conversion-funnel";
import { DashboardSummaryCards } from "@/features/dashboard/dashboard-summary-cards";
import { QualityControls } from "@/features/dashboard/quality-controls";

export default function Dashboard() {
  return (
    <div className="dashboard-arc-theme flex min-h-full flex-col gap-4 bg-background py-4 text-foreground md:gap-5 md:py-5">
      <DashboardSummaryCards />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
      <ConversionFunnel />
      <QualityControls />
    </div>
  );
}
