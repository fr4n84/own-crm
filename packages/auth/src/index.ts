import { createDb } from "@crm-fran/db";
import * as schema from "@crm-fran/db/schema/auth";
import { env } from "@crm-fran/env/server";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { userRoleHooks } from "./role-policy";
import { USER_ACCESS_STATUS } from "@crm-fran/db/schema/auth";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    databaseHooks: {
      user: userRoleHooks,
      session: {
        create: {
          before: async (session, context) => {
            if (!context) throw new APIError("FORBIDDEN", { message: "Tu cuenta está pendiente de aprobación" });
            const currentUser = await context.context.internalAdapter.findUserById(session.userId);
            const accessStatus = currentUser && "accessStatus" in currentUser ? currentUser.accessStatus : undefined;
            if (accessStatus !== USER_ACCESS_STATUS.ACTIVE) {
              throw new APIError("FORBIDDEN", { message: accessStatus === USER_ACCESS_STATUS.DISABLED ? "Tu acceso está desactivado" : "Tu cuenta está pendiente de aprobación" });
            }
          },
          after: async (createdSession, context) => {
            if (!context) return;
            const currentUser = await context.context.internalAdapter.findUserById(createdSession.userId);
            const accessStatus = currentUser && "accessStatus" in currentUser ? currentUser.accessStatus : undefined;
            if (accessStatus !== USER_ACCESS_STATUS.ACTIVE) {
              await context.context.internalAdapter.deleteSession(createdSession.token);
              throw new APIError("FORBIDDEN", { message: accessStatus === USER_ACCESS_STATUS.DISABLED ? "Tu acceso está desactivado" : "Tu cuenta está pendiente de aprobación" });
            }
          },
        },
      },
    },
    user: {
      additionalFields: {
        roleId: {
          type: "string",
          input: true,
          required: true,
          defaultValue: "role-caller",
        },
        accessStatus: {
          type: "string",
          input: false,
          required: false,
          defaultValue: USER_ACCESS_STATUS.PENDING,
        },
        leadActive: {
          type: "string",
          input: false,
        },
        scoring: {
          type: "number",
          input: false,
        },
      },
    },
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  });
}

export const auth = createAuth();
