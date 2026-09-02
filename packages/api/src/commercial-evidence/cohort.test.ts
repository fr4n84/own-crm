import { describe,expect,it } from "vitest";
import { buildAsOfCases } from "./cohort";
describe("as-of commercial cohort",()=>{
 it("orders equal-time attribution before feedback and excludes future facts/outcomes",()=>{const time=new Date("2026-01-01");const [result]=buildAsOfCases({asOf:time,leads:[{id:"lead",createdAt:new Date("2025-01-01")}],financial:[],activities:[
  {id:"z-feedback",leadId:"lead",kind:"caller_feedback",occurredAt:time,description:null,metadata:{questions:[{questionKey:"primaryProfile",answer:"parado_desempleado"}]}},
  {id:"a-created",leadId:"lead",kind:"lead_created",occurredAt:time,description:null,metadata:{source:"Meta"}},
  {id:"future",leadId:"lead",kind:"closer_feedback",occurredAt:new Date("2026-01-02"),description:"Venta",metadata:{}},
 ]});expect(result?.acquisition.source).toBe("Meta");expect(result?.facts.primaryProfile).toEqual({kind:"value",value:"parado_desempleado"});expect(result?.sold).toBe(false);});
 it("splits assignment epochs and attributes the outcome only to the active epoch",()=>{const results=buildAsOfCases({asOf:new Date("2026-03-01"),leads:[{id:"lead",createdAt:new Date("2025-01-01")}],financial:[],activities:[
  {id:"a",leadId:"lead",kind:"caller_assigned",occurredAt:new Date("2026-01-01"),description:null,metadata:{userId:"caller-a"}},
  {id:"old-feedback",leadId:"lead",kind:"caller_feedback",occurredAt:new Date("2026-01-10"),description:null,metadata:{questions:[{questionKey:"primaryProfile",answer:"parado_desempleado"}]}},
  {id:"b",leadId:"lead",kind:"caller_assigned",occurredAt:new Date("2026-01-15"),description:null,metadata:{userId:"caller-b"}},
  {id:"new-feedback",leadId:"lead",kind:"caller_feedback",occurredAt:new Date("2026-01-20"),description:null,metadata:{questions:[{questionKey:"primaryProfile",answer:"latino_extranjero"}]}},
  {id:"sale",leadId:"lead",kind:"closer_feedback",occurredAt:new Date("2026-02-01"),description:"Venta",metadata:{}},
 ]});expect(results).toHaveLength(2);expect(results[0]).toMatchObject({callerId:"caller-a",sold:false});expect(results[0]?.facts.primaryProfile).toEqual({kind:"value",value:"parado_desempleado"});expect(results[1]).toMatchObject({callerId:"caller-b",sold:true});expect(results[1]?.facts.primaryProfile).toEqual({kind:"value",value:"latino_extranjero"});});
 it("does not leak feedback recorded after an epoch outcome",()=>{const [result]=buildAsOfCases({asOf:new Date("2026-03-01"),leads:[{id:"lead",createdAt:new Date("2025-01-01")}],financial:[],activities:[
  {id:"sale",leadId:"lead",kind:"closer_feedback",occurredAt:new Date("2026-02-01"),description:"Venta",metadata:{}},
  {id:"late",leadId:"lead",kind:"caller_feedback",occurredAt:new Date("2026-02-02"),description:null,metadata:{questions:[{questionKey:"primaryProfile",answer:"latino_extranjero"}]}},
 ]});expect(result?.facts.primaryProfile).toEqual({kind:"missing"});});
 it("coalesces caller and closer assignments made at the same instant",()=>{const results=buildAsOfCases({asOf:new Date("2026-03-01"),leads:[{id:"lead",createdAt:new Date("2025-01-01")}],financial:[],activities:[{id:"caller",leadId:"lead",kind:"caller_assigned",occurredAt:new Date("2026-01-01"),description:null,metadata:{userId:"caller-a"}},{id:"closer",leadId:"lead",kind:"closer_assigned",occurredAt:new Date("2026-01-01"),description:null,metadata:{userId:"closer-a"}}]});expect(results).toHaveLength(1);expect(results[0]).toMatchObject({callerId:"caller-a",closerId:"closer-a"});});
 it("reconstructs legacy owners when no assignment events exist",()=>{const [result]=buildAsOfCases({asOf:new Date("2026-03-01"),leads:[{id:"legacy",createdAt:new Date("2025-01-01"),callerId:"caller-legacy",closerId:"closer-legacy"}],financial:[],activities:[]});expect(result).toMatchObject({callerId:"caller-legacy",closerId:"closer-legacy"});});
 it("keeps the legacy closer when only caller assignment events exist",()=>{const [result]=buildAsOfCases({asOf:new Date("2026-03-01"),leads:[{id:"mixed",createdAt:new Date("2025-01-01"),callerId:"caller-current",closerId:"closer-legacy"}],financial:[],activities:[{id:"caller",leadId:"mixed",kind:"caller_assigned",occurredAt:new Date("2026-01-01"),description:null,metadata:{userId:"caller-event"}}]});expect(result).toMatchObject({callerId:"caller-event",closerId:"closer-legacy"});});
 it("keeps the legacy caller when only closer assignment events exist",()=>{const [result]=buildAsOfCases({asOf:new Date("2026-03-01"),leads:[{id:"mixed",createdAt:new Date("2025-01-01"),callerId:"caller-legacy",closerId:"closer-current"}],financial:[],activities:[{id:"closer",leadId:"mixed",kind:"closer_assigned",occurredAt:new Date("2026-01-01"),description:null,metadata:{userId:"closer-event"}}]});expect(result).toMatchObject({callerId:"caller-legacy",closerId:"closer-event"});});
});
