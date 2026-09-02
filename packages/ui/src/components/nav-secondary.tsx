"use client"

import * as React from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@crm-fran/ui/components/sidebar"

export function NavSecondary({
  items,
  LinkComponent = "a",
  currentPathname,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: React.ReactNode
  }[]
  LinkComponent?: React.ComponentType<any> | string
  currentPathname?: string
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              currentPathname === item.url ||
              (item.url !== "/" && currentPathname?.startsWith(item.url))
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  render={<LinkComponent href={item.url} />}
                  isActive={isActive}
                  className={isActive ? "bg-blue-100 text-blue-700 font-bold" : ""}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
