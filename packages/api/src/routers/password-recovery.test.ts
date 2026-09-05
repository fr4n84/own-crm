import { describe, expect, it, vi } from "vitest";
import type { Context } from "../context";
const recovery=vi.hoisted(()=>({issue:vi.fn(),redeem:vi.fn()}));
vi.mock("@crm-fran/auth/password-recovery",async()=>{const { z }=await import("zod");return { issuePasswordResetCode:recovery.issue,redeemPasswordResetCode:recovery.redeem,PasswordRecoveryError:class extends Error {},passwordRecoveryInput:z.object({email:z.email(),code:z.string().length(43),newPassword:z.string().min(8).max(128)})};});
vi.mock("@crm-fran/db",()=>({db:{},eq:vi.fn(),and:vi.fn()}));
vi.mock("../users/services/list-closers",()=>({listClosers:vi.fn()}));
vi.mock("../users/services/list-user-access",()=>({listUserAccess:vi.fn()}));
vi.mock("../users/services/navigation-visibility",()=>({getNavigationVisibility:vi.fn(),updateNavigationVisibility:vi.fn()}));
vi.mock("../alerts/services/index",()=>({processRecurringAlerts:vi.fn()}));
vi.mock("../leads/services/index",()=>({isCloserOf:vi.fn(),hasCloserSession:vi.fn()}));
import {usersRouter} from "./users";import {authRouter} from "./auth";
const guest={session:null,role:null,permissions:[]} satisfies Context;
describe("recovery transport authorization",()=>{
 it("requires a session for issue",async()=>{await expect(usersRouter.createCaller(guest).issuePasswordResetCode({userId:"target"})).rejects.toMatchObject({code:"UNAUTHORIZED"});expect(recovery.issue).not.toHaveBeenCalled();});
 it("rejects non-admin issuance",async()=>{const ctx={...guest,session:{user:{id:"caller"}},permissions:["users:*"]} as Context;await expect(usersRouter.createCaller(ctx).issuePasswordResetCode({userId:"target"})).rejects.toMatchObject({code:"FORBIDDEN"});});
 it("supports sessionless code redemption",async()=>{recovery.redeem.mockResolvedValue({status:true});const input={email:"user@example.com",code:"A".repeat(43),newPassword:"new-password"};await expect(authRouter.createCaller(guest).redeemPasswordReset(input)).resolves.toEqual({status:true});expect(recovery.redeem).toHaveBeenCalledWith(input);});
 it("bounds password input before service",async()=>{recovery.redeem.mockClear();await expect(authRouter.createCaller(guest).redeemPasswordReset({email:"user@example.com",code:"A".repeat(43),newPassword:"short"})).rejects.toMatchObject({code:"BAD_REQUEST"});expect(recovery.redeem).not.toHaveBeenCalled();});
});