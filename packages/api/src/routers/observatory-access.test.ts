import {beforeEach,describe,expect,it,vi} from "vitest";
import type {Context} from "../context";
const mocks=vi.hoisted(()=>({settings:vi.fn(),read:vi.fn()}));
vi.mock("../users/services/navigation-visibility",()=>({getNavigationVisibility:mocks.settings}));
vi.mock("../commercial-evidence/service",()=>({listEvidenceCurrencies:mocks.read,listEvidenceLeads:vi.fn(),getLeadEvidence:vi.fn(),getMicrosegments:vi.fn(),getConfidenceCentre:vi.fn()}));
vi.mock("../alerts/services/index",()=>({processRecurringAlerts:vi.fn()}));vi.mock("../leads/services/index",()=>({isCloserOf:vi.fn(),hasCloserSession:vi.fn()}));
import {commercialEvidenceRouter} from "./commercial-evidence";
const date=new Date();
function context(roleId:string):Context{return {session:{session:{id:"s",token:"t",userId:"u",expiresAt:date,createdAt:date,updatedAt:date},user:{id:"u",name:"User",email:"u@example.com",emailVerified:true,accessStatus:"active",createdAt:date,updatedAt:date,roleId,leadActive:"",scoring:0}},role:{id:roleId,name:roleId,permissions:["leads:read"]},permissions:["leads:read"]};}
beforeEach(()=>{vi.clearAllMocks();mocks.settings.mockResolvedValue({configured:false,roleIdsByModule:{}});mocks.read.mockResolvedValue(["EUR"]);});
describe("direct observatory API requests",()=>{
 it("denies anonymous requests before reading data",async()=>{await expect(commercialEvidenceRouter.createCaller({session:null,role:null,permissions:[]}).currencies()).rejects.toMatchObject({code:"UNAUTHORIZED"});expect(mocks.read).not.toHaveBeenCalled()});
 for(const role of ["role-caller","role-closer"])it("blocks direct request for default "+role,async()=>{await expect(commercialEvidenceRouter.createCaller(context(role)).currencies()).rejects.toMatchObject({code:"FORBIDDEN"});expect(mocks.read).not.toHaveBeenCalled()});
 it("permits grant and immediately enforces revocation on subsequent requests",async()=>{const caller=commercialEvidenceRouter.createCaller(context("role-caller"));mocks.settings.mockResolvedValueOnce({configured:true,roleIdsByModule:{"commercial-observatory":["role-caller"]}});expect(await caller.currencies()).toEqual(["EUR"]);expect(mocks.read).toHaveBeenCalledWith({actorId:"u",admin:false});mocks.read.mockClear();await expect(caller.currencies()).rejects.toMatchObject({code:"FORBIDDEN"});expect(mocks.read).not.toHaveBeenCalled();});
 it("does not elevate granted callers to administrative analysis",async()=>{mocks.settings.mockResolvedValue({configured:true,roleIdsByModule:{"commercial-observatory":["role-caller"]}});await expect(commercialEvidenceRouter.createCaller(context("role-caller")).confidence({asOf:date})).rejects.toMatchObject({code:"FORBIDDEN"});});
});
