"use client";

import {
  BookOpenCheckIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@crm-fran/ui/components/tabs";

const ASK_CRM_ROUTE = "/centro-de-decisiones/preguntale-al-crm";
const DECISIONS_ROUTE = "/centro-de-decisiones";
const PLAYBOOKS_ROUTE = "/centro-de-decisiones/playbooks";

export function DecisionCenterNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = pathname.startsWith(ASK_CRM_ROUTE)
    ? "ask-crm"
    : pathname.startsWith(PLAYBOOKS_ROUTE)
      ? "playbooks"
      : "decisions";

  const navigate = (value: string) => {
    if (value === "ask-crm") {
      router.push(ASK_CRM_ROUTE);
      return;
    }
    if (value === "playbooks") {
      router.push(PLAYBOOKS_ROUTE);
      return;
    }
    router.push(DECISIONS_ROUTE);
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={navigate}
      className="w-full gap-0"
    >
      <TabsList
        aria-label="Secciones del centro de decisiones"
        className="flex h-auto w-full max-w-full flex-nowrap items-stretch justify-start gap-1 rounded-lg border bg-background p-1 sm:w-fit"
      >
        <TabsTrigger
          value="decisions"
          className="h-12! min-h-12! flex-none rounded-md px-4 py-2 text-sm font-medium data-active:bg-accent data-active:text-accent-foreground after:hidden"
        >
          <ListChecksIcon data-icon="inline-start" aria-hidden="true" />
          Decisiones
        </TabsTrigger>
        <TabsTrigger
          value="ask-crm"
          className="h-12! min-h-12! flex-none rounded-md px-4 py-2 text-sm font-medium data-active:bg-accent data-active:text-accent-foreground after:hidden"
        >
          <MessageCircleQuestionIcon data-icon="inline-start" aria-hidden="true" />
          Pregúntale al CRM
        </TabsTrigger>
        <TabsTrigger
          value="playbooks"
          className="h-12! min-h-12! flex-none rounded-md px-4 py-2 text-sm font-medium data-active:bg-accent data-active:text-accent-foreground after:hidden"
        >
          <BookOpenCheckIcon data-icon="inline-start" aria-hidden="true" />
          Playbooks
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
