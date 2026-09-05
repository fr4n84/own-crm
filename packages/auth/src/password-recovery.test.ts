import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as unknown[][], writes: [] as unknown[], transaction: vi.fn(), hash: vi.fn() }));
vi.mock("@crm-fran/db", () => ({ db: { transaction: state.transaction }, eq: (...args: unknown[]) => args, and: (...args: unknown[]) => args }));
vi.mock("better-auth/crypto", () => ({ hashPassword: state.hash }));
import { issuePasswordResetCode, redeemPasswordResetCode, resetCodeDigest } from "./password-recovery";
function select() { const row = state.rows.shift() ?? []; const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, limit: () => chain, for: () => Promise.resolve(row), then: (resolve: (rows: unknown[]) => void) => resolve(row) }; return chain; }
function write(kind: string) { const chain = { values: (value: unknown) => { state.writes.push([kind,value]); return Promise.resolve(); }, set: (value: unknown) => { state.writes.push([kind,value]); return chain; }, where: () => { state.writes.push(kind); return chain; }, returning: () => Promise.resolve([{id:"account"}]), then: (resolve: () => void) => resolve() }; return chain; }
beforeEach(() => { state.rows=[]; state.writes=[]; vi.clearAllMocks(); state.hash.mockResolvedValue("hashed-new-password"); state.transaction.mockImplementation(async (fn) => fn({ select, insert: () => write("insert"), update: () => write("update"), delete: () => write("delete") })); });
describe("isolated password recovery transaction", () => {
 it("only issues after fresh stored admin permission and stores a digest, never the code", async () => {
  state.rows=[[{permissions:["*"]}], [{id:"target"}], [{id:"credential"}]];
  const result=await issuePasswordResetCode("admin","target");
  expect(result.code).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(result.expiresAt.getTime()-Date.now()).toBeGreaterThan(14*60*1000);
  expect(JSON.stringify(state.writes)).not.toContain(result.code); expect(JSON.stringify(state.writes)).toContain(resetCodeDigest(result.code));
  expect(state.writes[0]).toBe("delete");
 });
 it("rejects a stale admin session based on the stored role", async () => { state.rows=[[{permissions:["users:*"]}]]; await expect(issuePasswordResetCode("former-admin","target")).rejects.toThrow("administración"); expect(state.writes).toEqual([]); });
 it("consumes a user-bound code, updates hash and revokes sessions inside one transaction", async () => {
  const code="A".repeat(43); state.rows=[[{id:"target"}], [{id:"reset",value:resetCodeDigest(code),expiresAt:new Date(Date.now()+60000)}]];
  await redeemPasswordResetCode({email:"target@example.com",code,newPassword:"new-safe-password"});
  expect(state.hash).toHaveBeenCalledWith("new-safe-password"); expect(state.transaction).toHaveBeenCalledTimes(1); expect(state.writes.filter(x=>x==="delete")).toHaveLength(2); expect(JSON.stringify(state.writes)).not.toContain("new-safe-password");
 });
 for(const token of [undefined,{id:"reset",value:resetCodeDigest("B".repeat(43)),expiresAt:new Date(Date.now()+60000)},{id:"reset",value:resetCodeDigest("A".repeat(43)),expiresAt:new Date(0)}]) {
  it("rejects missing, wrong and expired codes without hashing or mutations", async () => {state.rows=[[{id:"target"}],token?[token]:[]]; await expect(redeemPasswordResetCode({email:"target@example.com",code:"A".repeat(43),newPassword:"new-safe-password"})).rejects.toThrow("Código inválido o caducado"); expect(state.hash).not.toHaveBeenCalled(); expect(state.writes).toEqual([]);});
 }
 it("uses the same error for an unknown account", async () => {state.rows=[[]]; await expect(redeemPasswordResetCode({email:"absent@example.com",code:"A".repeat(43),newPassword:"new-safe-password"})).rejects.toThrow("Código inválido o caducado"); expect(state.hash).not.toHaveBeenCalled();});
 it("bounds malformed code and password before database work", async () => {await expect(redeemPasswordResetCode({email:"target@example.com",code:"short",newPassword:"x"})).rejects.toThrow(); expect(state.transaction).not.toHaveBeenCalled();});
 it("propagates transaction failure instead of reporting success", async () => {state.transaction.mockRejectedValueOnce(new Error("rollback")); await expect(issuePasswordResetCode("admin","target")).rejects.toThrow("rollback");});
});
