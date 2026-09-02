import { Separator } from "@crm-fran/ui/components/separator"
import { SidebarTrigger } from "@crm-fran/ui/components/sidebar"

export function SiteHeader({
  children,
  toggle,
  alertButton,
}: {
  children?: React.ReactNode;
  toggle?: React.ReactNode;
  alertButton?: React.ReactNode;
}) {
  return (
    <header className="flex h-(--header-height) min-w-0 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex min-w-0 flex-1 items-center gap-1 px-3 sm:px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <h1 className="min-w-0 truncate text-sm font-medium sm:text-base">{children}</h1>
      </div>
      <div className="flex shrink-0 items-center px-2 sm:px-4 lg:px-6">
        {alertButton} {toggle}
      </div>
    </header>
  );
}
