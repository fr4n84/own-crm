import { createContext } from "@crm-fran/api/context";
import { assertDashboardAccess } from "@crm-fran/api/dashboard/access";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";


export default async function DashboardPage() {
  const context = await createContext({
    headers: await headers(),
  });

  if (!context.session) {
    redirect("/login");
  }

  try {
    await assertDashboardAccess(context.role?.id, context.permissions);
  } catch {
    redirect("/perfil");
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <Dashboard />
    </div>
  );
}
