"use client";
// Import trpc
import { trpc } from "@/utils/trpc";
// Import next functions
import { redirect } from "next/navigation";
// Import own components
import Loader from "@/components/loader";
import SignUpForm from "@/components/sign-up-form";
// Import React Hooks
import { useQuery } from "@tanstack/react-query";
// Import helper api
import { hasPermission } from "@crm-fran/api/permissions";

export default function SignUpPage() {
  const { data, isPending } = useQuery(trpc.createUser.queryOptions());

  if (isPending) {
    return <Loader />;
  }

 // if (!hasPermission(data?.permissions || [], ["users:create"])) {
 //   redirect("/login");
  //}

  return <SignUpForm />;
}
