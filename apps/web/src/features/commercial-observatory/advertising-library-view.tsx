"use client";

import { MegaphoneIcon, TelescopeIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { CompetitorAdLibraryPanel } from "./competitor-ad-library-panel";
import { MarketingLibraryPanel } from "./marketing-library-panel";

export function AdvertisingLibraryView() {
  const { permissions } = usePermissionState();
  const isAdmin = permissions.includes("*");

  return (
    <Tabs defaultValue="competitors" className="gap-4">
      <TabsList aria-label="Áreas de la biblioteca publicitaria">
        <TabsTrigger value="competitors">
          <TelescopeIcon data-icon="inline-start" aria-hidden="true" />
          Competencia
        </TabsTrigger>
        {isAdmin ? (
          <TabsTrigger value="own-library">
            <MegaphoneIcon data-icon="inline-start" aria-hidden="true" />
            Tus anuncios
          </TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="competitors">
        <CompetitorAdLibraryPanel canConfigure={isAdmin} />
      </TabsContent>
      {isAdmin ? (
        <TabsContent value="own-library">
          <MarketingLibraryPanel />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
