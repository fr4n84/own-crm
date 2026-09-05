"use client";
import { ConversionFunnel } from "@/features/dashboard/conversion-funnel";
import { QualityControls } from "@/features/dashboard/quality-controls";

export default function Dashboard() {
  return (
    <div className="dashboard-arc-theme flex min-h-full flex-col gap-4 bg-background py-4 text-foreground md:gap-5 md:py-5">
      <ConversionFunnel />
      <QualityControls />
    </div>
  );
}
