"use client"

import * as React from "react"

import { NavMain } from "@crm-fran/ui/components/nav-main"
import { NavUser } from "@crm-fran/ui/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@crm-fran/ui/components/sidebar"
import { CircleAlertIcon, HouseIcon, ChartBarIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon, CameraIcon, FileTextIcon, DatabaseIcon, FileChartColumnIcon, FileIcon, CommandIcon, MessageSquareIcon, ListChecksIcon, BadgeEuroIcon, GoalIcon, ChartSplineIcon, UsersIcon, HandshakeIcon, MessageCircleIcon } from "lucide-react"
import { usePermissions, useRole } from "@crm-fran/ui/permissions"
import type { Permission } from "@crm-fran/db/schema/auth"
import {
  canAccessNavigationItem,
  canViewConfiguredNavigationItem,
  PRIMARY_NAVIGATION_ITEMS,
  type NavigationVisibilityConfiguration,
  type PrimaryNavigationItem,
} from "@crm-fran/ui/lib/navigation-policy"

export function canViewNavigationItem(
  item: { id?: string; globalOnly?: boolean; requiredPermission?: PrimaryNavigationItem["requiredPermission"] },
  permissions: readonly Permission[],
) {
  return canAccessNavigationItem(item, permissions)
}

export function observatoryNavigationUrl(permissions: readonly Permission[]) {
  return permissions.includes("*") ? "/observatorio-comercial" : "/observatorio-comercial/evidencia-comercial"
}

const NAVIGATION_ICONS: Record<PrimaryNavigationItem["id"], React.ReactNode> = {
  dashboard: <HouseIcon />,
  "decision-center": <GoalIcon />,
  "next-best-action": <ListChecksIcon />,
  "commercial-observatory": <ChartSplineIcon />,
  profitability: <BadgeEuroIcon />,
  "general-leads": <DatabaseIcon />,
  "vsl-leads": <CalendarDaysIcon />,
  "personal-leads": <ChartBarIcon />,
  whatsapp: <MessageCircleIcon />,
  "closer-sales": <HandshakeIcon />,
  alerts: <CircleAlertIcon />,
  agendas: <CalendarDaysIcon />,
  calendar: <CalendarDaysIcon />,
  messages: <MessageSquareIcon />,
  "personal-statistics": <ChartNoAxesCombinedIcon />,
  "users-access": <UsersIcon />,
}

const data = {
  navMain: PRIMARY_NAVIGATION_ITEMS.map((item) => ({
    ...item,
    icon: NAVIGATION_ICONS[item.id],
  })),
  navClouds: [
    {
      title: "Capture",
      icon: (
        <CameraIcon
        />
      ),
      isActive: true,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Proposal",
      icon: (
        <FileTextIcon
        />
      ),
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Prompts",
      icon: (
        <FileTextIcon
        />
      ),
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
  ],
  documents: [
    {
      name: "Data Library",
      url: "#",
      icon: (
        <DatabaseIcon
        />
      ),
    },
    {
      name: "Reports",
      url: "#",
      icon: (
        <FileChartColumnIcon
        />
      ),
    },
    {
      name: "Word Assistant",
      url: "#",
      icon: (
        <FileIcon
        />
      ),
    },
  ],
}
export function AppSidebar({
  LinkComponent = "a",
  currentPathname,
  user,
  onSignOut,
  navigationVisibility,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  LinkComponent?: React.ComponentType<any> | string
  currentPathname?: string
  user?: {
    name: string
    email: string
    avatar: string
  }
  onSignOut?: () => void
  navigationVisibility?: NavigationVisibilityConfiguration
}) {
  const permissions = usePermissions()
  const role = useRole()
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<LinkComponent href="#" />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Aurea</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={data.navMain
            .filter((item) => canViewConfiguredNavigationItem(item, role?.id, permissions, navigationVisibility))
            .map((item) => item.url === "/observatorio-comercial" ? { ...item, url: observatoryNavigationUrl(permissions) } : item)}
          LinkComponent={LinkComponent}
          currentPathname={currentPathname}
        />
        {/* <NavDocuments items={data.documents} /> */}
      </SidebarContent>
      {user ? <SidebarFooter>
        <NavUser user={user} onSignOut={onSignOut} />
      </SidebarFooter> : null}
    </Sidebar>
  )
}
