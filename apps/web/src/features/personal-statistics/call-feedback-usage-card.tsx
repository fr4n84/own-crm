"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@crm-fran/ui/components/progress";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { usePermissionState } from "@crm-fran/ui/permissions/auth-context";

import { trpc } from "@/utils/trpc";

export function CallFeedbackUsageCard() {
  const { permissions } = usePermissionState();
  const isAdmin = permissions.includes("*");
  const usage = useQuery({
    ...trpc.leads.monthlyCallFeedbackUsage.queryOptions(),
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  const minutes = (usage.data?.processedDurationMs ?? 0) / 60_000;
  const referenceMinutes = usage.data?.referenceMinutes ?? 5_000;
  const progress = Math.min(100, (minutes / referenceMinutes) * 100);
  const spend = ((usage.data?.estimatedCostMicroUsd ?? 0) / 1_000_000).toLocaleString(
    "es-ES",
    { style: "currency", currency: "USD" },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uso mensual de feedback con IA</CardTitle>
        <CardDescription>
          Consumo informativo de las grabaciones procesadas durante el mes actual.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usage.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Progress value={progress}>
            <ProgressLabel>
              {minutes.toLocaleString("es-ES", { maximumFractionDigits: 1 })} de{" "}
              {referenceMinutes.toLocaleString("es-ES")} minutos · {spend}
            </ProgressLabel>
            <ProgressValue>{() => `${progress.toFixed(1)}%`}</ProgressValue>
          </Progress>
        )}
      </CardContent>
    </Card>
  );
}
