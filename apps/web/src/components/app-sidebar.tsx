"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { AppSidebar as SharedAppSidebar } from "@crm-fran/ui/components/app-sidebar"
import { authClient } from "@/lib/auth-client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { usePermissionState } from "@crm-fran/ui/permissions"

import { trpc } from "@/utils/trpc"

export function AppSidebar(props: React.ComponentProps<typeof SharedAppSidebar>) {
    const pathname = usePathname()
    const router = useRouter()

    const { data: session } = authClient.useSession()
    const permissionState = usePermissionState()
    const navigationVisibility = useQuery({
        ...trpc.users.navigationVisibility.queryOptions(),
        enabled: permissionState.isLoaded && Boolean(permissionState.role),
        retry: false,
    })

    const handleSignOut = async () => {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    router.push("/login")
                }
            }
        })
    }

    const currentUser = session?.user ? {
        name: session.user.name,
        email: session.user.email,
        avatar: session.user.image ?? "",
    } : undefined

    return (
        <SharedAppSidebar
            LinkComponent={Link}
            currentPathname={pathname}
            user={currentUser}
            onSignOut={handleSignOut}
            navigationVisibility={navigationVisibility.data?.configured ? { roleIdsByModule: navigationVisibility.data.roleIdsByModule } : undefined}
            {...props}
        />
    )
}
