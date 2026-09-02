"use client";

import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";

export function useLeadActivity(leadId: string, enabled: boolean) {
  return useQuery({
    ...trpc.leads.activity.queryOptions({ id: leadId }),
    enabled,
  });
}
