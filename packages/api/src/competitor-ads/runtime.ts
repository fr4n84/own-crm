import { env } from "@crm-fran/env/server";

import { createMetaAdLibraryClient } from "./meta-client";
import { competitorAdRepository } from "./repository";
import { createCompetitorAdSyncService } from "./sync-service";

export function createCompetitorAdSyncRuntime() {
  if (
    env.COMPETITOR_AD_LIBRARY_PROVIDER !== "meta"
    || !env.COMPETITOR_AD_META_ACCESS_TOKEN
    || !env.COMPETITOR_AD_META_GRAPH_API_VERSION
  ) return null;

  const service = createCompetitorAdSyncService({
    repository: competitorAdRepository,
    client: createMetaAdLibraryClient({
      accessToken: env.COMPETITOR_AD_META_ACCESS_TOKEN,
      graphApiVersion: env.COMPETITOR_AD_META_GRAPH_API_VERSION,
      requestTimeoutMs: env.COMPETITOR_AD_REQUEST_TIMEOUT_MS,
    }),
    maxPages: env.COMPETITOR_AD_MAX_PAGES,
  });
  return {
    run(now = new Date()) {
      return service.syncDaily({ now });
    },
  };
}
