import type { ReactNode } from "react";

import { CommercialObservatoryNavigation } from "@/features/commercial-observatory/commercial-observatory-navigation";

export default function CommercialObservatoryLayout({ children }: { children: ReactNode }) {
  return (
    <main className="commercial-observatory-arc-theme dashboard-arc-theme flex min-h-full flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Observatorio comercial</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Analiza patrones, riesgos y pruebas controladas sin automatizar decisiones comerciales.
        </p>
        <CommercialObservatoryNavigation />
      </header>
      {children}
    </main>
  );
}
