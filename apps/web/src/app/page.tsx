import { auth } from "@crm-fran/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";


export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <Dashboard />
    </div>
  );
}
