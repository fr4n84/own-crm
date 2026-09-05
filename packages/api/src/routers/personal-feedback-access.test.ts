import {beforeEach,describe,expect,it,vi} from "vitest";import type {Context} from "../context";
const mocks=vi.hoisted(()=>({read:vi.fn()}));vi.mock("../leads/services/index",()=>({getFeedbackStatistics:mocks.read,isCloserOf:vi.fn(),hasCloserSession:vi.fn()}));vi.mock("../alerts/services/index",()=>({processRecurringAlerts:vi.fn()}));vi.mock("../call-feedback-runtime",()=>({getMonthlyCallFeedbackUsage:vi.fn()}));vi.mock("../users/services/navigation-visibility",()=>({getNavigationVisibility:vi.fn()}));
import {leadsRouter} from "./leads";
const date=new Date();function context(admin=false):Context{return {session:{session:{id:"s",token:"t",userId:"u",expiresAt:date,createdAt:date,updatedAt:date},user:{id:"u",name:"User",email:"u@example.com",emailVerified:true,createdAt:date,updatedAt:date,roleId:admin?"role-admin":"role-caller",leadActive:"",scoring:0}},role:null,permissions:admin?["*"]:["leads:read"]};}
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockResolvedValue({})});
describe("personal feedback cannot bypass observatory",()=>{
 it("binds omitted caller to signed-in identity including service metadata scope",async()=>{await leadsRouter.createCaller(context()).feedbackStatistics({});expect(mocks.read).toHaveBeenCalledWith({callerId:"u"},"u")});
 it("rejects another caller",async()=>{await expect(leadsRouter.createCaller(context()).feedbackStatistics({callerId:"victim"})).rejects.toMatchObject({code:"FORBIDDEN"});expect(mocks.read).not.toHaveBeenCalled()});
 it("preserves own personal feedback",async()=>{await leadsRouter.createCaller(context()).feedbackStatistics({callerId:"u"});expect(mocks.read).toHaveBeenCalledWith({callerId:"u"},"u")});
 it("retains global admin statistics",async()=>{await leadsRouter.createCaller(context(true)).feedbackStatistics({});expect(mocks.read).toHaveBeenCalledWith({},undefined)});
});