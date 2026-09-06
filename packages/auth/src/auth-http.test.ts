import { beforeEach, describe, expect, it, vi } from "vitest";
const memory = vi.hoisted(() => ({ user: [], session: [], account: [], verification: [] }));
vi.mock("@crm-fran/db", () => ({ createDb: () => ({}) }));
vi.mock("@crm-fran/env/server", () => ({ env: {
  CORS_ORIGIN: "http://localhost:3001", BETTER_AUTH_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "isolated-auth-test-secret-at-least-32-characters",
} }));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(memory) };
});
vi.mock("better-auth/next-js", () => ({ nextCookies: () => ({ id: "isolated-test" }) }));
import { auth } from "./index";

async function request(path: string, body: unknown, cookie?: string) {
  return auth.handler(new Request(`http://localhost:3001/api/auth/${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3001", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
}
const account = { name: "Test User", email: "test@example.com", password: "safe-test-password" };
async function activateAndSignIn(roleId = "role-caller") {
  const signup = await request("sign-up/email", { ...account, roleId });
  expect(signup.status).toBe(200);
  expect(await signup.json()).toMatchObject({ token: null, user: { accessStatus: "pending", roleId } });
  const storedUser = memory.user[0];
  if (!storedUser) throw new Error("Expected a registered account");
  Object.assign(storedUser, { accessStatus: "active", statusVersion: 2 });
  const signIn = await request("sign-in/email", { email: account.email, password: account.password });
  expect(signIn.status).toBe(200);
  return { storedUser, cookie: signIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
}
describe("configured Better Auth HTTP role boundaries (memory adapter)", () => {
  beforeEach(() => { for (const rows of Object.values(memory)) rows.length = 0; });
  for (const roleId of ["role-caller", "role-closer", "role-caller-closer"]) {
    it(`registers ${roleId} through the public endpoint`, async () => {
      const response = await request("sign-up/email", { ...account, roleId });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ token: null, user: { roleId, accessStatus: "pending" } });
      expect(memory.session).toHaveLength(0);
    });
  }
  for (const roleId of ["role-admin", "unknown"]) {
    it(`rejects forged signup role ${roleId}`, async () => {
      const response = await request("sign-up/email", { ...account, roleId });
      expect(response.status).toBe(400);
      expect(memory.user).toHaveLength(0);
    });
  }
  it("rejects update-user escalation while ordinary profile edits work", async () => {
    const { cookie } = await activateAndSignIn();
    expect(cookie).not.toBe("");
    expect((await request("update-user", { roleId: "role-admin" }, cookie)).status).toBe(403);
    expect((await request("update-user", { name: "Updated name" }, cookie)).status).toBe(200);
    expect(memory.user[0]).toMatchObject({ roleId: "role-caller", name: "Updated name" });
  });
  it("keeps existing admin profile edits working and reads current persisted roles", async () => {
    const { cookie, storedUser } = await activateAndSignIn();
    // Seed an existing administrator directly in the isolated adapter.
    Object.assign(storedUser, { roleId: "role-admin" });
    expect((await request("update-user", { name: "Updated admin" }, cookie)).status).toBe(200);
    expect(storedUser).toMatchObject({ roleId: "role-admin", name: "Updated admin" });
    const session = await auth.handler(new Request("http://localhost:3001/api/auth/get-session", { headers: { cookie } }));
    expect(await session.json()).toMatchObject({ user: { roleId: "role-admin" } });
  });
  it("keeps pending and disabled users out while active users can sign in", async () => {
    const signup = await request("sign-up/email", { ...account, roleId: "role-closer" });
    expect(signup.status).toBe(200);
    expect((await request("sign-in/email", { email: account.email, password: account.password })).status).toBe(403);
    const storedUser = memory.user[0];
    if (!storedUser) throw new Error("Expected a registered account");
    Object.assign(storedUser, { accessStatus: "active", statusVersion: 2 });
    expect((await request("sign-in/email", { email: account.email, password: account.password })).status).toBe(200);
    Object.assign(storedUser, { accessStatus: "disabled", statusVersion: 3 });
    expect((await request("sign-in/email", { email: account.email, password: account.password })).status).toBe(403);
  });
});

describe("configured password change", () => {
 beforeEach(() => { for(const rows of Object.values(memory)) rows.length=0; });
 it("requires current password and revokes other sessions", async () => {
  const { cookie }=await activateAndSignIn();
  await request("sign-in/email",{email:account.email,password:account.password});
  expect(memory.session.length).toBe(2);
  expect((await request("change-password",{currentPassword:"wrong",newPassword:"changed-safe-password",revokeOtherSessions:true},cookie)).status).not.toBe(200);
  expect((await request("change-password",{currentPassword:account.password,newPassword:"changed-safe-password",revokeOtherSessions:true},cookie)).status).toBe(200);
  expect(memory.session).toHaveLength(1);
  expect((await request("sign-in/email",{email:account.email,password:account.password})).status).not.toBe(200);
  expect((await request("sign-in/email",{email:account.email,password:"changed-safe-password"})).status).toBe(200);
  expect(JSON.stringify(memory.account)).not.toContain("changed-safe-password");
 });
 it("rejects anonymous password changes",async()=>{expect((await request("change-password",{currentPassword:account.password,newPassword:"changed-safe-password"})).status).toBe(401);});
});
