import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    OPENAI_API_KEY: z.string().min(1),
    WHATSAPP_DELIVERY_PROVIDER: z.literal("disabled").default("disabled"),
    WHATSAPP_META_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_META_PHONE_NUMBER_ID: z.string().min(1).optional(),
    WHATSAPP_META_GRAPH_API_VERSION: z.string().min(1).max(32).optional(),
    COMPETITOR_AD_LIBRARY_PROVIDER: z.enum(["disabled", "meta"]).default("disabled"),
    COMPETITOR_AD_META_ACCESS_TOKEN: z.string().min(1).optional(),
    COMPETITOR_AD_META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).optional(),
    COMPETITOR_AD_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
    COMPETITOR_AD_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(10),
    COMPETITOR_AD_SYNC_SECRET: z.string().min(32).optional(),
    GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL: z.email().optional(),
    GOOGLE_WORKSPACE_PRIVATE_KEY: z.string().min(1).optional(),
    GOOGLE_WORKSPACE_DELEGATED_USER_EMAIL: z.email().optional(),
    GOOGLE_WORKSPACE_CALENDAR_ID: z.string().min(1).optional(),
    GOOGLE_WORKSPACE_SHARED_DRIVE_ID: z.string().min(1).optional(),
    CLOSER_MEET_SYNC_SECRET: z.string().min(32).optional(),
    CLOSER_MEET_TRANSCRIPT_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, "must be canonical base64 for 32 bytes").optional(),
    CLOSER_MEET_TRANSCRIPT_KEY_ID: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
    LEAD_PHONE_COUNTRY: z.enum(["ES"]).default("ES"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
