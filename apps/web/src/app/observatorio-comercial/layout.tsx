import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createContext } from "@crm-fran/api/context";
import { assertObservatoryAccess } from "@crm-fran/api/commercial-observatory/access";
import type { ReactNode } from "react";

import { CommercialObservatoryNavigation } from "@/features/commercial-observatory/commercial-observatory-navigation";

export default async function CommercialObservatoryLayout({ children }: { children: ReactNode }) {
  const ctx = await createContext({ headers: await headers() });
  if (!ctx.session) redirect("/login");
  try { await assertObservatoryAccess(ctx.role?.id, ctx.permissions); }
  catch { return <main className="p-6"><h1>Observatorio comercial no disponible</h1><p>No tienes acceso o no se pudo comprobar tu permiso. Contacta con administración.</p></main>; }
  return (
    <main className="commercial-observatory-arc-theme dashboard-arc-theme flex min-h-full flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Observatorio comercial</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Analiza patrones, riesgos y pruebas controladas sin automatizar decisiones comerciales.
        </p>
        <CommercialObservatoryNavigation />
      </header>
      {children}
    </main>
  );
}
