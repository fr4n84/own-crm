import { describe,expect,it } from "vitest";
import { recommendationEventInput } from "./alerts";
describe("recommendation evidence boundary",()=>{it("discards client-controlled evidence snapshots",()=>{const parsed=recommendationEventInput.parse({leadId:"lead",recommendationKey:"risk:key",kind:"recommendation_shown",actionType:"no_contact",evidenceSnapshot:{probabilityBps:10000}});expect(parsed).not.toHaveProperty("evidenceSnapshot");});});
