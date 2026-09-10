"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@crm-fran/ui/components/popover";

import { trpc } from "@/utils/trpc";
import {
  TEAM_PRESENCE_POLL_INTERVAL_MS,
  TeamPresenceContent,
  TeamPresenceTrigger,
  mapPathToPresenceCategory,
  shouldAttemptHeartbeat,
} from "./team-presence-view";

export function TeamPresence() {
  const category = mapPathToPresenceCategory(usePathname());
  const list = useQuery({
    ...trpc.teamPresence.list.queryOptions(),
    refetchInterval: TEAM_PRESENCE_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const { mutate } = useMutation({ ...trpc.teamPresence.heartbeat.mutationOptions(), retry: false });

  const lastAttemptAtMs = useRef<number | null>(null);
  const categoryRef = useRef(category);
  const mutateRef = useRef(mutate);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);
  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);
  useEffect(() => {
    const sendHeartbeat = () => {
      const nowMs = Date.now();
      if (!shouldAttemptHeartbeat({ visibility: document.visibilityState, nowMs, lastAttemptAtMs: lastAttemptAtMs.current })) return;
      lastAttemptAtMs.current = nowMs;
      mutateRef.current({ category: categoryRef.current });
    };
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, TEAM_PRESENCE_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", sendHeartbeat);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", sendHeartbeat);
    };
  }, []);

  const members = list.data ?? [];
  const onlineCount = members.filter((member) => member.status === "online").length;
  const state = list.isPending ? "loading" : list.isError ? "error" : "ready";
  return (
    <Popover>
      <PopoverTrigger render={<TeamPresenceTrigger onlineCount={onlineCount} />} />
      <PopoverContent align="end">
        <PopoverHeader>
          <PopoverTitle>Equipo</PopoverTitle>
          <PopoverDescription>Estado aproximado y categoría general. No muestra páginas ni registros concretos.</PopoverDescription>
        </PopoverHeader>
        <TeamPresenceContent state={state} members={members} />
      </PopoverContent>
    </Popover>
  );
}
