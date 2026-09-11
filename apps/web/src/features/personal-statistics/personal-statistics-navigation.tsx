"use client";

import { BrainCircuitIcon, ChartNoAxesCombinedIcon, TrophyIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@crm-fran/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";

const PERSONAL_STATISTICS_ROUTE = "/estadisticas-personales";
const RANKINGS_ROUTE = "/estadisticas-personales/rankings";

export function PersonalStatisticsNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = pathname.startsWith(RANKINGS_ROUTE) ? "rankings" : "statistics";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={activeTab} onValueChange={(value) => router.push(value === "rankings" ? RANKINGS_ROUTE : PERSONAL_STATISTICS_ROUTE)} className="w-fit gap-0">
        <TabsList aria-label="Secciones de estadísticas personales" className="flex h-auto w-fit max-w-full flex-nowrap items-stretch justify-start gap-1 rounded-lg border bg-background p-1">
          <TabsTrigger value="statistics" className="h-12! min-h-12! flex-none rounded-md px-4 py-2 text-sm font-medium data-active:bg-accent data-active:text-accent-foreground after:hidden">
            <ChartNoAxesCombinedIcon data-icon="inline-start" aria-hidden="true" />
            Estadísticas
          </TabsTrigger>
          <TabsTrigger value="rankings" className="h-12! min-h-12! flex-none rounded-md px-4 py-2 text-sm font-medium data-active:bg-accent data-active:text-accent-foreground after:hidden">
            <TrophyIcon data-icon="inline-start" aria-hidden="true" />
            Rankings
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {activeTab === "statistics" && (
        <Button variant="outline" render={<a href="#coaching-personal" />}>
          <BrainCircuitIcon data-icon="inline-start" aria-hidden="true" />
          Coaching con IA
        </Button>
      )}
    </div>
  );
}