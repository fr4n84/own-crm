import { createContext } from "@crm-fran/api/context";
import { appRouter } from "@crm-fran/api/routers/index";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

import {
  createRequestId,
  reportServerError,
  shouldReportServerError,
} from "@/lib/server-observability";

async function handler(req: NextRequest) {
  const requestId = createRequestId(req.headers.get("x-request-id"));
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError: ({ error, path, type }) => {
      if (!shouldReportServerError(error.code)) return;
      reportServerError({
        requestId,
        operation: `trpc.${type.toLowerCase()}`,
        error,
        context: { path: path ?? "unknown" },
      });
    },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}
export { handler as GET, handler as POST };
