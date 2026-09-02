import { describe,expect,it } from "vitest";
import { confirmedProfileValue,parseConfirmedFacts } from "./facts";
describe("confirmed commercial facts",()=>{
 it("prefers current primary/subprofile keys",()=>{const facts=parseConfirmedFacts([{questionKey:"primaryProfile",answer:"latino_extranjero"},{questionKey:"subProfile",answer:"parado_desempleado"}]);expect(confirmedProfileValue(facts)).toBe("latino_extranjero");expect(facts.subProfile).toEqual({kind:"value",value:"parado_desempleado"});});
 it("tags explicitly supported legacy keys",()=>{const facts=parseConfirmedFacts([{questionKey:"profile",answer:"old-profile"},{questionKey:"subprofile",answer:"old-sub"}]);expect(confirmedProfileValue(facts)).toBe("legacy:profile:old-profile");expect(facts.subProfile).toEqual({kind:"legacy",key:"subprofile",value:"old-sub"});});
});
