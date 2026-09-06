import { TRPCError } from "@trpc/server";

export function assertActiveAccount(user: object) {
  if ("accessStatus" in user && user.accessStatus !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account approval required" });
  }
}
