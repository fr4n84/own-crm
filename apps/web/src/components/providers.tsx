"use client";

import { isTRPCClientError } from "@trpc/client";
import { Toaster } from "@crm-fran/ui/components/sonner";
import { PermissionProvider } from "@crm-fran/ui/permissions";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient, trpcClient } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <PermissionProvider
          resolvePermissions={async () => {
            try {
              return await trpcClient.auth.getMyPermissions.query();
            } catch (err) {
              // UNAUTHORIZED is the expected state for logged-out users.
              // Resolve to a clean "no permissions" state instead of letting
              // the error bubble up to the provider's `error` field, which
              // would be misleading UX. Real failures (network, 5xx, etc.)
              // still propagate so `usePermissionState().error` is honest.
              if (isTRPCClientError(err) && err.data?.code === "UNAUTHORIZED") {
                return { role: null, permissions: [] };
              }
              throw err;
            }
          }}
        >
          {children}
        </PermissionProvider>
        <ReactQueryDevtools />
      </QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
