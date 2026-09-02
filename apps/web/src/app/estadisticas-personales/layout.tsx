import type { ReactNode } from "react";

import { PersonalStatisticsNavigation } from "@/features/personal-statistics/personal-statistics-navigation";

export default function PersonalStatisticsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="dashboard-arc-theme flex min-h-full flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Estadísticas personales</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Analiza tu actividad y compárala con rankings construidos desde resultados reales.</p>
        <PersonalStatisticsNavigation />
      </header>
      {children}
    </main>
  );
}
