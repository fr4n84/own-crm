"use client"

import * as React from "react"

import { isNavigationItemActive, NavMain } from "@crm-fran/ui/components/nav-main"
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
import { CircleAlertIcon, HouseIcon, ChartBarIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon, CameraIcon, FileTextIcon, DatabaseIcon, FileChartColumnIcon, FileIcon, CommandIcon, MessageSquareIcon, ListChecksIcon, BadgeEuroIcon, GoalIcon, ChartSplineIcon, UsersIcon, HandshakeIcon, MessageCircleIcon, LightbulbIcon, MailIcon } from "lucide-react"
import { usePermissions, useRole } from "@crm-fran/ui/permissions"
import type { Permission } from "@crm-fran/db/schema/auth"
import {
  canAccessNavigationItem,
  canViewConfiguredNavigationItem,
  presentNavigationForRole,
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

const SIDEBAR_NAVIGATION_GROUPS = [
  {
    label: "Operación",
    itemIds: ["general-leads", "vsl-leads", "personal-leads", "whatsapp", "closer-sales", "alerts", "agendas", "calendar"],
  },
  {
    label: "Análisis",
    itemIds: ["dashboard", "next-best-action", "commercial-observatory", "profitability", "personal-statistics"],
  },
  {
    label: "Administración",
    itemIds: ["decision-center", "users-access", "email-marketing"],
  },
] as const

export function getSidebarNavigation<T extends PrimaryNavigationItem>(
  items: readonly T[],
  roleId: string | null | undefined,
  permissions: readonly Permission[],
  navigationVisibility?: NavigationVisibilityConfiguration,
) {
  const visible = presentNavigationForRole(
    items.filter((item) => canViewConfiguredNavigationItem(item, roleId, permissions, navigationVisibility)),
    roleId,
  )
  const messages = visible.find((item) => item.id === "messages")
  const groups = SIDEBAR_NAVIGATION_GROUPS.map((group) => ({
    label: group.label,
    items: visible.filter((item) => (group.itemIds as readonly string[]).includes(item.id)),
  })).filter((group) => group.items.length > 0)
  return { groups, messages }
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
  "email-marketing": <MailIcon />,
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
  onAccount,
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
  onAccount?: () => void
  onSignOut?: () => void
  navigationVisibility?: NavigationVisibilityConfiguration
}) {
  const permissions = usePermissions()
  const role = useRole()
  const navigation = getSidebarNavigation(data.navMain, role?.id, permissions, navigationVisibility)
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
      <SidebarContent className="gap-1 py-1">
        {navigation.groups.map((group) => (
          <NavMain
            key={group.label}
            label={group.label}
            items={group.items.map((item) => item.url === "/observatorio-comercial" ? { ...item, url: observatoryNavigationUrl(permissions) } : item)}
            LinkComponent={LinkComponent}
            currentPathname={currentPathname}
          />
        ))}
        {/* <NavDocuments items={data.documents} /> */}
      </SidebarContent>
      {user ? <SidebarFooter>
        <SidebarMenu>
          {navigation.messages ? <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={navigation.messages.title}
              render={<LinkComponent href={navigation.messages.url} />}
              isActive={isNavigationItemActive(currentPathname, navigation.messages.url)}
              className="text-sm"
            >
              {navigation.messages.icon}<span>{navigation.messages.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem> : null}
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sugerencias" render={<LinkComponent href="/sugerencias" />} className="text-sm">
              <LightbulbIcon /><span>Sugerencias</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} onSignOut={onSignOut} onAccount={onAccount} />
      </SidebarFooter> : null}
    </Sidebar>
  )
}
