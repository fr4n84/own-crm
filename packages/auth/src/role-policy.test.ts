import { describe, expect, it } from "vitest";
import { userRoleHooks } from "./role-policy";

describe("public account roles", () => {
  for (const roleId of ["role-caller", "role-closer", "role-caller-closer"]) {
    it(`accepts ${roleId} on creation`, async () => {
      await expect(userRoleHooks.create.before({ roleId })).resolves.toMatchObject({ data: { roleId } });
    });
  }
  for (const roleId of ["role-admin", "unknown", "", null]) {
    it(`rejects ${roleId} on creation`, async () => {
      await expect(userRoleHooks.create.before({ roleId })).rejects.toMatchObject({ status: "BAD_REQUEST" });
    });
  }
  it("defaults omitted roles to caller", async () => {
    await expect(userRoleHooks.create.before({ name: "Caller" })).resolves.toMatchObject({ data: { roleId: "role-caller" } });
  });
  it("allows ordinary profile updates without changing roles", async () => {
    await expect(userRoleHooks.update.before({ name: "New name" })).resolves.toEqual({ data: { name: "New name" } });
  });
  for (const roleId of ["role-admin", "role-closer", "role-caller-closer", null]) {
    it(`rejects self-service role changes to ${roleId}`, async () => {
      await expect(userRoleHooks.update.before({ roleId })).rejects.toMatchObject({ status: "FORBIDDEN" });
    });
  }
});
