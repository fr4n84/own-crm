import { auth } from "@crm-fran/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/features/profile/password-form";
export default async function ProfilePage() {
 const session=await auth.api.getSession({headers:await headers()}); if(!session) redirect("/login");
 return <main className="flex flex-col gap-5 p-6"><h1 className="text-2xl font-semibold">Mi perfil</h1><p>{session.user.name} · {session.user.email}</p><h2 className="text-lg font-medium">Cambiar contraseña</h2><PasswordForm /></main>;
}
