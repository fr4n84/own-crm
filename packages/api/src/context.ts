import { db } from "@crm-fran/db";
import { auth } from "@crm-fran/auth";
import type { NextRequest } from "next/server";
import type { ResolvedRole } from "@crm-fran/db/schema/auth";

export async function createContext(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  const obj = {
    session: null,
    role: null,
    permissions: [],
  };

  if (!session) {
    return obj;
  }

  if (!session.user.roleId) {
    return {
      ...obj,
      session,
    };
  }

  const role = (await db.query.roles.findFirst({
    where: (roles, { eq }) => eq(roles.id, session.user.roleId),
  })) as ResolvedRole | null;

  return {
    ...obj,
    role,
    session,
    permissions: role?.permissions ?? [],
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
