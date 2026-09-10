"use client";

import Link from "next/link";
import { Button } from "@crm-fran/ui/components/button";
import { useAppAccess } from "./app-access";
import { usePathname } from "next/navigation";

import { SiteHeader } from "@crm-fran/ui/components/site-header";
import { SidebarInset, SidebarProvider } from "@crm-fran/ui/components/sidebar";

import { ActiveTitle } from "@/components/active-title";
import { AppSidebar } from "@/components/app-sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { AlertButton } from "@/features/alerts/alert-button";
import { TeamPresence } from "@/features/team-presence/team-presence";

export function isPublicAuthPath(pathname: string) {
  return pathname === "/recuperar-contrasena" || pathname === "/login" || pathname.startsWith("/login/")
    || pathname === "/signup" || pathname.startsWith("/signup/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const access = useAppAccess();
  if (isPublicAuthPath(pathname)) return children;
  if (access.status === "loading") return <main className="p-6" role="status">Cargando tu espacio de trabajo…</main>;
  if (access.status === "error") return <main className="flex flex-col gap-3 p-6"><p role="alert">No se pudo cargar tu acceso. No se mostrará un menú incompleto.</p><Button onClick={access.retry}>Reintentar</Button></main>;
  if (access.status === "signed-out") return <main className="p-6"><Link href="/login">Iniciar sesión</Link></main>;
  if (access.status === "pending") return <main className="flex flex-col gap-3 p-6"><p role="status">Tu cuenta está pendiente de aprobación por un administrador.</p><Link href="/login">Iniciar sesión</Link></main>;
  if (access.status === "disabled") return <main className="flex flex-col gap-3 p-6"><p role="alert">Tu acceso está desactivado. Contacta con un administrador para solicitar su reactivación.</p><Link href="/login">Iniciar sesión</Link></main>;

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 80)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader toggle={<ModeToggle />} alertButton={<><TeamPresence /><AlertButton /></>}>
          <ActiveTitle />
        </SiteHeader>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
