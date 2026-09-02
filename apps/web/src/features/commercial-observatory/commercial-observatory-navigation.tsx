"use client";

import {
  BrainCircuitIcon,
  CalculatorIcon,
  ChartSplineIcon,
  FileChartColumnIcon,
  FlaskConicalIcon,
  MessagesSquareIcon,
  MegaphoneIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { canAccessNavigationItem } from "@crm-fran/ui/lib/navigation-policy";
import { usePermissionState } from "@crm-fran/ui/permissions";

const OBSERVATORY_TABS = [
  { value: "observatory", label: "Observatorio", route: "/observatorio-comercial", permission: "*", icon: ChartSplineIcon },
  { value: "experiments", label: "Experimentos", route: "/observatorio-comercial/experimentos-comerciales", permission: "*", icon: FlaskConicalIcon },
  { value: "intelligence", label: "Inteligencia", route: "/observatorio-comercial/inteligencia", permission: "leads:read", icon: BrainCircuitIcon },
  { value: "evidence", label: "Evidencia", route: "/observatorio-comercial/evidencia-comercial", permission: "leads:read", icon: FileChartColumnIcon },
  { value: "feedback", label: "Feedback", route: "/observatorio-comercial/feedback", permission: "leads:read", icon: MessagesSquareIcon },
  { value: "marketing-library", label: "Biblioteca publicitaria", route: "/observatorio-comercial/biblioteca-publicitaria", permission: "*", icon: MegaphoneIcon },
  { value: "planning", label: "Planificación", route: "/observatorio-comercial/planificacion", permission: "*", icon: CalculatorIcon },
] as const satisfies readonly {
  value: string;
  label: string;
  route: string;
  permission: "*" | "leads:read";
  icon: typeof ChartSplineIcon;
}[];

export function commercialObservatoryTabsForPermissions(permissions: readonly string[]) {
  return OBSERVATORY_TABS.filter((tab) =>
    tab.permission === "*"
      ? permissions.includes("*")
      : canAccessNavigationItem({ requiredPermission: tab.permission }, permissions),
  );
}

export function CommercialObservatoryNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions } = usePermissionState();
  const tabs = commercialObservatoryTabsForPermissions(permissions);
  const activeTab = [...OBSERVATORY_TABS]
    .sort((left, right) => right.route.length - left.route.length)
    .find((tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`))?.value ?? "observatory";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        const destination = tabs.find((tab) => tab.value === value);
        if (destination) router.push(destination.route);
      }}
      className="w-full gap-0 pb-1"
    >
      <TabsList
        aria-label="Secciones del observatorio comercial"
        className="flex h-auto w-full max-w-full flex-wrap items-stretch justify-start gap-1 rounded-lg border bg-background p-1 sm:w-fit"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-12! min-h-12! min-w-32 flex-1 rounded-md px-4 py-2 text-sm font-medium data-active:bg-accent data-active:text-accent-foreground after:hidden"
            >
              <Icon data-icon="inline-start" aria-hidden="true" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
