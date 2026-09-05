"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ResolvedPermissionProvider } from "@crm-fran/ui/permissions";
import type { NavigationVisibilityConfiguration } from "@crm-fran/ui/lib/navigation-policy";
import { authClient } from "@/lib/auth-client";
import { trpc, trpcClient } from "@/utils/trpc";

type AppAccess = { status: "loading" | "ready" | "signed-out" | "error"; navigation?: NavigationVisibilityConfiguration; retry: () => void };
const AccessContext = createContext<AppAccess>({ status: "loading", retry: () => {} });
export const useAppAccess = () => useContext(AccessContext);
export function AppAccessProvider({ children }: { children: React.ReactNode }) {
 const session = authClient.useSession();
 return <IdentityAccess key={session.data?.user.id ?? "signed-out"} session={session}>{children}</IdentityAccess>;
}
function IdentityAccess({session,children}:{session:ReturnType<typeof authClient.useSession>;children:React.ReactNode}) {
 const client=useQueryClient();
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  void client.cancelQueries();
  client.clear();
  setReady(true);
 },[client]);
 // The old identity is unmounted before ANY new identity queries or private descendants.
 if(!ready) return <div role="status" className="p-6">Cargando acceso…</div>;
 return <LoadAccess session={session}>{children}</LoadAccess>;
}
function LoadAccess({session,children}:{session:ReturnType<typeof authClient.useSession>;children:React.ReactNode}) {
 const identity = session.data?.user.id;
 const access = useQuery({
   queryKey: [...trpc.auth.getMyAccess.queryKey(), identity ?? null],
   queryFn: () => trpcClient.auth.getMyAccess.query(),
   enabled: Boolean(identity) && !session.isPending,
   retry: false,
   staleTime: 0,
 });
 // Identity-keyed queries never reuse another user's permissions on account switches.
 const status: AppAccess["status"] = session.error ? "error" : session.isPending ? "loading" : !identity ? "signed-out" : access.isError ? "error" : access.isPending ? "loading" : "ready";
 const data = status === "ready" ? access.data : undefined;
 return <AccessContext.Provider value={{ status, navigation: data?.navigation.configured ? { roleIdsByModule: data.navigation.roleIdsByModule } : undefined, retry: () => { void session.refetch(); void access.refetch(); } }}>
  <ResolvedPermissionProvider value={{ role: data?.role ?? null, permissions: data?.permissions ?? [], isLoaded: status !== "loading", isLoading: status === "loading", error: status === "error" ? new Error("Access unavailable") : null }}>{children}</ResolvedPermissionProvider>
 </AccessContext.Provider>;
}
