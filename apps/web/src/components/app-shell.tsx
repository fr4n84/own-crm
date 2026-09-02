"use client";

import { usePathname } from "next/navigation";

import { SiteHeader } from "@crm-fran/ui/components/site-header";
import { SidebarInset, SidebarProvider } from "@crm-fran/ui/components/sidebar";

import { ActiveTitle } from "@/components/active-title";
import { AppSidebar } from "@/components/app-sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { AlertButton } from "@/features/alerts/alert-button";

export function isPublicAuthPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isPublicAuthPath(pathname)) return children;

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader toggle={<ModeToggle />} alertButton={<AlertButton />}>
          <ActiveTitle />
        </SiteHeader>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
