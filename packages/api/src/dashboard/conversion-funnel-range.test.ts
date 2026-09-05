import {describe,expect,it} from "vitest";
import {inclusiveMadridCalendarRange} from "../commercial-observatory/domain";
describe("funnel Madrid calendar boundaries",()=>{
 it("includes the full spring DST day rather than server-local midnight",()=>{const r=inclusiveMadridCalendarRange("2026-03-29","2026-03-29");expect(r.from.toISOString()).toBe("2026-03-28T23:00:00.000Z");expect(r.to.toISOString()).toBe("2026-03-29T21:59:59.999Z");});
 it("includes the full autumn 25-hour day",()=>{const r=inclusiveMadridCalendarRange("2026-10-25","2026-10-25");expect(r.to.getTime()-r.from.getTime()+1).toBe(25*60*60*1000)});
 it("rejects invalid or reversed dates",()=>{expect(()=>inclusiveMadridCalendarRange("2026-02-30","2026-03-01")).toThrow();expect(()=>inclusiveMadridCalendarRange("2026-03-01","2026-02-28")).toThrow();});
});