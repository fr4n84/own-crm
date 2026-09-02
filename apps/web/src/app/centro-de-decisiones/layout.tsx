import type { ReactNode } from "react";

import { Badge } from "@crm-fran/ui/components/badge";

import { DecisionCenterNavigation } from "@/features/decision-center/decision-center-navigation";

export default function DecisionCenterLayout({ children }: { children: ReactNode }) {
  return (
    <main className="decision-center-arc-theme flex min-h-full flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Centro de decisiones</h1>
          <Badge variant="outline">Administración global</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Convierte la evidencia comercial en decisiones humanas, consultas seguras y seguimiento explicable.
        </p>
        <DecisionCenterNavigation />
      </header>
      {children}
    </main>
  );
}
