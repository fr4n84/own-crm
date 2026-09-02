import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../apps/web/.env") });

const { db } = await import("../..");
const { roles } = await import("../../schema");

await db
  .insert(roles)
  .values([
    {
      id: "role-caller",
      name: "Caller",
      permissions: ["leads:*","alerts:*", "users:read"],
    },
    {
      id: "role-closer",
      name: "Closer",
      permissions: ["leads:*", "alerts:*", "sales:*"],
    },
    {
      id: "role-caller-closer",
      name: "Caller + Closer",
      permissions: ["leads:*", "alerts:*", "users:read", "sales:*"],
    },
    {
      id: "role-admin",
      name: "Admin",
      permissions: ["*"],
    },
  ])
  .onConflictDoNothing();
