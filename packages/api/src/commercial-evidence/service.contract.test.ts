import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildConfidenceReport, canReadEvidenceLead } from "./service";
import { parseEvidenceSnapshot } from "./domain";
describe("commercial evidence boundaries",()=>{
 it("allows wildcard or current ownership only",()=>{expect(canReadEvidenceLead({actorId:"caller",admin:false,callerId:"caller",closerId:null})).toBe(true);expect(canReadEvidenceLead({actorId:"other",admin:false,callerId:"caller",closerId:"closer"})).toBe(false);expect(canReadEvidenceLead({actorId:"admin",admin:true,callerId:null,closerId:null})).toBe(true);});
 it("keeps admin analytics wildcard-only and accepts no client snapshot",()=>{const router=readFileSync(resolve(process.cwd(),"src/routers/commercial-evidence.ts"),"utf8");expect(router).toContain('microsegments:permittedProcedure(["*"])');expect(router).toContain('confidence:permittedProcedure(["*"])');expect(router).not.toContain("evidenceSnapshot");});
 it("contains no operational persistence",()=>{const source=readFileSync(resolve(process.cwd(),"src/commercial-evidence/service.ts"),"utf8");expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);});
 it("uses private server configuration rather than an embedded reference key",()=>{const domain=readFileSync(resolve(process.cwd(),"src/commercial-evidence/domain.ts"),"utf8");const service=readFileSync(resolve(process.cwd(),"src/commercial-evidence/service.ts"),"utf8");expect(domain).not.toContain('crm-fran:commercial-evidence:v1');expect(service).toContain("env.BETTER_AUTH_SECRET");});
 it("uses matured shown snapshots as the coverage denominator",()=>{const snapshot=parseEvidenceSnapshot({policyVersion:"v1",asOf:"2025-01-01T00:00:00.000Z",target:"sale",probabilityBps:5000,expectedMarginCents:null,currency:"EUR",fallback:"global",sample:30,confidence:"medium",features:{}})!;const report=buildConfidenceReport({asOf:new Date("2026-03-01"),cases:[],shown:[{leadId:"a",occurredAt:new Date("2026-01-01"),metadata:{evidenceSnapshot:snapshot}},{leadId:"b",occurredAt:new Date("2026-01-01"),metadata:{}}]});expect(report.coverage).toEqual({maturedShown:2,calibrated:1,rateBps:5000});expect(report.legacyExcluded).toBe(1);});
});
