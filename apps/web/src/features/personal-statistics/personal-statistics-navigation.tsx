"use client";

import { ChartNoAxesCombinedIcon, TrophyIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";

const PERSONAL_STATISTICS_ROUTE = "/estadisticas-personales";
const RANKINGS_ROUTE = "/estadisticas-personales/rankings";

export function PersonalStatisticsNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = pathname.startsWith(RANKINGS_ROUTE) ? "rankings" : "statistics";

  return (
    <Tabs value={activeTab} onValueChange={(value) => router.push(value === "rankings" ? RANKINGS_ROUTE : PERSONAL_STATISTICS_ROUTE)} className="w-full gap-0">
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
  );
}
