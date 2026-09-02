"use client"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@crm-fran/ui/components/sidebar"

export function isNavigationItemActive(currentPathname: string | undefined, itemUrl: string) {
  if (!currentPathname) return false
  if (currentPathname === itemUrl) return true
  return itemUrl !== "/" && currentPathname.startsWith(`${itemUrl}/`)
}

export function NavMain({
  items,
  LinkComponent = "a",
  currentPathname,
}: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
  }[]
  LinkComponent?: React.ComponentType<any> | string
  currentPathname?: string
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        {/* <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <CirclePlusIcon
              />
              <span>Quick Create</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <MailIcon
              />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu> */}
        <SidebarMenu>
          {items.map((item) => {
            const isActive = isNavigationItemActive(currentPathname, item.url)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  render={<LinkComponent href={item.url} />}
                  isActive={isActive}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false)
                  }}
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
